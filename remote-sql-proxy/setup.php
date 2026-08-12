<?php
/**
 * Fuwari REC Remote — セットアップ / 接続監視 / IP 許可 .htaccess 生成
 *
 * ログイン: config.php の ADMIN_KEY（未設定なら API_KEY）
 */
declare(strict_types=1);

session_start();
require_once __DIR__ . '/api/bootstrap.php';
require_once __DIR__ . '/apps/load.php';
$profile = grokbuild_profile();

$flash = null;
$error = null;
$htaccessPreview = '';
$locked = false;

try {
    fuwari_load_config();
} catch (Throwable $e) {
    $error = $e->getMessage();
}

$adminKey = defined('ADMIN_KEY') ? (string)ADMIN_KEY : (defined('API_KEY') ? (string)API_KEY : '');
$appName = defined('APP_NAME') ? APP_NAME : (string)$profile['name'];

// logout
if (isset($_GET['logout'])) {
    unset($_SESSION['fuwari_setup_ok']);
    header('Location: setup.php');
    exit;
}

// login
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['form'] ?? '') === 'login') {
    $key = (string)($_POST['admin_key'] ?? '');
    if ($adminKey !== '' && hash_equals($adminKey, $key)) {
        $_SESSION['fuwari_setup_ok'] = true;
        header('Location: setup.php');
        exit;
    }
    $error = '管理キーが違います';
}

$authed = !empty($_SESSION['fuwari_setup_ok']);
$pdo = null;
$logs = [];
$ips = [];
$allowlist = [];
$enforce = false;

if ($authed && !$error) {
    try {
        $pdo = fuwari_pdo();
    } catch (Throwable $e) {
        $error = 'DB 接続失敗: ' . $e->getMessage();
    }
}

if ($authed && $pdo) {
    // ensure enforce flag file
    $flagPath = __DIR__ . '/api/.ip_enforce';
    $enforce = is_file($flagPath);

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $form = (string)($_POST['form'] ?? '');

        if ($form === 'add_ip') {
            $ip = trim((string)($_POST['ip'] ?? ''));
            $label = trim((string)($_POST['label'] ?? ''));
            if (!fuwari_is_valid_ip($ip)) {
                $flash = ['type' => 'err', 'msg' => 'IP が不正です'];
            } else {
                $st = $pdo->prepare(
                    'INSERT INTO ip_allowlist (ip, label, enabled) VALUES (?, ?, 1)
                     ON DUPLICATE KEY UPDATE label = VALUES(label), enabled = 1'
                );
                $st->execute([$ip, $label !== '' ? $label : null]);
                $flash = ['type' => 'ok', 'msg' => "許可リストに追加: {$ip}"];
            }
        }

        if ($form === 'add_from_log') {
            $ip = trim((string)($_POST['ip'] ?? ''));
            if (fuwari_is_valid_ip($ip)) {
                $st = $pdo->prepare(
                    'INSERT INTO ip_allowlist (ip, label, enabled) VALUES (?, ?, 1)
                     ON DUPLICATE KEY UPDATE enabled = 1'
                );
                $st->execute([$ip, 'from access_log']);
                $flash = ['type' => 'ok', 'msg' => "ログから追加: {$ip}"];
            }
        }

        if ($form === 'rotate_secrets') {
            $newKey = trim((string)($_POST['api_key'] ?? ''));
            if ($newKey === '') {
                try {
                    $newKey = bin2hex(random_bytes(24));
                } catch (Throwable $e) {
                    $newKey = bin2hex((string)openssl_random_pseudo_bytes(24));
                }
            }
            $basicUser = trim((string)($_POST['basic_user'] ?? ''));
            $basicPass = (string)($_POST['basic_pass'] ?? '');
            $adminKeyNew = trim((string)($_POST['admin_key_new'] ?? ''));
            if (fuwari_write_config([
                'API_KEY' => $newKey,
                'ADMIN_KEY' => $adminKeyNew !== '' ? $adminKeyNew : $newKey,
                'BASIC_AUTH_USER' => $basicUser,
                'BASIC_AUTH_PASS' => $basicPass,
            ])) {
                $flash = ['type' => 'ok', 'msg' => 'config.php を更新しました（ソースではなくサーバ上の動的設定）。新しい API キーを Hobby 管理画面へ。'];
            } else {
                $flash = ['type' => 'err', 'msg' => 'config.php を書けませんでした'];
            }
        }

        if ($form === 'remove_ip') {
            $id = (int)($_POST['id'] ?? 0);
            $pdo->prepare('DELETE FROM ip_allowlist WHERE id = ?')->execute([$id]);
            $flash = ['type' => 'ok', 'msg' => '許可リストから削除しました'];
        }

        if ($form === 'toggle_ip') {
            $id = (int)($_POST['id'] ?? 0);
            $pdo->prepare('UPDATE ip_allowlist SET enabled = IF(enabled=1,0,1) WHERE id = ?')->execute([$id]);
            $flash = ['type' => 'ok', 'msg' => '有効/無効を切り替えました'];
        }

        if ($form === 'write_htaccess') {
            $mode = (string)($_POST['mode'] ?? 'preview');
            $st = $pdo->query('SELECT ip FROM ip_allowlist WHERE enabled = 1 ORDER BY ip');
            $list = array_column($st->fetchAll(), 'ip');
            $doEnforce = ($mode === 'enforce' || $mode === 'enforce_write');
            $htaccessPreview = fuwari_build_proxy_htaccess($list, $doEnforce);

            if ($mode === 'write' || $mode === 'enforce_write' || $mode === 'disable_write') {
                if ($mode === 'disable_write') {
                    $htaccessPreview = fuwari_build_proxy_htaccess($list, false);
                    @unlink($flagPath);
                } elseif ($doEnforce) {
                    if (count($list) === 0) {
                        $flash = ['type' => 'err', 'msg' => '許可 IP が空のまま制限すると全員拒否になります'];
                        $htaccessPreview = fuwari_build_proxy_htaccess($list, false);
                    } else {
                        file_put_contents($flagPath, gmdate('c'));
                    }
                } else {
                    @unlink($flagPath);
                }

                if (!isset($flash['type']) || $flash['type'] !== 'err') {
                    if (fuwari_write_api_htaccess($htaccessPreview)) {
                        $flash = [
                            'type' => 'ok',
                            'msg' => $doEnforce && count($list) > 0
                                ? 'api/.htaccess を書き込み、IP 制限を有効化しました'
                                : 'api/.htaccess を書き込みました（IP 制限オフ）',
                        ];
                        $enforce = is_file($flagPath);
                    } else {
                        $flash = ['type' => 'err', 'msg' => 'api/.htaccess を書けません（権限を確認）'];
                    }
                }
            } else {
                $flash = ['type' => 'ok', 'msg' => 'プレビューを生成しました（まだファイル未書き込み）'];
            }
        }

        if ($form === 'clear_logs') {
            $pdo->exec('TRUNCATE TABLE access_log');
            $flash = ['type' => 'ok', 'msg' => '接続ログをクリアしました'];
        }
    }

    // reload lists
    $logs = $pdo->query(
        'SELECT id, ip, action, ok, http_status, origin, namespace, note, created_at
         FROM access_log ORDER BY id DESC LIMIT 50'
    )->fetchAll();

    $ips = $pdo->query(
        'SELECT ip, COUNT(*) AS hits, SUM(ok) AS ok_hits,
                MAX(created_at) AS last_seen, MIN(created_at) AS first_seen
         FROM access_log GROUP BY ip ORDER BY last_seen DESC LIMIT 50'
    )->fetchAll();

    $allowlist = $pdo->query(
        'SELECT id, ip, label, enabled, created_at FROM ip_allowlist ORDER BY ip'
    )->fetchAll();

    if ($htaccessPreview === '') {
        $list = array_column(array_filter($allowlist, fn($r) => (int)$r['enabled'] === 1), 'ip');
        $htaccessPreview = fuwari_build_proxy_htaccess($list, $enforce);
    }
}

$proxyUrl = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http')
    . '://' . ($_SERVER['HTTP_HOST'] ?? 'host')
    . rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/')
    . '/api/proxy.php';

function h(?string $s): string {
    return htmlspecialchars((string)$s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
?>
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title><?= h($appName) ?> — セットアップ</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
</head>
<body class="bg-emerald-950 text-emerald-50 min-h-screen">
  <div class="max-w-4xl mx-auto px-4 py-10">
    <header class="mb-8 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-xs text-emerald-300/60"><?= h((string)$profile['id']) ?> · Grok Build External Storage</p>
        <h1 class="text-2xl font-bold tracking-tight">セットアップ & 接続監視</h1>
        <p class="mt-1 text-sm text-emerald-200/70">
          クライアントからの接続をログし、接続元 IP だけで <code class="text-emerald-200">proxy.php</code> を守る .htaccess を書けます。
        </p>
      </div>
      <?php if ($authed): ?>
        <a href="?logout=1" class="text-sm text-emerald-300 underline">ログアウト</a>
      <?php endif; ?>
    </header>

    <?php if ($error && !$authed): ?>
      <div class="mb-6 rounded-2xl border border-red-600/50 bg-red-950/50 px-4 py-3 text-sm text-red-200"><?= h($error) ?></div>
    <?php endif; ?>

    <?php if (!$authed): ?>
      <div class="max-w-md rounded-3xl border border-emerald-700/50 bg-emerald-900/50 p-6 shadow-xl">
        <h2 class="font-semibold mb-3"><i class="fa-solid fa-key mr-2"></i>管理ログイン</h2>
        <p class="text-xs text-emerald-200/60 mb-4">
          <code>config.php</code> の <code>ADMIN_KEY</code>（無ければ <code>API_KEY</code>）を入力
        </p>
        <?php if ($error): ?>
          <div class="mb-3 text-sm text-red-300"><?= h($error) ?></div>
        <?php endif; ?>
        <form method="post" class="space-y-3">
          <input type="hidden" name="form" value="login" />
          <input type="password" name="admin_key" required placeholder="ADMIN_KEY"
                 class="w-full rounded-2xl border border-emerald-700 bg-emerald-950/60 px-4 py-3 text-sm" />
          <button class="w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 py-3 font-semibold">
            入る
          </button>
        </form>
      </div>
    <?php else: ?>

      <?php if ($flash): ?>
        <div class="mb-4 rounded-2xl border px-4 py-3 text-sm <?= $flash['type']==='ok' ? 'border-emerald-500/40 bg-emerald-900/40 text-emerald-100' : 'border-red-500/40 bg-red-950/40 text-red-200' ?>">
          <?= h($flash['msg']) ?>
        </div>
      <?php endif; ?>
      <?php if ($error): ?>
        <div class="mb-4 rounded-2xl border border-red-600/50 bg-red-950/50 px-4 py-3 text-sm"><?= h($error) ?></div>
      <?php endif; ?>

      <!-- connection howto -->
      <section class="mb-6 rounded-3xl border border-emerald-700/40 bg-emerald-900/40 p-5">
        <h2 class="font-semibold flex items-center gap-2">
          <i class="fa-solid fa-plug text-emerald-400"></i> クライアントからの接続確認
        </h2>
        <ol class="mt-3 list-decimal pl-5 space-y-1 text-sm text-emerald-100/80">
          <li><?= h((string)$profile['setup_hint']) ?></li>
          <li>プロキシ URL に下の URL を貼る</li>
          <li>API キーを貼り「接続テスト」</li>
          <li>成功すると下の「接続ログ」に <code>ping</code> が溜まる → 接続元 IP が分かる</li>
        </ol>
        <div class="mt-3 rounded-xl bg-emerald-950/50 px-3 py-2 text-xs break-all">
          <span class="text-emerald-400/70">proxy URL · </span><?= h($proxyUrl) ?>
        </div>
        <p class="mt-2 text-[11px] text-emerald-200/50">
          IP 制限を ON にする前に、必ず自分の IP を許可リストへ入れてください（入れないとクライアントも拒否されます）。
        </p>
      </section>

      <section class="mb-6 rounded-3xl border border-emerald-700/40 bg-emerald-900/40 p-5">
        <h2 class="font-semibold">接続秘密鍵（config.php）</h2>
        <p class="mt-1 text-xs text-emerald-200/60">
          php_installer と同じく config.php に動的保存します。リポジトリの Sample は使いません。
        </p>
        <form method="post" class="mt-3 grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="form" value="rotate_secrets" />
          <label class="text-[11px] text-emerald-300/70">API キー（空なら再発行）
            <input name="api_key" class="mt-1 w-full rounded-xl border border-emerald-700 bg-emerald-950/60 px-3 py-2 text-sm" placeholder="空で新規ランダム" />
          </label>
          <label class="text-[11px] text-emerald-300/70">ADMIN キー（空なら API キーと同じ）
            <input name="admin_key_new" class="mt-1 w-full rounded-xl border border-emerald-700 bg-emerald-950/60 px-3 py-2 text-sm" />
          </label>
          <label class="text-[11px] text-emerald-300/70">Basic ユーザー
            <input name="basic_user" value="<?= h(defined('BASIC_AUTH_USER') ? (string)BASIC_AUTH_USER : '') ?>" class="mt-1 w-full rounded-xl border border-emerald-700 bg-emerald-950/60 px-3 py-2 text-sm" />
          </label>
          <label class="text-[11px] text-emerald-300/70">Basic パスワード
            <input type="password" name="basic_pass" class="mt-1 w-full rounded-xl border border-emerald-700 bg-emerald-950/60 px-3 py-2 text-sm" placeholder="変更するときだけ" />
          </label>
          <div class="sm:col-span-2">
            <button class="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold">config.php を更新</button>
          </div>
        </form>
      </section>

      <div class="grid gap-6 lg:grid-cols-2">
        <!-- unique IPs -->
        <section class="rounded-3xl border border-emerald-700/40 bg-emerald-900/40 p-5">
          <h2 class="font-semibold mb-3"><i class="fa-solid fa-network-wired mr-2 text-emerald-400"></i>接続元 IP</h2>
          <div class="overflow-x-auto max-h-80 overflow-y-auto">
            <table class="w-full text-xs">
              <thead class="text-emerald-300/60 text-left">
                <tr><th class="py-1">IP</th><th>回数</th><th>最終</th><th></th></tr>
              </thead>
              <tbody>
              <?php if (!$ips): ?>
                <tr><td colspan="4" class="py-6 text-center text-emerald-200/50">まだ接続がありません。クライアントから接続確認してください。</td></tr>
              <?php endif; ?>
              <?php foreach ($ips as $row): ?>
                <tr class="border-t border-emerald-800/60">
                  <td class="py-2 font-mono"><?= h($row['ip']) ?></td>
                  <td><?= (int)$row['hits'] ?></td>
                  <td class="text-emerald-200/60"><?= h($row['last_seen']) ?></td>
                  <td>
                    <form method="post" class="inline">
                      <input type="hidden" name="form" value="add_from_log" />
                      <input type="hidden" name="ip" value="<?= h($row['ip']) ?>" />
                      <button class="text-emerald-300 underline">許可へ</button>
                    </form>
                  </td>
                </tr>
              <?php endforeach; ?>
              </tbody>
            </table>
          </div>
        </section>

        <!-- allowlist -->
        <section class="rounded-3xl border border-emerald-700/40 bg-emerald-900/40 p-5">
          <h2 class="font-semibold mb-3">
            <i class="fa-solid fa-shield-halved mr-2 text-emerald-400"></i>
            許可 IP
            <?php if ($enforce): ?>
              <span class="ml-2 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300">制限 ON</span>
            <?php else: ?>
              <span class="ml-2 rounded-full bg-slate-500/20 px-2 py-0.5 text-[10px] text-slate-300">制限 OFF</span>
            <?php endif; ?>
          </h2>

          <form method="post" class="flex flex-wrap gap-2 mb-3">
            <input type="hidden" name="form" value="add_ip" />
            <input name="ip" placeholder="203.0.113.10" required
                   class="flex-1 min-w-[8rem] rounded-xl border border-emerald-700 bg-emerald-950/50 px-3 py-2 text-sm font-mono" />
            <input name="label" placeholder="メモ（自宅など）"
                   class="flex-1 min-w-[6rem] rounded-xl border border-emerald-700 bg-emerald-950/50 px-3 py-2 text-sm" />
            <button class="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium">追加</button>
          </form>

          <ul class="space-y-1 text-sm max-h-48 overflow-y-auto">
            <?php if (!$allowlist): ?>
              <li class="text-xs text-emerald-200/50 py-2">許可リストは空です</li>
            <?php endif; ?>
            <?php foreach ($allowlist as $a): ?>
              <li class="flex items-center gap-2 border-t border-emerald-800/50 py-2">
                <span class="font-mono text-xs <?= (int)$a['enabled'] ? '' : 'opacity-40 line-through' ?>"><?= h($a['ip']) ?></span>
                <span class="text-[11px] text-emerald-200/50 flex-1 truncate"><?= h($a['label'] ?? '') ?></span>
                <form method="post" class="inline">
                  <input type="hidden" name="form" value="toggle_ip" />
                  <input type="hidden" name="id" value="<?= (int)$a['id'] ?>" />
                  <button class="text-[11px] text-emerald-300 underline">切替</button>
                </form>
                <form method="post" class="inline" onsubmit="return confirm('削除しますか？')">
                  <input type="hidden" name="form" value="remove_ip" />
                  <input type="hidden" name="id" value="<?= (int)$a['id'] ?>" />
                  <button class="text-[11px] text-red-300 underline">削除</button>
                </form>
              </li>
            <?php endforeach; ?>
          </ul>

          <div class="mt-4 flex flex-wrap gap-2">
            <form method="post">
              <input type="hidden" name="form" value="write_htaccess" />
              <input type="hidden" name="mode" value="preview" />
              <button class="rounded-xl border border-emerald-600 px-3 py-2 text-xs">プレビュー</button>
            </form>
            <form method="post">
              <input type="hidden" name="form" value="write_htaccess" />
              <input type="hidden" name="mode" value="write" />
              <button class="rounded-xl border border-emerald-600 px-3 py-2 text-xs">.htaccess 書込（制限OFF）</button>
            </form>
            <form method="post" onsubmit="return confirm('許可 IP 以外は proxy.php に届かなくなります。続行しますか？')">
              <input type="hidden" name="form" value="write_htaccess" />
              <input type="hidden" name="mode" value="enforce_write" />
              <button class="rounded-xl bg-amber-600/90 px-3 py-2 text-xs font-semibold">IP制限を ON にして書込</button>
            </form>
            <form method="post">
              <input type="hidden" name="form" value="write_htaccess" />
              <input type="hidden" name="mode" value="disable_write" />
              <button class="rounded-xl border border-slate-500 px-3 py-2 text-xs">制限 OFF にして書込</button>
            </form>
          </div>
        </section>
      </div>

      <!-- htaccess preview -->
      <section class="mt-6 rounded-3xl border border-emerald-700/40 bg-emerald-900/40 p-5">
        <h2 class="font-semibold mb-2"><i class="fa-solid fa-file-code mr-2 text-emerald-400"></i>api/.htaccess プレビュー</h2>
        <pre class="max-h-64 overflow-auto rounded-xl bg-emerald-950/70 p-3 text-[11px] leading-relaxed text-emerald-100/90 whitespace-pre-wrap"><?= h($htaccessPreview) ?></pre>
      </section>

      <!-- recent logs -->
      <section class="mt-6 rounded-3xl border border-emerald-700/40 bg-emerald-900/40 p-5">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 class="font-semibold"><i class="fa-solid fa-list mr-2 text-emerald-400"></i>接続ログ（直近50）</h2>
          <form method="post" onsubmit="return confirm('ログを全削除しますか？')">
            <input type="hidden" name="form" value="clear_logs" />
            <button class="text-xs text-red-300 underline">ログクリア</button>
          </form>
        </div>
        <div class="overflow-x-auto max-h-96 overflow-y-auto">
          <table class="w-full text-[11px]">
            <thead class="text-left text-emerald-300/60 sticky top-0 bg-emerald-900">
              <tr>
                <th class="py-1 pr-2">時刻</th>
                <th class="pr-2">IP</th>
                <th class="pr-2">action</th>
                <th class="pr-2">OK</th>
                <th class="pr-2">origin</th>
                <th>note</th>
              </tr>
            </thead>
            <tbody>
            <?php if (!$logs): ?>
              <tr><td colspan="6" class="py-8 text-center text-emerald-200/50">ログなし — クライアントで接続確認するとここに出ます</td></tr>
            <?php endif; ?>
            <?php foreach ($logs as $log): ?>
              <tr class="border-t border-emerald-800/50">
                <td class="py-1.5 pr-2 whitespace-nowrap text-emerald-200/60"><?= h($log['created_at']) ?></td>
                <td class="pr-2 font-mono"><?= h($log['ip']) ?></td>
                <td class="pr-2"><?= h($log['action']) ?></td>
                <td class="pr-2"><?= (int)$log['ok'] ? '✓' : '✗' ?> <?= (int)$log['http_status'] ?></td>
                <td class="pr-2 max-w-[8rem] truncate"><?= h($log['origin'] ?? '') ?></td>
                <td class="max-w-[10rem] truncate text-emerald-200/50"><?= h($log['note'] ?? '') ?></td>
              </tr>
            <?php endforeach; ?>
            </tbody>
          </table>
        </div>
      </section>

      <p class="mt-8 text-center text-[11px] text-emerald-200/40">
        <a href="index.html" class="underline">トップ</a> ·
        <a href="install.php" class="underline">install</a> ·
        setup.php · php_installer 互換
      </p>
    <?php endif; ?>
  </div>
</body>
</html>
