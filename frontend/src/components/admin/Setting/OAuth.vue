<script setup lang="ts" name="OAuthSetting">
import ConfigForm from './ConfigForm.vue'
import type { ConfigFieldSchema } from './types'

const fields: ConfigFieldSchema[] = [
  { key: 'oauth2_redirect_uri', placeholder: '留空自动使用 https://当前域名/api/auth/callback' },
  {
    key: 'linux_do_oauth2',
    type: 'switch' as const,
    trueValue: '1',
    falseValue: '0',
    trueText: '已启用',
    falseText: '已关闭',
  },
  { key: 'linux_do_client_id', placeholder: 'Linux.Do OAuth Client ID' },
  { key: 'linux_do_client_secret', type: 'password' as const, placeholder: 'Linux.Do OAuth Client Secret' },
  {
    key: 'nodeloc_oauth2',
    type: 'switch' as const,
    trueValue: '1',
    falseValue: '0',
    trueText: '已启用',
    falseText: '已关闭',
  },
  { key: 'nodeloc_url', placeholder: 'https://www.nodeloc.com' },
  { key: 'nodeloc_client_id', placeholder: 'NodeLoc OAuth Client ID' },
  { key: 'nodeloc_client_secret', type: 'password' as const, placeholder: 'NodeLoc OAuth Client Secret' },
  {
    key: 'rainbow_oauth2',
    type: 'switch' as const,
    trueValue: '1',
    falseValue: '0',
    trueText: '已启用',
    falseText: '已关闭',
  },
  { key: 'rainbow_oauth2_api_url', placeholder: 'https://u.xiaobaixuan.com/connect.php' },
  { key: 'rainbow_oauth2_appid', placeholder: '彩虹聚合登录应用 ID' },
  { key: 'rainbow_oauth2_appkey', type: 'password' as const, placeholder: '彩虹聚合登录应用 Key' },
  { key: 'rainbow_oauth2_type', placeholder: 'qq,wx,alipay,baidu,microsoft' },
]
</script>

<template>
  <ConfigForm
    title="OAuth 登录"
    description="配置统一回调 URI、Linux.Do、NodeLoc 与彩虹聚合登录。启用后，公开配置会控制前台登录弹窗显示对应入口；密钥类配置仅管理员可见。"
    category="oauth2"
    :fields="fields"
  />
</template>
