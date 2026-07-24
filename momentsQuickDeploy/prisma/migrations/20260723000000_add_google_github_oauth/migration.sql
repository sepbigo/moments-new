INSERT INTO `config` (`k`, `v`, `name`, `description`, `category`, `sort`, `access_level`)
VALUES
    ('google_oauth2', '0', 'Google 快捷登录', '是否允许 Google 第三方快捷登录', 'oauth2', 100, 'public'),
    ('google_client_id', '', 'Google Client ID', 'Google OAuth Client ID', 'oauth2', 110, 'admin'),
    ('google_client_secret', '', 'Google Client Secret', 'Google OAuth Client Secret', 'oauth2', 120, 'admin'),
    ('github_oauth2', '0', 'GitHub 快捷登录', '是否允许 GitHub 第三方快捷登录', 'oauth2', 130, 'public'),
    ('github_client_id', '', 'GitHub Client ID', 'GitHub OAuth Client ID', 'oauth2', 140, 'admin'),
    ('github_client_secret', '', 'GitHub Client Secret', 'GitHub OAuth Client Secret', 'oauth2', 150, 'admin')
ON DUPLICATE KEY UPDATE
    `name` = VALUES(`name`),
    `description` = VALUES(`description`),
    `category` = VALUES(`category`),
    `sort` = VALUES(`sort`),
    `access_level` = VALUES(`access_level`);
