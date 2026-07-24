INSERT INTO `config` (`k`, `v`, `name`, `description`, `category`, `sort`, `access_level`)
VALUES
    ('nodeloc_oauth2', '0', 'NodeLoc 快捷登录', '是否允许 NodeLoc 第三方快捷登录', 'oauth2', 45, 'public'),
    ('nodeloc_url', 'https://www.nodeloc.com', 'NodeLoc 站点地址', 'NodeLoc OAuth Provider 站点地址，默认 https://www.nodeloc.com', 'oauth2', 46, 'admin'),
    ('nodeloc_client_id', '', 'NodeLoc Client ID', 'NodeLoc OAuth Client ID', 'oauth2', 47, 'admin'),
    ('nodeloc_client_secret', '', 'NodeLoc Client Secret', 'NodeLoc OAuth Client Secret', 'oauth2', 48, 'admin')
ON DUPLICATE KEY UPDATE
    `name` = VALUES(`name`),
    `description` = VALUES(`description`),
    `category` = VALUES(`category`),
    `sort` = VALUES(`sort`),
    `access_level` = VALUES(`access_level`);
