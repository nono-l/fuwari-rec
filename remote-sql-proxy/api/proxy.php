<?php
/**
 * External store — HTTPS JSON front for MySQL
 *
 * POST JSON actions:
 *   ping | whoami
 *   kv.get | kv.set | kv.delete | kv.list
 *   snap.save | snap.list | snap.get | snap.delete
 *   log.recent | log.ips
 *
 * Auth: header X-Api-Key  or body api_key
 */
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function respond(int $code, array $body): never {
    http_response_code($code);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(int $code, string $message, array $extra = [], ?PDO $pdo = null, string $action = 'error'): never {
    if ($pdo) {
        fuwari_log_access($pdo, $action, false, $code, null, $message);
    }
    respond($code, array_merge(['ok' => false, 'error' => $message], $extra));
}

try {
    fuwari_load_config();
} catch (Throwable $e) {
    fail(500, $e->getMessage());
}

// CORS
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = defined('CORS_ORIGINS') && is_array(CORS_ORIGINS) ? CORS_ORIGINS : [];
if ($origin && in_array($origin, $allowed, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-Api-Key, Authorization');
    header('Access-Control-Max-Age: 86400');
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    fail(405, 'POST only');
}

// HTTPS 上の Basic 認証（任意）。OPTIONS は上で抜けているので preflight は通る
$basicUser = defined('BASIC_AUTH_USER') ? (string)BASIC_AUTH_USER : '';
$basicPass = defined('BASIC_AUTH_PASS') ? (string)BASIC_AUTH_PASS : '';
if ($basicUser !== '') {
    $u = $_SERVER['PHP_AUTH_USER'] ?? '';
    $pw = $_SERVER['PHP_AUTH_PW'] ?? '';
    // 一部環境では Authorization を自分で剥がす
    if ($u === '' && !empty($_SERVER['HTTP_AUTHORIZATION'])) {
        if (preg_match('/^Basic\s+(.+)$/i', $_SERVER['HTTP_AUTHORIZATION'], $m)) {
            $decoded = base64_decode($m[1], true);
            if (is_string($decoded) && str_contains($decoded, ':')) {
                [$u, $pw] = explode(':', $decoded, 2);
            }
        }
    }
    if ($u === '' && !empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        if (preg_match('/^Basic\s+(.+)$/i', $_SERVER['REDIRECT_HTTP_AUTHORIZATION'], $m)) {
            $decoded = base64_decode($m[1], true);
            if (is_string($decoded) && str_contains($decoded, ':')) {
                [$u, $pw] = explode(':', $decoded, 2);
            }
        }
    }
    if (!hash_equals($basicUser, (string)$u) || !hash_equals($basicPass, (string)$pw)) {
        header('WWW-Authenticate: Basic realm="External Store"');
        fail(401, 'Basic 認証が必要です');
    }
}

$maxBody = defined('MAX_BODY_BYTES') ? (int)MAX_BODY_BYTES : 524288;
$raw = file_get_contents('php://input', false, null, 0, $maxBody + 1);
if ($raw === false || strlen($raw) > $maxBody) {
    fail(413, 'リクエストが大きすぎます');
}

$payload = json_decode($raw ?: 'null', true);
if (!is_array($payload)) {
    fail(400, 'JSON が不正です');
}

$pdo = null;
try {
    $pdo = fuwari_pdo();
} catch (Throwable $e) {
    fail(500, 'データベースに接続できません', ['detail' => $e->getMessage()]);
}

// Auth
$apiKeyHeader = $_SERVER['HTTP_X_API_KEY'] ?? '';
$apiKeyBody = isset($payload['api_key']) ? (string)$payload['api_key'] : '';
$apiKey = $apiKeyHeader !== '' ? $apiKeyHeader : $apiKeyBody;
$expected = defined('API_KEY') ? (string)API_KEY : '';
if ($expected === '' || $expected === 'CHANGE_ME_LONG_RANDOM_API_KEY' || !hash_equals($expected, $apiKey)) {
    fail(401, 'API キーが無効です', [], $pdo, 'auth.fail');
}

$action = (string)($payload['action'] ?? '');
if ($action === '') {
    fail(400, 'action が必要です', [], $pdo, 'bad.action');
}

function require_ns(array $p): string {
    $ns = (string)($p['namespace'] ?? '');
    if ($ns === '' || strlen($ns) > 64 || !preg_match('/^[a-zA-Z0-9_.:-]+$/', $ns)) {
        fail(400, 'namespace が不正です');
    }
    return $ns;
}
function require_key(array $p): string {
    $key = (string)($p['key'] ?? '');
    if ($key === '' || strlen($key) > 191) {
        fail(400, 'key が不正です');
    }
    return $key;
}

$clientIp = fuwari_client_ip();
$nsForLog = isset($payload['namespace']) ? (string)$payload['namespace'] : null;

try {
    switch ($action) {
        case 'ping':
        case 'whoami': {
            $pdo->query('SELECT 1');
            // 直近のこの IP からの成功回数
            $st = $pdo->prepare(
                'SELECT COUNT(*) AS c FROM access_log WHERE ip = ? AND ok = 1 AND created_at > (NOW() - INTERVAL 7 DAY)'
            );
            $st->execute([$clientIp]);
            $weekHits = (int)($st->fetch()['c'] ?? 0);

            fuwari_log_access($pdo, $action, true, 200, $nsForLog, 'connection check');
            respond(200, [
                'ok' => true,
                'service' => defined('APP_NAME') ? APP_NAME : 'external-store',
                'app_id' => defined('APP_ID') ? APP_ID : null,
                'version' => defined('APP_VERSION') ? APP_VERSION : null,
                'time' => gmdate('c'),
                'client_ip' => $clientIp,
                'week_hits_from_ip' => $weekHits,
                'server' => $_SERVER['HTTP_HOST'] ?? null,
            ]);
        }

        case 'log.recent': {
            $limit = min(100, max(1, (int)($payload['limit'] ?? 30)));
            $st = $pdo->prepare(
                'SELECT id, ip, action, ok, http_status, origin, namespace, note, created_at
                 FROM access_log ORDER BY id DESC LIMIT ' . $limit
            );
            $st->execute();
            fuwari_log_access($pdo, 'log.recent', true, 200, $nsForLog);
            respond(200, ['ok' => true, 'items' => $st->fetchAll(), 'your_ip' => $clientIp]);
        }

        case 'log.ips': {
            $st = $pdo->query(
                'SELECT ip,
                        COUNT(*) AS hits,
                        SUM(ok) AS ok_hits,
                        MAX(created_at) AS last_seen,
                        MIN(created_at) AS first_seen
                 FROM access_log
                 GROUP BY ip
                 ORDER BY last_seen DESC
                 LIMIT 100'
            );
            fuwari_log_access($pdo, 'log.ips', true, 200, $nsForLog);
            respond(200, [
                'ok' => true,
                'items' => $st->fetchAll(),
                'your_ip' => $clientIp,
            ]);
        }

        case 'kv.get': {
            $ns = require_ns($payload);
            $key = require_key($payload);
            $st = $pdo->prepare(
                'SELECT value_json, updated_at FROM kv_store WHERE namespace = ? AND item_key = ? LIMIT 1'
            );
            $st->execute([$ns, $key]);
            $row = $st->fetch();
            fuwari_log_access($pdo, 'kv.get', true, 200, $ns, $key);
            if (!$row) {
                respond(200, ['ok' => true, 'found' => false, 'value' => null, 'client_ip' => $clientIp]);
            }
            respond(200, [
                'ok' => true,
                'found' => true,
                'value' => json_decode($row['value_json'], true),
                'updated_at' => $row['updated_at'],
                'client_ip' => $clientIp,
            ]);
        }

        case 'kv.set': {
            $ns = require_ns($payload);
            $key = require_key($payload);
            if (!array_key_exists('value', $payload)) {
                fail(400, 'value が必要です', [], $pdo, 'kv.set');
            }
            $json = json_encode($payload['value'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            if ($json === false) {
                fail(400, 'value を JSON 化できません', [], $pdo, 'kv.set');
            }
            $st = $pdo->prepare(
                'INSERT INTO kv_store (namespace, item_key, value_json)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE value_json = VALUES(value_json)'
            );
            $st->execute([$ns, $key, $json]);
            fuwari_log_access($pdo, 'kv.set', true, 200, $ns, $key);
            respond(200, ['ok' => true, 'saved' => true, 'client_ip' => $clientIp]);
        }

        case 'kv.delete': {
            $ns = require_ns($payload);
            $key = require_key($payload);
            $st = $pdo->prepare('DELETE FROM kv_store WHERE namespace = ? AND item_key = ?');
            $st->execute([$ns, $key]);
            fuwari_log_access($pdo, 'kv.delete', true, 200, $ns, $key);
            respond(200, ['ok' => true, 'deleted' => $st->rowCount() > 0, 'client_ip' => $clientIp]);
        }

        case 'kv.list': {
            $ns = require_ns($payload);
            $st = $pdo->prepare(
                'SELECT item_key AS `key`, updated_at FROM kv_store WHERE namespace = ? ORDER BY item_key ASC'
            );
            $st->execute([$ns]);
            fuwari_log_access($pdo, 'kv.list', true, 200, $ns);
            respond(200, ['ok' => true, 'items' => $st->fetchAll(), 'client_ip' => $clientIp]);
        }

        case 'snap.save': {
            $ns = require_ns($payload);
            $title = trim((string)($payload['title'] ?? ''));
            $kind = (string)($payload['kind'] ?? 'project');
            if ($title === '' || strlen($title) > 191) {
                fail(400, 'title が不正です', [], $pdo, 'snap.save');
            }
            if ($kind === '' || strlen($kind) > 32 || !preg_match('/^[a-zA-Z0-9_-]+$/', $kind)) {
                fail(400, 'kind が不正です', [], $pdo, 'snap.save');
            }
            if (!array_key_exists('payload', $payload)) {
                fail(400, 'payload が必要です', [], $pdo, 'snap.save');
            }
            $json = json_encode($payload['payload'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            if ($json === false) {
                fail(400, 'payload を JSON 化できません', [], $pdo, 'snap.save');
            }
            $id = isset($payload['id']) ? (int)$payload['id'] : 0;
            if ($id > 0) {
                $st = $pdo->prepare(
                    'UPDATE snapshots SET title = ?, kind = ?, payload_json = ?
                     WHERE id = ? AND namespace = ?'
                );
                $st->execute([$title, $kind, $json, $id, $ns]);
                if ($st->rowCount() === 0) {
                    fail(404, 'スナップショットが見つかりません', [], $pdo, 'snap.save');
                }
                fuwari_log_access($pdo, 'snap.save', true, 200, $ns, (string)$id);
                respond(200, ['ok' => true, 'id' => $id, 'client_ip' => $clientIp]);
            }
            $st = $pdo->prepare(
                'INSERT INTO snapshots (namespace, title, kind, payload_json) VALUES (?, ?, ?, ?)'
            );
            $st->execute([$ns, $title, $kind, $json]);
            $newId = (int)$pdo->lastInsertId();
            fuwari_log_access($pdo, 'snap.save', true, 200, $ns, (string)$newId);
            respond(200, ['ok' => true, 'id' => $newId, 'client_ip' => $clientIp]);
        }

        case 'snap.list': {
            $ns = require_ns($payload);
            $kind = isset($payload['kind']) ? (string)$payload['kind'] : null;
            if ($kind) {
                $st = $pdo->prepare(
                    'SELECT id, title, kind, updated_at, created_at FROM snapshots
                     WHERE namespace = ? AND kind = ? ORDER BY updated_at DESC LIMIT 100'
                );
                $st->execute([$ns, $kind]);
            } else {
                $st = $pdo->prepare(
                    'SELECT id, title, kind, updated_at, created_at FROM snapshots
                     WHERE namespace = ? ORDER BY updated_at DESC LIMIT 100'
                );
                $st->execute([$ns]);
            }
            fuwari_log_access($pdo, 'snap.list', true, 200, $ns);
            respond(200, ['ok' => true, 'items' => $st->fetchAll(), 'client_ip' => $clientIp]);
        }

        case 'snap.get': {
            $ns = require_ns($payload);
            $id = (int)($payload['id'] ?? 0);
            if ($id <= 0) {
                fail(400, 'id が不正です', [], $pdo, 'snap.get');
            }
            $st = $pdo->prepare(
                'SELECT id, title, kind, payload_json, updated_at, created_at
                 FROM snapshots WHERE id = ? AND namespace = ? LIMIT 1'
            );
            $st->execute([$id, $ns]);
            $row = $st->fetch();
            fuwari_log_access($pdo, 'snap.get', true, 200, $ns, (string)$id);
            if (!$row) {
                respond(200, ['ok' => true, 'found' => false, 'client_ip' => $clientIp]);
            }
            $data = json_decode($row['payload_json'], true);
            unset($row['payload_json']);
            $row['payload'] = $data;
            respond(200, ['ok' => true, 'found' => true, 'item' => $row, 'client_ip' => $clientIp]);
        }

        case 'snap.delete': {
            $ns = require_ns($payload);
            $id = (int)($payload['id'] ?? 0);
            if ($id <= 0) {
                fail(400, 'id が不正です', [], $pdo, 'snap.delete');
            }
            $st = $pdo->prepare('DELETE FROM snapshots WHERE id = ? AND namespace = ?');
            $st->execute([$id, $ns]);
            fuwari_log_access($pdo, 'snap.delete', true, 200, $ns, (string)$id);
            respond(200, ['ok' => true, 'deleted' => $st->rowCount() > 0, 'client_ip' => $clientIp]);
        }

        default:
            fail(400, '未知の action: ' . $action, [], $pdo, 'unknown');
    }
} catch (Throwable $e) {
    fail(500, 'サーバーエラー', ['detail' => $e->getMessage()], $pdo, $action ?: 'error');
}
