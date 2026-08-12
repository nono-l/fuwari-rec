<?php
/**
 * App profile — Fuwari REC
 * コア（proxy / install / setup）はアプリ名を知らない。ここだけ差し替える。
 */
return [
    'id'       => 'fuwari',
    'name'     => 'Fuwari REC',
    'edition'  => 'Remote',
    'version'  => 'v1.2',
    'tagline'  => 'もっと手軽に 歌える',
    'setup_hint' => 'アプリの「リモート管理」で接続確認すると、ここに ping が残ります。',
    'namespace_prefix' => 'fuwari',
    'settings_key' => 'settings.latest',
    'cors' => [
        'https://fuwa.pachimanzi.uk',
        'https://fuwa-rec.grok.me',
        'http://localhost:8080',
        'http://127.0.0.1:8080',
    ],
];
