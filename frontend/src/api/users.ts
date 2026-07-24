import service from '@/api/request'
import type { updateUserInfoData, updatePasswordData } from '@/types/user'

export type OAuthAccount = {
    id: string
    provider: 'linux_do' | 'nodeloc' | 'rainbow' | 'google' | 'github' | string
    providerType?: string | null
    providerUserId: string
    nickname?: string | null
    avatar?: string | null
    email?: string | null
    lastLoginAt?: string | null
    createdAt?: string | null
}

// 获取用户信息
export const getUserInfo = () => {
    return service({
        url: '/user',
        method: 'get'
    })
}
// 获取当前用户绑定的第三方账号
export const getOAuthAccounts = () => {
    return service({
        url: '/user/oauth-accounts',
        method: 'get'
    })
}

// 更新用户信息
export const updateUserInfo = (data: updateUserInfoData) => {
    return service({
        url: '/user',
        method: 'patch',
        data
    })
}
// 根据 用户名 查询一些用户信息，主要是id
export const getUserIdByUsername = (username:any) => {
    return service({
        url: `/user/${username}`,
        method: 'get'
    })
}

// 更新密码
export const changePassword = (data: updatePasswordData) => {
    return service({
        url: `/user/password`,
        method: 'patch',
        data
    })
}