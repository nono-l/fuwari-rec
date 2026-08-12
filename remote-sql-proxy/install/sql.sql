-- Fuwari REC — schema for HTTPS MySQL proxy

CREATE TABLE IF NOT EXISTS kv_store (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  namespace     VARCHAR(64)  NOT NULL,
  item_key     VARCHAR(191) NOT NULL,
  value_json   LONGTEXT     NOT NULL,
  updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                             ON UPDATE CURRENT_TIMESTAMP,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ns_key (namespace, item_key),
  KEY idx_ns_updated (namespace, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS snapshots (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  namespace     VARCHAR(64)  NOT NULL,
  title        VARCHAR(191) NOT NULL,
  kind         VARCHAR(32)  NOT NULL DEFAULT 'project',
  payload_json LONGTEXT     NOT NULL,
  updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                             ON UPDATE CURRENT_TIMESTAMP,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ns_kind (namespace, kind, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Connection audit (setup.php と ping で参照)
CREATE TABLE IF NOT EXISTS access_log (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ip           VARCHAR(45)  NOT NULL,
  action       VARCHAR(48)  NOT NULL,
  ok           TINYINT(1)   NOT NULL DEFAULT 1,
  http_status  SMALLINT     NOT NULL DEFAULT 200,
  origin       VARCHAR(255) NULL,
  user_agent   VARCHAR(512) NULL,
  namespace    VARCHAR(64)  NULL,
  note         VARCHAR(255) NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_created (created_at),
  KEY idx_ip_created (ip, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Manual IP allowlist (setup が .htaccess 生成に使用)
CREATE TABLE IF NOT EXISTS ip_allowlist (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ip           VARCHAR(45)  NOT NULL,
  label        VARCHAR(128) NULL,
  enabled      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ip (ip)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
