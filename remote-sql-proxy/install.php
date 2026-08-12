<?php
// =============================================
// Fuwari REC Remote — Database Installer (Self-Destructing)
// Based on php_installer by https://x.com/mss_0337_2024
// =============================================
header('Content-Type: text/html; charset=utf-8');

require_once __DIR__ . '/apps/load.php';
$profile = grokbuild_profile();

$APP_ID      = $profile['id'];
$APP_NAME    = $profile['name'];
$APP_VERSION = $profile['version'];
$APP_EDITION = $profile['edition'];
$SHOW_APP_INFO = true;
$SHOW_APP_INFO_INPUT = true;

if (file_exists(__DIR__ . '/api/config.php')) {
    require_once __DIR__ . '/api/config.php';
    if (defined('APP_NAME'))    $APP_NAME    = APP_NAME;
    if (defined('APP_VERSION')) $APP_VERSION = APP_VERSION;
    if (defined('APP_EDITION')) $APP_EDITION = APP_EDITION;
    if (defined('SHOW_APP_INFO_IN_INSTALLER')) $SHOW_APP_INFO = SHOW_APP_INFO_IN_INSTALLER;
    if (defined('SHOW_APP_INFO_INPUT_IN_INSTALLER')) $SHOW_APP_INFO_INPUT = SHOW_APP_INFO_INPUT_IN_INSTALLER;
}

$error = null;
$success = false;
$apiKeyHint = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $host     = trim($_POST['host'] ?? 'localhost');
    $username = trim($_POST['username'] ?? '');
    $password = $_POST['password'] ?? '';
    $database = trim($_POST['database'] ?? '');
    $apiKey   = trim($_POST['api_key'] ?? '');

    $post_app_name    = trim($_POST['app_name'] ?? '');
    $post_app_version = trim($_POST['app_version'] ?? '');
    $post_app_edition = trim($_POST['app_edition'] ?? '');

    if ($apiKey === '') {
        try {
            $apiKey = bin2hex(random_bytes(24));
        } catch (Throwable $e) {
            $apiKey = bin2hex(openssl_random_pseudo_bytes(24));
        }
    }

    if (empty($username) || empty($database)) {
        $error = 'ユーザー名とデータベース名は必須です。';
    } else {
        $config_path = __DIR__ . '/api/config.php';
        if (!file_exists($config_path)) {
            $error = 'api/config.php が見つかりません。';
        } else {
            $conn = null;
            try {
                mysqli_report(MYSQLI_REPORT_OFF);
                $conn = new mysqli($host, $username, $password, $database);
                if ($conn->connect_errno) {
                    throw new Exception('データベース接続に失敗しました: ' . $conn->connect_error);
                }
            } catch (Exception $e) {
                $error = $e->getMessage();
            }

            if (!$error && $conn) {
                $conn->set_charset('utf8mb4');
                $sql_file = __DIR__ . '/install/sql.sql';
                if (!file_exists($sql_file)) {
                    $error = 'install/sql.sql が見つかりません。';
                } else {
                    $sql = file_get_contents($sql_file);
                    if ($conn->multi_query($sql)) {
                        while ($conn->more_results() && $conn->next_result()) { /* drain */ }

                        $appName    = $post_app_name    ?: $APP_NAME;
                        $appVersion = $post_app_version ?: 'v1.0';
                        $appEdition = $post_app_edition ?: 'Proxy';
                        $esc = static function (string $s): string {
                            return str_replace(["\\", "'"], ["\\\\", "\\'"], $s);
                        };

                        // Preserve CORS if already customized in existing config
                        $corsBlock = <<<'PHP'
define('CORS_ORIGINS', [
    'https://fuwa.pachimanzi.uk',
    'https://fuwa-rec.grok.me',
    'http://localhost:8080',
    'http://127.0.0.1:8080',
]);
PHP;

                        $config_content = <<<PHP
<?php
// Written by install.php — runtime config.php (php_installer).
// Repo の config.php は Sample のみ。本番の鍵はここに動的保存。ソースには載せない。

define('DB_HOST', '{$esc($host)}');
define('DB_USER', '{$esc($username)}');
define('DB_PASS', '{$esc($password)}');
define('DB_NAME', '{$esc($database)}');
define('DB_CHARSET', 'utf8mb4');
define('DB_OPTIONS', [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
]);

define('APP_ID',      '{$esc($APP_ID)}');
define('APP_NAME',    '{$esc($appName)}');
define('APP_VERSION', '{$esc($appVersion)}');
define('APP_EDITION', '{$esc($appEdition)}');

define('SHOW_APP_INFO_IN_INSTALLER', true);
define('SHOW_APP_INFO_INPUT_IN_INSTALLER', false);

define('API_KEY', '{$esc($apiKey)}');
define('ADMIN_KEY', '{$esc($apiKey)}');
define('BASIC_AUTH_USER', '');
define('BASIC_AUTH_PASS', '');

define('TRUST_PROXY', false);

{$corsBlock}

define('MAX_BODY_BYTES', 512 * 1024);
PHP;

                        if (file_put_contents($config_path, $config_content)) {
                            @chmod($config_path, 0600);
                            $success = true;
                            $apiKeyHint = $apiKey;
                            @rename(__FILE__, __DIR__ . '/install.php.txt');
                        } else {
                            $error = 'config.php の書き込みに失敗しました。権限を確認してください。';
                        }
                    } else {
                        $error = 'テーブル作成に失敗しました: ' . $conn->error;
                    }
                }
            }
        }
    }
}
?>
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= htmlspecialchars($APP_NAME) ?> - インストール</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
</head>
<body class="bg-emerald-950 text-emerald-50">
    <div class="max-w-md mx-auto pt-12 px-4 pb-16">
        <div class="bg-emerald-900/80 rounded-3xl p-8 border border-emerald-700/60 shadow-2xl">
            <div class="text-center mb-8">
                <div class="mx-auto w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center mb-4">
                    <i class="fa-solid fa-cloud-arrow-up text-white text-3xl"></i>
                </div>
                <h1 class="text-2xl font-bold tracking-tight"><?= htmlspecialchars($APP_NAME) ?></h1>
                <p class="text-emerald-200/70 mt-1 text-sm">MySQL リモートプロキシ・インストーラ</p>
                <div class="inline-flex items-center gap-x-2 mt-3 px-3 py-1 bg-emerald-950/60 rounded-full text-xs text-emerald-200/80">
                    <div class="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                    <span>Self-Destructing · php_installer 互換</span>
                </div>
            </div>

            <?php if ($error): ?>
                <div class="bg-red-900/50 border border-red-600/60 text-red-200 px-4 py-3 rounded-2xl mb-6 text-sm">
                    <?= htmlspecialchars($error) ?>
                </div>
            <?php endif; ?>

            <?php if ($success): ?>
                <div class="bg-emerald-800/50 border border-emerald-500/40 text-emerald-100 px-4 py-4 rounded-2xl mb-4 text-sm space-y-3">
                    <div class="font-semibold text-center">インストール完了</div>
                    <p>テーブルを作成し、<code class="text-emerald-200">api/config.php</code> を更新しました。</p>
                    <div class="rounded-xl bg-emerald-950/50 p-3 break-all">
                        <div class="text-[11px] text-emerald-300/70 mb-1">クライアントに貼る API キー</div>
                        <code class="text-emerald-100 text-xs"><?= htmlspecialchars($apiKeyHint) ?></code>
                    </div>
                    <div class="rounded-xl bg-emerald-950/50 p-3 break-all">
                        <div class="text-[11px] text-emerald-300/70 mb-1">プロキシ URL</div>
                        <code class="text-emerald-100 text-xs">
                            <?= htmlspecialchars(
                                (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http')
                                . '://' . ($_SERVER['HTTP_HOST'] ?? 'your-host')
                                . rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? ''), '/\\')
                                . '/api/proxy.php'
                            ) ?>
                        </code>
                    </div>
                    <p class="text-[11px] text-emerald-200/60">
                        install.php は install.php.txt に改名済みです。CORS にフロントの Origin を足す場合は config.php を編集してください。
                    </p>
                    <a href="setup.php" class="block text-center mt-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white">接続監視セットアップを開く</a>
                    <a href="index.html" class="block text-center mt-2 text-emerald-300 underline text-sm">ステータスページへ</a>
                </div>
            <?php else: ?>
            <form method="POST" class="space-y-5">
                <div>
                    <label class="block text-sm font-medium text-emerald-200/70 mb-2">データベースホスト</label>
                    <input type="text" name="host" value="localhost" required
                           class="w-full bg-emerald-950/50 border border-emerald-700 focus:border-emerald-400 rounded-2xl px-4 py-3 text-white">
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-sm font-medium text-emerald-200/70 mb-2">ユーザー名</label>
                        <input type="text" name="username" required
                               class="w-full bg-emerald-950/50 border border-emerald-700 focus:border-emerald-400 rounded-2xl px-4 py-3 text-white">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-emerald-200/70 mb-2">パスワード</label>
                        <input type="password" name="password"
                               class="w-full bg-emerald-950/50 border border-emerald-700 focus:border-emerald-400 rounded-2xl px-4 py-3 text-white">
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-medium text-emerald-200/70 mb-2">データベース名</label>
                    <input type="text" name="database" required placeholder="fuwari_rec"
                           class="w-full bg-emerald-950/50 border border-emerald-700 focus:border-emerald-400 rounded-2xl px-4 py-3 text-white">
                </div>
                <div>
                    <label class="block text-sm font-medium text-emerald-200/70 mb-2">API キー（空欄で自動生成）</label>
                    <input type="text" name="api_key" placeholder="空欄推奨"
                           class="w-full bg-emerald-950/50 border border-emerald-700 focus:border-emerald-400 rounded-2xl px-4 py-3 text-white text-sm">
                </div>

                <?php if ($SHOW_APP_INFO_INPUT): ?>
                <div class="pt-3 border-t border-emerald-800 space-y-3">
                    <div class="text-sm text-emerald-200/60">アプリ情報（オプション）</div>
                    <input type="text" name="app_name" value="<?= htmlspecialchars($APP_NAME) ?>"
                           class="w-full bg-emerald-950/50 border border-emerald-700 rounded-2xl px-4 py-2.5 text-sm">
                    <div class="grid grid-cols-2 gap-3">
                        <input type="text" name="app_version" value="<?= htmlspecialchars($APP_VERSION) ?>"
                               class="w-full bg-emerald-950/50 border border-emerald-700 rounded-2xl px-4 py-2.5 text-sm">
                        <input type="text" name="app_edition" value="<?= htmlspecialchars($APP_EDITION) ?>"
                               class="w-full bg-emerald-950/50 border border-emerald-700 rounded-2xl px-4 py-2.5 text-sm">
                    </div>
                </div>
                <?php endif; ?>

                <button type="submit"
                        class="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 rounded-2xl font-semibold flex items-center justify-center gap-x-2">
                    <i class="fa-solid fa-download"></i>
                    インストールを実行する
                </button>
            </form>
            <p class="mt-5 text-center text-[11px] text-emerald-200/50">
                完了後 install.php は install.php.txt に改名されます · install/sql.sql を実行
            </p>
            <?php endif; ?>
        </div>
        <?php if ($SHOW_APP_INFO): ?>
        <div class="text-center mt-6 text-xs text-emerald-200/40">
            <?= htmlspecialchars($APP_NAME) ?> <?= htmlspecialchars($APP_VERSION) ?> · <?= htmlspecialchars($APP_EDITION) ?>
        </div>
        <?php endif; ?>
    </div>
</body>
</html>
