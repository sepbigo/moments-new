CREATE TABLE `user_oauth_accounts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `provider` VARCHAR(32) NOT NULL,
  `provider_type` VARCHAR(32) NOT NULL DEFAULT '',
  `provider_user_id` VARCHAR(191) NOT NULL,
  `nickname` VARCHAR(100) NULL,
  `avatar` VARCHAR(255) NULL,
  `email` VARCHAR(120) NULL,
  `access_token` TEXT NULL,
  `refresh_token` TEXT NULL,
  `raw_profile` JSON NULL,
  `last_login_at` TIMESTAMP(0) NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_oauth_provider_identity` (`provider`, `provider_type`, `provider_user_id`),
  INDEX `idx_oauth_user_id` (`user_id`),
  CONSTRAINT `user_oauth_accounts_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `config` (`k`, `v`, `name`, `description`, `category`, `sort`, `access_level`)
VALUES
    ('oauth2_redirect_uri', '', '统一回调 URI', 'OAuth 授权成功后的后端统一回调 URI，例如 https://moments.example.com/api/auth/callback；留空时自动使用当前请求域名', 'oauth2', 10, 'admin'),
    ('linux_do_oauth2', '0', 'Linux.Do 快捷登录', '是否允许 Linux.Do 第三方快捷登录', 'oauth2', 20, 'public'),
    ('linux_do_client_id', '', 'Linux.Do Client ID', 'Linux.Do OAuth Client ID', 'oauth2', 30, 'admin'),
    ('linux_do_client_secret', '', 'Linux.Do Client Secret', 'Linux.Do OAuth Client Secret', 'oauth2', 40, 'admin'),
    ('rainbow_oauth2', '0', '彩虹聚合登录', '是否允许彩虹聚合第三方登录', 'oauth2', 50, 'public'),
    ('rainbow_oauth2_api_url', 'https://u.xiaobaixuan.com/connect.php', '彩虹接口地址', '彩虹聚合登录 connect.php 接口地址，例如 https://u.xiaobaixuan.com/connect.php', 'oauth2', 60, 'admin'),
    ('rainbow_oauth2_appid', '', '彩虹 App ID', '彩虹聚合登录创建的应用 ID', 'oauth2', 70, 'admin'),
    ('rainbow_oauth2_appkey', '', '彩虹 App Key', '彩虹聚合登录创建的应用 Key', 'oauth2', 80, 'admin'),
    ('rainbow_oauth2_type', 'qq,wx,alipay', '彩虹登录平台', '彩虹聚合登录允许的平台，使用英文逗号隔开，例如 qq,wx,alipay,baidu,microsoft', 'oauth2', 90, 'public')
ON DUPLICATE KEY UPDATE
    `name` = VALUES(`name`),
    `description` = VALUES(`description`),
    `category` = VALUES(`category`),
    `sort` = VALUES(`sort`),
    `access_level` = VALUES(`access_level`);
