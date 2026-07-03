import { NoticeType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { Logger } from '../utils/logger.js';
const logger = new Logger('NoticeService');
const CONTENT_PREVIEW_LENGTH = 80;
function toBigInt(value) {
    return typeof value === 'bigint' ? value : BigInt(value);
}
function preview(value) {
    const cleanValue = value.replace(/\s+/g, ' ').trim();
    return cleanValue.length > CONTENT_PREVIEW_LENGTH
        ? `${cleanValue.slice(0, CONTENT_PREVIEW_LENGTH)}...`
        : cleanValue;
}
function serializeNotice(notice) {
    return {
        ...notice,
        id: notice.id.toString(),
        from: notice.from?.toString() ?? null,
        to: notice.to.toString(),
        target_id: notice.target_id?.toString() ?? null,
        sender: notice.sender ? {
            ...notice.sender,
            id: notice.sender.id.toString(),
        } : null,
    };
}
const noticeInclude = {
    sender: {
        select: {
            id: true,
            username: true,
            nickname: true,
            avatar: true,
        },
    },
};
export const noticeService = {
    async createNotice(input) {
        const from = input.from == null ? null : toBigInt(input.from);
        const to = toBigInt(input.to);
        if (from && from === to)
            return null;
        try {
            return await prisma.notices.create({
                data: {
                    from,
                    to,
                    type: input.type,
                    title: input.title,
                    content: input.content,
                    target_type: input.targetType,
                    target_id: input.targetId == null ? null : toBigInt(input.targetId),
                    link: input.link,
                },
            });
        }
        catch (error) {
            logger.error('创建通知失败', error instanceof Error ? error.stack : String(error));
            return null;
        }
    },
    async createCommentNotice(params) {
        return this.createNotice({
            from: params.fromUserId,
            to: params.articleAuthorId,
            type: NoticeType.COMMENT,
            title: '有人评论了你的瞬刻',
            content: `${params.actorName}：${preview(params.content)}`,
            targetType: 'article',
            targetId: params.articleId,
            link: `/article/${params.articleId.toString()}`,
        });
    },
    async createReplyNotice(params) {
        return this.createNotice({
            from: params.fromUserId,
            to: params.replyToUserId,
            type: NoticeType.COMMENT,
            title: '有人回复了你的评论',
            content: `${params.actorName}：${preview(params.content)}`,
            targetType: 'comment',
            targetId: params.commentId,
            link: `/article/${params.articleId.toString()}`,
        });
    },
    async createLikeNotice(params) {
        return this.createNotice({
            from: params.fromUserId,
            to: params.articleAuthorId,
            type: NoticeType.LIKE,
            title: '有人喜欢了你的瞬刻',
            content: `${params.actorName} 点赞了你的内容`,
            targetType: 'article',
            targetId: params.articleId,
            link: `/article/${params.articleId.toString()}`,
        });
    },
    async createSystemNotice(params) {
        return this.createNotice({
            from: null,
            to: params.to,
            type: NoticeType.SYSTEM,
            title: params.title,
            content: params.content,
            targetType: 'system',
            link: params.link,
        });
    },
    async listUserNotices(query) {
        const page = Math.max(query.page || 1, 1);
        const pageSize = Math.min(Math.max(query.pageSize || 10, 1), 50);
        const where = {
            to: toBigInt(query.userId),
            deleted_at: null,
            ...(query.read !== undefined ? { read: query.read } : {}),
            ...(query.type ? { type: query.type } : {}),
        };
        const [items, total] = await prisma.$transaction([
            prisma.notices.findMany({
                where,
                include: noticeInclude,
                orderBy: { created_at: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            prisma.notices.count({ where }),
        ]);
        return {
            data: items.map(serializeNotice),
            page,
            pageSize,
            total,
        };
    },
    async getUnreadCount(userId) {
        return prisma.notices.count({
            where: {
                to: toBigInt(userId),
                read: false,
                deleted_at: null,
            },
        });
    },
    async markAsRead(userId, noticeId) {
        const result = await prisma.notices.updateMany({
            where: {
                id: toBigInt(noticeId),
                to: toBigInt(userId),
                deleted_at: null,
            },
            data: {
                read: true,
                read_at: new Date(),
            },
        });
        return result.count > 0;
    },
    async markAllAsRead(userId) {
        return prisma.notices.updateMany({
            where: {
                to: toBigInt(userId),
                read: false,
                deleted_at: null,
            },
            data: {
                read: true,
                read_at: new Date(),
            },
        });
    },
    async deleteNotice(userId, noticeId) {
        const result = await prisma.notices.updateMany({
            where: {
                id: toBigInt(noticeId),
                to: toBigInt(userId),
                deleted_at: null,
            },
            data: {
                deleted_at: new Date(),
            },
        });
        return result.count > 0;
    },
};
