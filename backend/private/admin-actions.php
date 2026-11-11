<?php

declare(strict_types=1);

function input(string $key, int $max, bool $required = false): string
{
    $value = $_POST[$key] ?? '';
    if (!is_string($value)) {
        throw new DomainException('Invalid field: ' . $key);
    }
    $value = trim($value);
    if (strlen($value) > $max || ($required && $value === '') || !preg_match('//u', $value)) {
        throw new DomainException('Check the length and value of ' . $key . '.');
    }
    return $value;
}

function number(string $key, int $min = 1, int $max = 2147483647): int
{
    $value = filter_var($_POST[$key] ?? '', FILTER_VALIDATE_INT,
        ['options' => ['min_range' => $min, 'max_range' => $max]]);
    if ($value === false) {
        throw new DomainException('Enter a valid number for ' . $key . '.');
    }
    return $value;
}

function imageType(string $path): array
{
    $types = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($path);
    $dimensions = @getimagesize($path);
    if (!isset($types[$mime]) || !$dimensions || $dimensions['mime'] !== $mime
        || $dimensions[0] < 1 || $dimensions[1] < 1 || $dimensions[0] * $dimensions[1] > 16000000) {
        throw new DomainException('Upload a valid JPEG, PNG, or WebP under 16 megapixels.');
    }
    return [$types[$mime], $dimensions[0], $dimensions[1]];
}

function storeImage(string $media): ?string
{
    $file = $_FILES['image'] ?? ['error' => UPLOAD_ERR_NO_FILE];
    if ($file['error'] === UPLOAD_ERR_NO_FILE) {
        return null;
    }
    if ($file['error'] !== UPLOAD_ERR_OK || $file['size'] > 5 * 1024 * 1024 || !is_uploaded_file($file['tmp_name'])) {
        throw new DomainException('Upload one image no larger than 5 MB.');
    }
    [$extension, $width, $height] = imageType($file['tmp_name']);
    $base = bin2hex(random_bytes(16));
    if (function_exists('imagewebp')) {
        $image = @imagecreatefromstring(file_get_contents($file['tmp_name']));
        if (!$image) {
            throw new DomainException('The image could not be decoded.');
        }
        $ratio = min(1, 1600 / max($width, $height));
        $image = imagescale($image, max(1, (int) round($width * $ratio)), max(1, (int) round($height * $ratio)));
        $name = $base . '.webp';
        if ($image && imagewebp($image, $media . '/' . $name, 82) && filesize($media . '/' . $name) > 0) {
            return $name;
        }
        removeImage($media, $name);
        throw new RuntimeException('Image encoding failed.');
    }
    // shortcut: hosts without GD retain validated originals, enable GD to resize and re-encode.
    $name = $base . '.' . $extension;
    if (!move_uploaded_file($file['tmp_name'], $media . '/' . $name)) {
        throw new RuntimeException('Image could not be stored.');
    }
    return $name;
}

function removeImage(string $media, ?string $name): void
{
    if ($name && preg_match('/\A[a-f0-9]{32}\.(jpg|png|webp)\z/', $name) && is_file($media . '/' . $name)
        && !@unlink($media . '/' . $name)) {
        error_log('Portfolio admin could not remove media.');
    }
}

function saveProject(PDO $db, array $repos, string $media, ?string &$uploaded): ?string
{
    $id = number('id', 0);
    $repoId = input('github_id', 20);
    $existing = $id ? sql($db, 'SELECT * FROM projects WHERE id = ? FOR UPDATE', [$id])->fetch() : null;
    if ($id && !$existing) {
        throw new DomainException('Project no longer exists.');
    }
    if (!$id && $repoId !== '' && !in_array($repoId, array_column($repos, 'id'), true)) {
        throw new DomainException('Select a repository from the GitHub feed.');
    }
    $repoId = $existing ? $existing['github_id'] : ($repoId ?: null);
    $title = input('title', 160, $repoId === null);
    $description = input('description', 5000);
    $alt = input('image_alt', 180);
    $url = input('live_url', 2048);
    if ($url !== '' && (!filter_var($url, FILTER_VALIDATE_URL) || !preg_match('~\Ahttps?://~i', $url))) {
        throw new DomainException('Enter an HTTP or HTTPS link.');
    }
    $category = number('category_id');
    $order = number('sort_order', -100000, 100000);
    $tagIds = $_POST['tags'] ?? [];
    if (!is_array($tagIds) || count($tagIds) > 50) {
        throw new DomainException('Select up to 50 existing tags.');
    }
    $validTags = array_map('strval', sql($db, 'SELECT id FROM tags')->fetchAll(PDO::FETCH_COLUMN));
    foreach ($tagIds as $tag) {
        if (!is_string($tag) || !in_array($tag, $validTags, true)) {
            throw new DomainException('A selected tag no longer exists.');
        }
    }
    $uploaded = storeImage($media);
    $oldImage = $existing['image'] ?? null;
    $image = $uploaded ?? (isset($_POST['remove_image']) ? null : $oldImage);
    $values = [$title === '' ? null : $title, $description === '' ? null : $description, $category,
        $image, $alt === '' ? null : $alt, $url === '' ? null : $url,
        (int) isset($_POST['hidden']), (int) isset($_POST['pinned']), $order];
    if ($id) {
        sql($db, 'UPDATE projects SET title=?, description=?, category_id=?, image=?, image_alt=?,
            live_url=?, hidden=?, pinned=?, sort_order=? WHERE id=?', [...$values, $id]);
    } else {
        sql($db, 'INSERT INTO projects (title, description, category_id, image, image_alt,
            live_url, hidden, pinned, sort_order, github_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [...$values, $repoId]);
        $id = (int) $db->lastInsertId();
    }
    sql($db, 'DELETE FROM project_tags WHERE project_id=?', [$id]);
    foreach (array_unique($tagIds) as $tag) {
        sql($db, 'INSERT INTO project_tags (project_id, tag_id) VALUES (?, ?)', [$id, $tag]);
    }
    return $oldImage !== $image ? $oldImage : null;
}

function updateAdmin(PDO $db, string $action, array $repos, string $media, ?string &$uploaded): ?string
{
    switch ($action) {
        case 'project-save':
            return saveProject($db, $repos, $media, $uploaded);
        case 'project-delete':
            $id = number('id');
            $row = sql($db, 'SELECT image FROM projects WHERE id=? AND github_id IS NULL FOR UPDATE', [$id])->fetch();
            if (!$row) {
                throw new DomainException('Only custom projects can be deleted. Hide GitHub projects instead.');
            }
            sql($db, 'DELETE FROM projects WHERE id=? AND github_id IS NULL', [$id]);
            return $row['image'];
        case 'category-save':
            $name = input('name', 80, true);
            $slug = input('slug', 80, true);
            if (!preg_match('/\A[a-z0-9]+(?:-[a-z0-9]+)*\z/', $slug) || $slug === 'uncategorized') {
                throw new DomainException('Use a slug with lowercase letters, numbers, and hyphens.');
            }
            $id = number('id', 0);
            $order = number('sort_order', -100000, 100000);
            if ($id) {
                sql($db, 'UPDATE categories SET name=?, slug=?, sort_order=? WHERE id=?', [$name, $slug, $order, $id]);
            } else {
                sql($db, 'INSERT INTO categories (name, slug, sort_order) VALUES (?, ?, ?)', [$name, $slug, $order]);
            }
            break;
        case 'category-delete':
            $id = number('id');
            $used = sql($db, 'SELECT 1 FROM projects WHERE category_id=? LIMIT 1', [$id])->fetchColumn();
            $implicit = $id === 2 && array_diff(array_column($repos, 'id'),
                sql($db, 'SELECT github_id FROM projects WHERE github_id IS NOT NULL')->fetchAll(PDO::FETCH_COLUMN));
            if ($used || $implicit) {
                throw new DomainException('Move all projects in this category before deleting it.');
            }
            sql($db, 'DELETE FROM categories WHERE id=?', [$id]);
            break;
        case 'tag-save':
            $id = number('id', 0);
            $name = input('name', 60, true);
            if ($id) {
                sql($db, 'UPDATE tags SET name=? WHERE id=?', [$name, $id]);
            } else {
                sql($db, 'INSERT INTO tags (name) VALUES (?)', [$name]);
            }
            break;
        case 'tag-delete':
            sql($db, 'DELETE FROM tags WHERE id=?', [number('id')]);
            break;
        default:
            throw new DomainException('Unknown action.');
    }
    return null;
}
