<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/database.php';

try {
    $db = portfolioDb(__DIR__);
    $lock = 'portfolio-setup-' . substr(hash('sha256', portfolioSettings(__DIR__)['DB_NAME']), 0, 32);
    if ((int) sql($db, 'SELECT GET_LOCK(?, 5)', [$lock])->fetchColumn() !== 1) {
        throw new RuntimeException('Setup already running.');
    }
    sql($db, 'CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(100) PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    $applied = sql($db, 'SELECT version FROM schema_migrations')->fetchAll(PDO::FETCH_COLUMN);
    $pending = array_filter(glob(__DIR__ . '/migrations/*.sql') ?: [],
        static fn (string $file): bool => !in_array(basename($file), $applied, true));
    if (!$pending) {
        fwrite(STDERR, "Setup locked: no unapplied migrations.\n");
        exit(1);
    }
    foreach ($pending as $file) {
        // Migration files contain plain SQL statements separated by a semicolon and newline.
        foreach (preg_split('/;\s*(?:\r?\n|$)/', trim(file_get_contents($file))) as $statement) {
            if (trim($statement) !== '') {
                sql($db, trim($statement));
            }
        }
        sql($db, 'INSERT INTO schema_migrations (version) VALUES (?)', [basename($file)]);
        echo 'Applied ' . basename($file) . PHP_EOL;
    }
} catch (Throwable) {
    fwrite(STDERR, "Setup failed. Check the private database settings and schema permissions.\n");
    exit(1);
}
