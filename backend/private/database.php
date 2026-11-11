<?php

declare(strict_types=1);

function portfolioSettings(string $private): array
{
    return @parse_ini_file($private . '/.env', false, INI_SCANNER_RAW) ?: [];
}

function portfolioDb(string $private): PDO
{
    $env = portfolioSettings($private);
    $host = $env['DB_HOST'] ?? '127.0.0.1';
    $port = filter_var($env['DB_PORT'] ?? '3306', FILTER_VALIDATE_INT,
        ['options' => ['min_range' => 1, 'max_range' => 65535]]);
    $name = $env['DB_NAME'] ?? '';
    if (!preg_match('/\A[a-z0-9_.:-]+\z/i', $host) || !preg_match('/\A[a-z0-9_-]+\z/i', $name)
        || !$port || empty($env['DB_USER']) || !isset($env['DB_PASSWORD'])) {
        throw new RuntimeException('Database settings missing or invalid.');
    }
    return new PDO("mysql:host=$host;port=$port;dbname=$name;charset=utf8mb4", $env['DB_USER'], $env['DB_PASSWORD'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_TIMEOUT => 3,
        PDO::MYSQL_ATTR_MULTI_STATEMENTS => false,
    ]);
}

function sql(PDO $db, string $query, array $parameters = []): PDOStatement
{
    $statement = $db->prepare($query);
    $statement->execute($parameters);
    return $statement;
}
