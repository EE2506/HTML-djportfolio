<?php

declare(strict_types=1);

require dirname(__DIR__) . '/private/projects.php';
require dirname(__DIR__) . '/private/admin-actions.php';

function check(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$repos = [
    ['id' => '101', 'name' => 'renamed-repo', 'description' => 'GitHub description', 'updated' => '2026-10-01'],
    ['id' => '102', 'name' => 'hidden-repo', 'description' => '', 'updated' => '2026-10-02'],
    ['id' => '103', 'name' => 'another-repo', 'description' => '', 'updated' => '2026-10-03'],
];
$rows = [
    ['id' => 1, 'github_id' => '101', 'title' => 'Custom title', 'category_id' => 1, 'pinned' => 1],
    ['id' => 2, 'github_id' => '102', 'hidden' => 1, 'category_id' => 1],
    ['id' => 3, 'github_id' => null, 'title' => 'Case study', 'category_id' => 1, 'sort_order' => -1],
    ['id' => 4, 'github_id' => '104', 'title' => 'Untagged repo', 'category_id' => 1],
];
$categories = [
    2 => ['name' => 'Web apps', 'slug' => 'web-apps'],
    1 => ['name' => 'Websites', 'slug' => 'websites'],
    3 => ['name' => 'Unused', 'slug' => 'unused'],
];
$catalog = mergeCatalog($repos, $rows, $categories, [4 => 'PHP'], [1 => [4]]);
check(array_column($catalog['items'], 'id') === ['github-101', 'custom-3', 'github-103'],
    'Pin, manual order, hidden and untagged rules');
check(array_column($catalog['categories'], 'slug') === ['web-apps', 'websites'], 'Visible category ordering');
check($catalog['items'][0]['title'] === 'Custom title'
    && $catalog['items'][0]['repoUrl'] === 'https://github.com/EE2506/renamed-repo'
    && $catalog['items'][0]['tags'] === ['PHP']
    && $catalog['items'][0]['imageAlt'] === 'Custom title', 'Overrides survive a repository rename');
check(mergeCatalog([], [], [], [], []) === ['items' => [], 'categories' => []], 'Empty catalog');
check(array_column(mergeCatalog([], $rows, $categories, [], [])['items'], 'id') === ['custom-3'],
    'Custom entries survive a cold GitHub outage');

try {
    imageType(__FILE__);
    throw new RuntimeException('Expected a non-image to be rejected');
} catch (DomainException) {
    // Expected validation failure.
}
$portrait = dirname(__DIR__, 2) . '/assets/img/dj-portrait.webp';
check(imageType($portrait)[0] === 'webp', 'WebP accepted');
echo "Catalog and image checks passed.\n";
