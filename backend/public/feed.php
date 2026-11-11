<?php

declare(strict_types=1);

use PHPMailer\PHPMailer\PHPMailer;

ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Vary: Origin');

function reply(int $status, array $data): never
{
    http_response_code($status);
    echo json_encode($data, JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR);
    exit;
}

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$local = PHP_SAPI === 'cli-server';
$allowed = $origin === 'https://ee2506.github.io'
    || ($local && $origin === 'http://localhost:4173');
if ($allowed) {
    header('Access-Control-Allow-Origin: ' . $origin);
}
$method = $_SERVER['REQUEST_METHOD'];
$feed = $_GET['feed'] ?? '';
$private = $local ? dirname(__DIR__) . '/private' : dirname($_SERVER['DOCUMENT_ROOT']) . '/portfolio-private';

if ($method === 'OPTIONS' && $feed === 'contact' && $allowed) {
    header('Access-Control-Allow-Methods: POST');
    header('Access-Control-Allow-Headers: Content-Type');
    http_response_code(204);
    exit;
}

function sendContact(string $private, string $name, string $email, string $message): void
{
    $settings = @parse_ini_file($private . '/.env', false, INI_SCANNER_RAW);
    if (empty($settings['SMTP_USERNAME']) || empty($settings['SMTP_PASSWORD']) || empty($settings['CONTACT_TO'])) {
        throw new RuntimeException('SMTP settings missing');
    }
    require $private . '/vendor/autoload.php';
    $mail = new PHPMailer(true);
    $mail->isSMTP();
    $mail->Host = 'smtp.gmail.com';
    $mail->Port = ($settings['SMTP_PORT'] ?? '') === '465' ? 465 : 587;
    $mail->SMTPSecure = $mail->Port === 465 ? PHPMailer::ENCRYPTION_SMTPS : PHPMailer::ENCRYPTION_STARTTLS;
    $mail->Timeout = 8;
    $mail->SMTPAuth = true;
    $mail->Username = $settings['SMTP_USERNAME'];
    $mail->Password = $settings['SMTP_PASSWORD'];
    $mail->CharSet = 'UTF-8';
    $mail->setFrom($mail->Username, 'DJ Portfolio');
    $mail->addAddress($settings['CONTACT_TO']);
    $mail->addReplyTo($email);
    $mail->Subject = 'New portfolio inquiry';
    $mail->Body = "Name: $name\nEmail: $email\n\n$message";
    $mail->send();
}

try {
    require_once $private . '/projects.php';
    if ($method === 'GET' && $feed === 'projects') {
        $page = filter_var($_GET['page'] ?? '1', FILTER_VALIDATE_INT, [
            'options' => ['min_range' => 1, 'max_range' => 10000],
        ]);
        if (!$page) {
            reply(400, ['error' => 'Invalid page.']);
        }
        $category = $_GET['category'] ?? '';
        if (!is_string($category) || ($category !== '' && !preg_match('/\A[a-z0-9-]{1,80}\z/', $category))) {
            reply(400, ['error' => 'Invalid category.']);
        }
        $catalog = publicCatalog($private);
        $items = $category === '' ? $catalog['items'] : array_values(array_filter($catalog['items'],
            static fn (array $item): bool => $item['category']['slug'] === $category));
        header('Cache-Control: no-store');
        reply(200, [
            'items' => array_slice($items, ($page - 1) * 20, 20),
            'more' => count($items) > $page * 20,
            'categories' => $catalog['categories'],
        ]);
    }

    if ($feed !== 'contact' || $method !== 'POST') {
        reply(404, ['error' => 'Endpoint not found.']);
    }
    header('Cache-Control: no-store');
    if (!$allowed) {
        reply(403, ['error' => 'Origin not allowed.']);
    }
    if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') {
        reply(415, ['error' => 'Expected JSON.']);
    }
    $raw = file_get_contents('php://input', false, null, 0, 16001);
    if ($raw === false || strlen($raw) > 16000) {
        reply(413, ['error' => 'Message too large.']);
    }
    $data = json_decode($raw, true);
    $name = is_string($data['name'] ?? null) ? trim($data['name']) : '';
    $email = is_string($data['email'] ?? null) ? trim($data['email']) : '';
    $message = is_string($data['message'] ?? null) ? trim($data['message']) : '';
    if (!$name || !$message || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254
        || preg_match('/[\r\n]/', $name . $email) || !preg_match('/\A.{1,100}\z/us', $name)
        || !preg_match('/\A.{1,3000}\z/us', $message) || !empty($data['website'])) {
        reply(422, ['error' => 'Check your name, email and message, then try again.']);
    }

    $ip = hash('sha256', $_SERVER['REMOTE_ADDR'] ?? '');
    $now = time();
    $accepted = withLock($private . '/contact-rate.json', static function ($file) use ($ip, $now): bool {
        $events = array_values(array_filter(json_decode(stream_get_contents($file), true) ?? [],
            static fn ($event) => $event['at'] > $now - 3600));
        $fromIp = array_filter($events, static fn ($event) => $event['ip'] === $ip);
        if (count($events) >= 20 || count($fromIp) >= 3) {
            return false;
        }
        $events[] = ['ip' => $ip, 'at' => $now];
        saveState($file, $events);
        return true;
    });
    if (!$accepted) {
        reply(429, ['error' => 'Too many messages. Try again later or email me directly.']);
    }
    sendContact($private, $name, $email, $message);
    reply(200, ['sent' => true]);
} catch (Throwable $error) {
    error_log('Portfolio request failed: ' . ($feed === 'contact' ? 'contact' : 'content'));
    reply(503, ['error' => 'Temporarily unavailable.']);
}
