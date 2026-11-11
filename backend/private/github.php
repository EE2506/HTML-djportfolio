<?php

declare(strict_types=1);

function withLock(string $path, callable $update): mixed
{
    $file = @fopen($path, 'c+');
    if (!$file) {
        throw new RuntimeException('Unable to open storage');
    }
    try {
        if (!flock($file, LOCK_EX)) {
            throw new RuntimeException('Unable to lock storage');
        }
        return $update($file);
    } finally {
        fclose($file);
    }
}

function githubProjects(string $path): array
{
    return withLock($path, static function ($file): array {
        $cache = json_decode(stream_get_contents($file), true);
        if ($cache && $cache['expires'] > time()) {
            return $cache['items'];
        }
        try {
            $items = [];
            for ($page = 1; ; $page++) {
                $url = 'https://api.github.com/users/EE2506/repos?type=owner&sort=updated&direction=desc&per_page=100&page=' . $page;
                $curl = curl_init($url);
                curl_setopt_array($curl, [
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_USERAGENT => 'DJ-Portfolio',
                    CURLOPT_TIMEOUT => 5,
                    CURLOPT_HTTPHEADER => ['Accept: application/vnd.github+json'],
                ]);
                $body = curl_exec($curl);
                if (!$body || curl_getinfo($curl, CURLINFO_RESPONSE_CODE) !== 200) {
                    throw new RuntimeException('GitHub request failed');
                }
                $repos = json_decode($body, true, 512, JSON_THROW_ON_ERROR);
                if (!is_array($repos) || !array_is_list($repos)) {
                    throw new RuntimeException('Unexpected GitHub response');
                }
                foreach ($repos as $repo) {
                    if ($repo['private'] || $repo['fork'] || $repo['archived']
                        || !in_array('portfolio', $repo['topics'] ?? [], true)) {
                        continue;
                    }
                    $items[] = [
                        'id' => (string) $repo['id'],
                        'name' => $repo['name'],
                        'description' => $repo['description'],
                        'language' => $repo['language'],
                        'updated' => $repo['updated_at'],
                    ];
                }
                if (count($repos) < 100) {
                    break;
                }
            }
            saveState($file, ['expires' => time() + 1800, 'items' => $items]);
            return $items;
        } catch (Throwable $error) {
            if (!$cache) {
                throw $error;
            }
            // Delay retries during an outage to avoid hitting GitHub on every visit.
            $cache['expires'] = time() + 60;
            saveState($file, $cache);
            return $cache['items'];
        }
    });
}

function saveState($file, array $state): void
{
    $json = json_encode($state, JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);
    if (!rewind($file) || !ftruncate($file, 0) || fwrite($file, $json) !== strlen($json) || !fflush($file)) {
        throw new RuntimeException('Unable to save storage');
    }
}
