<?php
/**
 * Load the active app profile. Used by install.php / setup.php / config defaults.
 */
declare(strict_types=1);

function grokbuild_profile(): array {
    static $cached = null;
    if (is_array($cached)) {
        return $cached;
    }
    $path = __DIR__ . '/active.php';
    $loaded = is_file($path) ? require $path : [];
    $cached = array_merge([
        'id' => 'app',
        'name' => 'Application',
        'edition' => 'Remote',
        'version' => 'v1.0',
        'tagline' => '',
        'setup_hint' => '',
        'namespace_prefix' => 'app',
        'settings_key' => 'settings.latest',
        'cors' => [],
    ], is_array($loaded) ? $loaded : []);
    return $cached;
}

function grokbuild_profile_get(string $key, mixed $default = null): mixed {
    $p = grokbuild_profile();
    return $p[$key] ?? $default;
}
