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
    if ($method === 'GET' && $feed === 'download') {
        $image = $_GET['image'] ?? '';
        if (!is_string($image) || !preg_match('/\A[a-f0-9]{32}\.(jpg|png|webp)\z/', $image, $matches)) {
            reply(404, ['error' => 'Image not found.']);
        }
        $path = __DIR__ . '/media/' . $image;
        $file = !is_link($path) && is_file($path) ? @fopen($path, 'rb') : false;
        if (!$file) {
            reply(404, ['error' => 'Image not found.']);
        }
        $extension = $matches[1];
        $type = $extension === 'jpg' ? 'jpeg' : $extension;
        header('Content-Type: image/' . $type);
        header('Content-Disposition: attachment; filename="project-sample-' . substr($image, 0, 8) . '.' . $extension . '"');
        fpassthru($file);
        fclose($file);
        exit;
    }
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
    if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 16000) {
        reply(413, ['error' => 'Message too large.']);
    }
    $raw = file_get_contents('php://input', false, null, 0, 16001);
    if ($raw === false || strlen($raw) > 16000) {
        reply(413, ['error' => 'Message too large.']);
    }
    $data = json_decode($raw, false, 8);
    if (!($data instanceof stdClass)) {
        reply(400, ['error' => 'Expected a JSON object.']);
    }
    $name = is_string($data->name ?? null) ? trim($data->name, ' ') : '';
    $email = is_string($data->email ?? null) ? trim($data->email, ' ') : '';
    $message = is_string($data->message ?? null) ? trim($data->message, " \t\r\n") : '';
    $website = property_exists($data, 'website') ? $data->website : '';
    if ($name === '' || $message === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254
        || preg_match('/[\x00-\x1f\x7f]/', $name . $email) || !preg_match('/\A.{1,100}\z/us', $name)
        || preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/', $message)
        || !preg_match('/\A.{1,3000}\z/us', $message) || $website !== '') {
        reply(422, ['error' => 'Check your name, email and message, then try again.']);
    }

    // Use the server's client address, never a client-supplied forwarding header.
    $address = @inet_pton($_SERVER['REMOTE_ADDR'] ?? '');
    if ($address === false) {
        throw new RuntimeException('Contact client address unavailable.');
    }
    if (strlen($address) === 16 && str_starts_with($address, str_repeat("\0", 10) . "\xff\xff")) {
        $address = substr($address, 12);
    }
    // Treat IPv6 privacy addresses within one /64 as the same client.
    $ip = hash('sha256', strlen($address) === 16 ? substr($address, 0, 8) : inet_ntop($address));
    $now = time();
    $retryAfter = withLock($private . '/contact-rate.json', static function ($file) use ($ip, $now): int {
        $state = stream_get_contents($file);
        $saved = $state === '' ? [] : json_decode($state, true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($saved) || !array_is_list($saved)) {
            throw new RuntimeException('Invalid contact rate-limit state.');
        }
        foreach ($saved as $event) {
            if (!is_int($event['at'] ?? null) || !is_string($event['ip'] ?? null)) {
                throw new RuntimeException('Invalid contact rate-limit entry.');
            }
        }
        $events = array_values(array_filter($saved,
            static fn ($event) => $event['at'] > $now - 3600));
        $fromIp = array_values(array_filter($events, static fn ($event) => $event['ip'] === $ip));
        $globalWait = count($events) >= 20 ? $events[count($events) - 20]['at'] + 3600 - $now : 0;
        $clientWait = count($fromIp) >= 3 ? $fromIp[count($fromIp) - 3]['at'] + 3600 - $now : 0;
        if ($globalWait || $clientWait) {
            return max($globalWait, $clientWait);
        }
        $events[] = ['ip' => $ip, 'at' => $now];
        saveState($file, $events);
        return 0;
    });
    if ($retryAfter > 0) {
        header('Retry-After: ' . $retryAfter);
        reply(429, ['error' => 'Too many messages. Try again later or email me directly.']);
    }
    sendContact($private, $name, $email, $message);
    reply(200, ['sent' => true]);
} catch (Throwable $error) {
    error_log('Portfolio request failed: ' . ($feed === 'contact' ? 'contact' : 'content'));
    reply(503, ['error' => 'Temporarily unavailable.']);
}
