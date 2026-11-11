<?php

declare(strict_types=1);

ini_set('display_errors', '0');
header('X-Robots-Tag: noindex, nofollow');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
header("Content-Security-Policy: default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");

$local = PHP_SAPI === 'cli-server';
if (!$local && (empty($_SERVER['HTTPS']) || $_SERVER['HTTPS'] === 'off')) {
    http_response_code(403);
    exit('HTTPS is required.');
}
$private = $local ? dirname(__DIR__, 2) . '/private' : dirname($_SERVER['DOCUMENT_ROOT']) . '/portfolio-private';
require $private . '/projects.php';
require $private . '/admin-actions.php';

ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
session_name('DJPortfolioAdmin');
session_set_cookie_params([
    'path' => $local ? '/admin/' : '/portfolio-api/admin/',
    'secure' => !$local,
    'httponly' => true,
    'samesite' => 'Strict',
]);
session_start();
if (isset($_SESSION['seen']) && time() - $_SESSION['seen'] > 1800) {
    $_SESSION = [];
    session_regenerate_id(true);
}
$_SESSION['csrf'] ??= bin2hex(random_bytes(32));
$hash = portfolioSettings($private)['ADMIN_PASSWORD_HASH'] ?? '';
$configured = password_get_info($hash)['algo'] !== null;
$authenticated = $configured && hash_equals(hash('sha256', $hash), $_SESSION['auth'] ?? '');
if ($authenticated) {
    $_SESSION['seen'] = time();
}

function e(mixed $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function csrf(): void
{
    echo '<input type="hidden" name="csrf" value="' . e($_SESSION['csrf']) . '">';
}

function back(): never
{
    header('Location: ./', true, 303);
    exit;
}

function login(string $private, string $hash): bool
{
    $password = $_POST['password'] ?? '';
    if (!is_string($password) || strlen($password) > 1024) {
        $password = '';
    }
    $ip = hash('sha256', $_SERVER['REMOTE_ADDR'] ?? '');
    return withLock($private . '/login-attempts.json', static function ($file) use ($hash, $ip, $password): bool {
        $now = time();
        $attempts = array_values(array_filter(json_decode(stream_get_contents($file), true) ?: [],
            static fn (array $event): bool => $event['time'] > $now - 900));
        $fromIp = array_filter($attempts, static fn (array $event): bool => $event['ip'] === $ip);
        if (count($fromIp) >= 5 || count($attempts) >= 60) {
            http_response_code(429);
            return false;
        }
        if (password_verify($password, $hash)) {
            return true;
        }
        $attempts[] = ['time' => $now, 'ip' => $ip];
        saveState($file, $attempts);
        return false;
    });
}

function mutate(PDO $db, string $private, string $action, array $repos, bool $githubAvailable): void
{
    $media = dirname(__DIR__) . '/media';
    withLock($private . '/catalog.json', static function ($file) use ($db, $action, $repos, $media, $githubAvailable): void {
        $uploaded = null;
        $db->beginTransaction();
        try {
            $removed = updateAdmin($db, $action, $repos, $media, $uploaded);
            // A prior snapshot may contain a project that is about to become hidden.
            saveState($file, []);
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            removeImage($media, $uploaded);
            throw $error;
        }
        removeImage($media, $removed);
        error_log('Portfolio admin saved ' . $action);
        try {
            if ($githubAvailable) {
                saveState($file, readCatalog($db, $repos));
            }
        } catch (Throwable) {
            error_log('Portfolio admin could not refresh the public snapshot.');
        }
    });
}

$message = $_SESSION['message'] ?? '';
unset($_SESSION['message']);
$action = $_POST['action'] ?? '';
$post = $_SERVER['REQUEST_METHOD'] === 'POST';
$validToken = is_string($_POST['csrf'] ?? null) && hash_equals($_SESSION['csrf'], $_POST['csrf']);
$db = null;
$repos = [];
$rows = [];
$categories = [];
$tags = [];
$assignments = [];
$selected = null;
$selectedRepo = null;
$editing = false;

try {
    if ($post && !$validToken) {
        http_response_code(403);
        throw new DomainException('This form expired. Reload the page and try again.');
    }
    if ($post && $action === 'login' && !$authenticated && $configured) {
        if (!login($private, $hash)) {
            if (http_response_code() !== 429) {
                http_response_code(401);
            }
            throw new DomainException('Sign-in failed. Check your password or try again in 15 minutes.');
        }
        session_regenerate_id(true);
        $_SESSION = ['auth' => hash('sha256', $hash), 'csrf' => bin2hex(random_bytes(32)), 'seen' => time()];
        back();
    }
    if ($post && $action === 'logout' && $authenticated) {
        $_SESSION = [];
        session_regenerate_id(true);
        back();
    }
    if ($post && !$authenticated) {
        http_response_code(403);
        throw new DomainException('Sign in to continue.');
    }
    if ($authenticated) {
        $db = portfolioDb($private);
        $githubAvailable = true;
        try {
            $repos = githubProjects($private . '/github-v2.json');
        } catch (Throwable) {
            $githubAvailable = false;
            $message = 'GitHub is temporarily unavailable. You can still edit saved projects.';
        }
        if ($post) {
            if (!is_string($action)) {
                throw new DomainException('Unknown action.');
            }
            if (!$githubAvailable && $action === 'category-delete' && ($_POST['id'] ?? '') === '2') {
                throw new DomainException('Wait for GitHub to reconnect before deleting this category.');
            }
            mutate($db, $private, $action, $repos, $githubAvailable);
            $_SESSION['message'] = 'Changes saved.';
            back();
        }
        $rows = sql($db, 'SELECT * FROM projects ORDER BY pinned DESC, sort_order, id')->fetchAll();
        $categories = sql($db, 'SELECT * FROM categories ORDER BY sort_order, id')->fetchAll();
        $tags = sql($db, 'SELECT * FROM tags ORDER BY name')->fetchAll();
        $assignments = projectTagIds($db);
        $repos = array_column($repos, null, 'id');
        $editId = filter_input(INPUT_GET, 'edit', FILTER_VALIDATE_INT);
        $repoId = $_GET['repo'] ?? null;
        $selected = $editId ? (array_column($rows, null, 'id')[$editId] ?? null) : null;
        $selectedRepo = $selected ? ($repos[$selected['github_id']] ?? null)
            : (is_string($repoId) ? ($repos[$repoId] ?? null) : null);
        $editing = $selected || $selectedRepo || isset($_GET['new']);
    }
} catch (DomainException $error) {
    $message = $error->getMessage();
} catch (PDOException $error) {
    $message = $error->getCode() === '23000'
        ? 'That name or slug is already in use, or the item is still referenced.'
        : 'Database unavailable. Check the private configuration and run setup.';
} catch (Throwable) {
    $message = 'Could not complete the request. Check the server configuration and try again.';
    error_log('Portfolio admin request failed.');
}
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex,nofollow">
    <title>Portfolio admin</title>
    <link rel="stylesheet" href="admin.css">
</head>
<body>
<main>
    <h1>Portfolio admin</h1>
    <?php if ($message): ?><p role="status" class="message"><?= e($message) ?></p><?php endif; ?>
    <?php if (!$authenticated): ?>
        <?php if (!$configured): ?><p>Set the admin password hash in the private configuration to enable sign-in.</p>
        <?php else: ?>
            <form method="post">
                <?php csrf(); ?>
                <input type="hidden" name="action" value="login">
                <label>Password <input type="password" name="password" autocomplete="current-password" required></label>
                <button>Sign in</button>
            </form>
        <?php endif; ?>
    <?php else: ?>
        <form method="post" class="inline"><?php csrf(); ?><button name="action" value="logout">Sign out</button></form>
        <?php if ($post && $message): ?><p><a href="./">Back to admin</a></p><?php endif; ?>
        <section>
            <h2>Projects</h2>
            <p><a href="?new=1">Add a case study</a>. Pinned projects appear first. Lower order numbers appear before higher ones.</p>
            <?php if ($editing): ?>
                <form method="post" enctype="multipart/form-data" class="panel">
                    <?php csrf(); ?>
                    <input type="hidden" name="id" value="<?= e($selected['id'] ?? 0) ?>">
                    <input type="hidden" name="github_id" value="<?= e($selectedRepo['id'] ?? '') ?>">
                    <h3><?= e($selectedRepo['name'] ?? ($selected['title'] ?? 'New case study')) ?></h3>
                    <label>Title <input name="title" maxlength="160" value="<?= e($selected['title'] ?? '') ?>"
                        placeholder="<?= e($selectedRepo['name'] ?? '') ?>" <?= !$selectedRepo && empty($selected['github_id']) ? 'required' : '' ?>></label>
                    <label>Description <textarea name="description" maxlength="5000" rows="4"><?= e($selected['description'] ?? '') ?></textarea></label>
                    <label>Category <select name="category_id" required>
                        <?php foreach ($categories as $category): ?>
                            <option value="<?= e($category['id']) ?>" <?= (int) ($selected['category_id'] ?? 2) === (int) $category['id'] ? 'selected' : '' ?>>
                                <?= e($category['name']) ?>
                            </option>
                        <?php endforeach; ?>
                    </select></label>
                    <fieldset><legend>Existing tags</legend>
                        <?php foreach ($tags as $tag): ?>
                            <label class="check"><input type="checkbox" name="tags[]" value="<?= e($tag['id']) ?>"
                                <?= in_array((int) $tag['id'], $assignments[$selected['id'] ?? 0] ?? [], true) ? 'checked' : '' ?>>
                                <?= e($tag['name']) ?></label>
                        <?php endforeach; ?>
                        <?php if (!$tags): ?><p>Add tags in the Tags section first.</p><?php endif; ?>
                    </fieldset>
                    <label>Image <input type="file" name="image" accept="image/jpeg,image/png,image/webp"></label>
                    <label>Image alt text <input name="image_alt" maxlength="180" value="<?= e($selected['image_alt'] ?? '') ?>"></label>
                    <?php if (!empty($selected['image'])): ?>
                        <img width="160" src="../media/<?= e(rawurlencode($selected['image'])) ?>" alt="<?= e($selected['image_alt'] ?? 'Current project image') ?>">
                        <label class="check"><input type="checkbox" name="remove_image"> Remove image</label>
                    <?php endif; ?>
                    <label>Live demo URL <input type="url" name="live_url" maxlength="2048" value="<?= e($selected['live_url'] ?? '') ?>"></label>
                    <label>Order <input type="number" name="sort_order" min="-100000" max="100000" required value="<?= e($selected['sort_order'] ?? 0) ?>"></label>
                    <label class="check"><input type="checkbox" name="pinned" <?= !empty($selected['pinned']) ? 'checked' : '' ?>> Pin project</label>
                    <label class="check"><input type="checkbox" name="hidden" <?= !empty($selected['hidden']) ? 'checked' : '' ?>> Hide project</label>
                    <div class="actions">
                        <button name="action" value="project-save">Save project</button>
                        <?php if ($selected && $selected['github_id'] === null): ?>
                            <button name="action" value="project-delete" formnovalidate>Delete case study and image</button>
                        <?php endif; ?>
                        <a href="./">Cancel</a>
                    </div>
                </form>
            <?php endif; ?>
            <ul>
                <?php foreach ($rows as $row): ?>
                    <li><a href="?edit=<?= e($row['id']) ?>"><?= e($row['title'] ?? $repos[$row['github_id']]['name'] ?? ('GitHub repo #' . $row['github_id'])) ?></a>
                        <?= $row['hidden'] ? ' · Hidden' : '' ?><?= $row['pinned'] ? ' · Pinned' : '' ?>
                        · Order <?= e($row['sort_order']) ?></li>
                    <?php unset($repos[$row['github_id']]); ?>
                <?php endforeach; ?>
                <?php foreach ($repos as $repo): ?>
                    <li><a href="?repo=<?= e($repo['id']) ?>"><?= e($repo['name']) ?></a> · GitHub</li>
                <?php endforeach; ?>
            </ul>
        </section>
        <section>
            <h2>Categories</h2>
            <p>Move projects to another category before deleting a category in use.</p>
            <?php foreach (array_merge($categories, [['id' => 0, 'name' => '', 'slug' => '', 'sort_order' => 0]]) as $category): ?>
                <form method="post" class="panel taxonomy">
                    <?php csrf(); ?>
                    <input type="hidden" name="id" value="<?= e($category['id']) ?>">
                    <label>Name <input name="name" maxlength="80" required value="<?= e($category['name']) ?>"></label>
                    <label>Slug <input name="slug" maxlength="80" required value="<?= e($category['slug']) ?>" placeholder="client-work"></label>
                    <label>Order <input type="number" name="sort_order" min="-100000" max="100000" required value="<?= e($category['sort_order']) ?>"></label>
                    <div class="actions"><button name="action" value="category-save"><?= $category['id'] ? 'Save' : 'Add category' ?></button>
                    <?php if ($category['id']): ?><button name="action" value="category-delete" formnovalidate>Delete</button><?php endif; ?></div>
                </form>
            <?php endforeach; ?>
        </section>
        <section>
            <h2>Tags</h2>
            <?php foreach (array_merge($tags, [['id' => 0, 'name' => '']]) as $tag): ?>
                <form method="post" class="panel taxonomy">
                    <?php csrf(); ?>
                    <input type="hidden" name="id" value="<?= e($tag['id']) ?>">
                    <label>Name <input name="name" maxlength="60" required value="<?= e($tag['name']) ?>"></label>
                    <div class="actions"><button name="action" value="tag-save"><?= $tag['id'] ? 'Save' : 'Add tag' ?></button>
                    <?php if ($tag['id']): ?><button name="action" value="tag-delete" formnovalidate>Delete</button><?php endif; ?></div>
                </form>
            <?php endforeach; ?>
        </section>
    <?php endif; ?>
</main>
</body>
</html>
