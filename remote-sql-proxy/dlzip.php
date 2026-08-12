<?php
// =============================================
// dlzip.php — ZIPでくれ（機密マスク付き）
// Based on php_installer by https://x.com/mss_0337_2024
// =============================================

ob_start();
date_default_timezone_set('Asia/Tokyo');

function showError($message) {
    ob_end_clean();
    header('Content-Type: text/plain; charset=utf-8');
    die("エラー: " . $message);
}

$hostname = $_SERVER['HTTP_HOST'] ?? gethostname() ?? 'unknown-server';
$ts = date('Ymd_His');
$safeHostname = preg_replace('/[^a-zA-Z0-9._-]/', '', $hostname);
$zipFileName = sys_get_temp_dir() . '/' . $safeHostname . '_fuwari_' . $ts . '.zip';

if (!class_exists('ZipArchive')) {
    showError('ZipArchive が使えません。PHP zip 拡張を有効にしてください。');
}

$zip = new ZipArchive();
if ($zip->open($zipFileName, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== TRUE) {
    showError('ZIP の作成に失敗しました。');
}

function maskSensitiveConfig($content) {
    $content = preg_replace(
        [
            '/(define\s*\(\s*[\'"]DB_USER[\'"]\s*,\s*[\'"]).*?([\'"]\s*\)\s*;)/i',
            '/(define\s*\(\s*[\'"]DB_PASS[\'"]\s*,\s*[\'"]).*?([\'"]\s*\)\s*;)/i',
            '/(define\s*\(\s*[\'"]DB_NAME[\'"]\s*,\s*[\'"]).*?([\'"]\s*\)\s*;)/i',
            '/(define\s*\(\s*[\'"]API_KEY[\'"]\s*,\s*[\'"]).*?([\'"]\s*\)\s*;)/i',
        ],
        [
            '${1}Sample${2}',
            '${1}Sample${2}',
            '${1}Sample${2}',
            '${1}CHANGE_ME_LONG_RANDOM_API_KEY${2}',
        ],
        $content
    );
    $content = preg_replace_callback(
        '/define\s*\(\s*[\'"]([A-Za-z0-9_]+_SECRET)[\'"]\s*,\s*[\'"].*?[\'"]\s*\)\s*;/i',
        function ($matches) {
            return "define('" . $matches[1] . "', 'Randam Gen length 40 over Secret');";
        },
        $content
    );
    return $content;
}

function addFilesToZip($dir, $zip, $baseDir = '') {
    $files = @scandir($dir);
    if ($files === false) return;
    foreach ($files as $file) {
        if ($file === '.' || $file === '..') continue;
        // skip generated archives / install rename leftovers not needed
        if (preg_match('/\.zip$/i', $file)) continue;
        $filePath = @realpath($dir . DIRECTORY_SEPARATOR . $file);
        if ($filePath === false) continue;
        $relativePath = $baseDir . $file;
        if (is_file($filePath)) {
            if ($file === 'config.php') {
                $content = @file_get_contents($filePath);
                if ($content !== false) {
                    $zip->addFromString($relativePath, maskSensitiveConfig($content));
                }
            } else {
                $zip->addFile($filePath, $relativePath);
            }
        } elseif (is_dir($filePath)) {
            $zip->addEmptyDir($relativePath);
            addFilesToZip($filePath, $zip, $relativePath . DIRECTORY_SEPARATOR);
        }
    }
}

addFilesToZip(__DIR__, $zip, 'fuwari-remote/');
$zip->close();

if (!file_exists($zipFileName)) {
    showError('ZIP の生成に失敗しました。');
}

ob_end_clean();
header('Content-Type: application/zip');
header('Content-Disposition: attachment; filename="' . basename($zipFileName) . '"');
header('Content-Length: ' . filesize($zipFileName));
header('Cache-Control: no-cache, must-revalidate');
readfile($zipFileName);
@unlink($zipFileName);
exit;
