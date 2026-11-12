<?php

declare(strict_types=1);

require_once __DIR__ . '/database.php';
require_once __DIR__ . '/github.php';

function catalogRows(PDO $db): array
{
    return sql($db, 'SELECT * FROM projects ORDER BY id')->fetchAll();
}

function projectTagIds(PDO $db): array
{
    $result = [];
    foreach (sql($db, 'SELECT project_id, tag_id FROM project_tags') as $row) {
        $result[$row['project_id']][] = (int) $row['tag_id'];
    }
    return $result;
}

function projectSamples(PDO $db, int $projectId): array
{
    return sql($db, 'SELECT image FROM project_samples WHERE project_id = ? ORDER BY position', [$projectId])
        ->fetchAll(PDO::FETCH_COLUMN);
}

function mergeCatalog(array $repos, array $rows, array $categories, array $tags, array $tagIds, array $samples = []): array
{
    $overrides = [];
    $entries = [];
    foreach ($rows as $row) {
        if ($row['github_id'] !== null) {
            $overrides[$row['github_id']] = $row;
        } else {
            $entries[] = [$row, null];
        }
    }
    foreach ($repos as $repo) {
        $entries[] = [$overrides[$repo['id']] ?? [], $repo];
    }

    $items = [];
    $usedCategories = [];
    foreach ($entries as [$row, $repo]) {
        if (!empty($row['hidden'])) {
            continue;
        }
        $category = $categories[$row['category_id'] ?? 2] ?? null;
        $category = $category ? array_intersect_key($category, array_flip(['name', 'slug']))
            : ['name' => 'Uncategorized', 'slug' => 'uncategorized'];
        $usedCategories[$category['slug']] = $category;
        $title = $row['title'] ?? $repo['name'];
        $items[] = [
            'id' => $repo ? 'github-' . $repo['id'] : 'custom-' . $row['id'],
            'title' => $title,
            'description' => $row['description'] ?? $repo['description'] ?? '',
            'category' => $category,
            'tags' => array_map(static fn (int $id): string => $tags[$id], $tagIds[$row['id'] ?? 0] ?? []),
            'image' => $row['image'] ?? null,
            'imageAlt' => $row['image_alt'] ?? $title,
            'samples' => $samples[$row['id'] ?? 0] ?? [],
            'repoUrl' => $repo ? 'https://github.com/EE2506/' . rawurlencode($repo['name']) : null,
            'liveUrl' => $row['live_url'] ?? null,
            'pinned' => (int) ($row['pinned'] ?? 0),
            'sort' => (int) ($row['sort_order'] ?? 0),
            'updated' => $repo['updated'] ?? $row['updated_at'] ?? '',
        ];
    }
    usort($items, static fn (array $a, array $b): int =>
        $b['pinned'] <=> $a['pinned'] ?: $a['sort'] <=> $b['sort']
        ?: strcmp($b['updated'], $a['updated']) ?: strcmp($a['id'], $b['id']));
    $ordered = [];
    foreach ($categories as $category) {
        if (isset($usedCategories[$category['slug']])) {
            $ordered[] = $usedCategories[$category['slug']];
            unset($usedCategories[$category['slug']]);
        }
    }
    return ['items' => $items, 'categories' => array_merge($ordered, array_values($usedCategories))];
}

function readCatalog(PDO $db, array $repos): array
{
    $db->beginTransaction();
    try {
        $rows = catalogRows($db);
        $categories = sql($db, 'SELECT id, name, slug FROM categories ORDER BY sort_order, id')
            ->fetchAll(PDO::FETCH_UNIQUE);
        $tags = sql($db, 'SELECT id, name FROM tags')->fetchAll(PDO::FETCH_KEY_PAIR);
        $samples = [];
        foreach (sql($db, 'SELECT project_id, image FROM project_samples ORDER BY project_id, position') as $sample) {
            $samples[$sample['project_id']][] = $sample['image'];
        }
        $result = mergeCatalog($repos, $rows, $categories, $tags, projectTagIds($db), $samples);
        $db->commit();
        return $result;
    } catch (Throwable $error) {
        $db->rollBack();
        throw $error;
    }
}

function publicCatalog(string $private): array
{
    try {
        $repos = githubProjects($private . '/github-v2.json');
        $githubAvailable = true;
    } catch (Throwable) {
        $repos = [];
        $githubAvailable = false;
    }
    return withLock($private . '/catalog.json', static function ($file) use ($private, $repos, $githubAvailable): array {
        $snapshot = json_decode(stream_get_contents($file), true);
        try {
            $catalog = readCatalog(portfolioDb($private), $repos);
        } catch (Throwable $error) {
            if (isset($snapshot['items'], $snapshot['categories'])) {
                return $snapshot;
            }
            throw $error;
        }
        if ($githubAvailable) {
            saveState($file, $catalog);
        }
        return $catalog;
    });
}
