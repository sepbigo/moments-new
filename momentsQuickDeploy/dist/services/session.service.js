import { prisma } from '../lib/prisma.js';
export class SessionService {
    async createSession(session) {
        await prisma.user_sessions.create({
            data: {
                user_id: session.userId,
                session_id: session.sid,
                device_fingerprint: session.deviceFingerprint ?? null,
                access_jti: session.accessJti,
                refresh_jti: session.refreshJti,
                status: session.status,
                access_expires_at: session.accessExpiresAt,
                refresh_expires_at: session.refreshExpiresAt,
                last_active_at: new Date(),
            },
        });
    }
    async getSession(sid) {
        const session = await prisma.user_sessions.findUnique({ where: { session_id: sid } });
        if (!session)
            return null;
        return {
            userId: session.user_id,
            sid: session.session_id,
            deviceFingerprint: session.device_fingerprint,
            accessJti: session.access_jti,
            refreshJti: session.refresh_jti,
            status: session.status,
            accessExpiresAt: session.access_expires_at,
            refreshExpiresAt: session.refresh_expires_at,
        };
    }
    async resolveSidByRefreshJti(refreshJti) {
        const session = await prisma.user_sessions.findFirst({
            where: {
                refresh_jti: refreshJti,
                status: 'active',
                refresh_expires_at: { gt: new Date() },
            },
            select: { session_id: true },
        });
        return session?.session_id ?? null;
    }
    async rotateJtis(sid, currentRefreshJti, next) {
        const result = await prisma.user_sessions.updateMany({
            where: {
                session_id: sid,
                refresh_jti: currentRefreshJti,
                status: 'active',
                refresh_expires_at: { gt: new Date() },
            },
            data: {
                access_jti: next.accessJti,
                refresh_jti: next.refreshJti,
                access_expires_at: next.accessExpiresAt,
                refresh_expires_at: next.refreshExpiresAt,
                last_active_at: new Date(),
            },
        });
        return result.count === 1;
    }
    async revokeSession(userId, sid) {
        await prisma.user_sessions.updateMany({
            where: { user_id: userId, session_id: sid, status: 'active' },
            data: { status: 'revoked', last_active_at: new Date() },
        });
    }
    async revokeAllSessions(userId) {
        await prisma.user_sessions.updateMany({
            where: { user_id: userId, status: 'active' },
            data: { status: 'revoked', last_active_at: new Date() },
        });
    }
    async validateAccess(input) {
        if (typeof input.sid !== 'string' || typeof input.jti !== 'string')
            return false;
        if (typeof input.userId !== 'string')
            return false;
        const session = await prisma.user_sessions.findFirst({
            where: {
                session_id: input.sid,
                user_id: BigInt(input.userId),
                access_jti: input.jti,
                status: 'active',
                access_expires_at: { gt: new Date() },
                refresh_expires_at: { gt: new Date() },
            },
            select: { id: true },
        });
        return Boolean(session);
    }
}
export const sessionService = new SessionService();
