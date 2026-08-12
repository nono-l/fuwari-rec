<?php
/**
 * 新しいアプリのプロファイル雛形。
 * 1. このファイルを apps/{id}.php にコピー
 * 2. apps/active.php を `return require __DIR__ . '/{id}.php';` に変更
 * 3. フロントは packages/core-client + packages/apps/{id}
 */
return [
    'id'       => 'myapp',
    'name'     => 'My Application',
    'edition'  => 'Remote',
    'version'  => 'v1.0',
    'tagline'  => '',
    'setup_hint' => 'クライアントから ping すると接続ログに残ります。',
    'namespace_prefix' => 'myapp',
    'settings_key' => 'settings.latest',
    'cors' => [
        'http://localhost:8080',
        'http://127.0.0.1:8080',
    ],
];
