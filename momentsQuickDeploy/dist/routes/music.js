import { Router } from 'express';
import { getMusicPlaylist, getMusicStatus, resolveMusicUrl, resolvePlaylistSongUrl, } from '../services/music/music.service.js';
import { Logger } from '../utils/logger.js';
const router = Router();
const logger = new Logger('MusicRoute');
router.get('/status', async (_req, res) => {
    try {
        const status = await getMusicStatus();
        return res.status(200).json({ success: true, data: status });
    }
    catch (error) {
        logger.error('获取音乐状态失败', error instanceof Error ? error.stack : String(error));
        return res.status(500).json({
            success: false,
            message: error instanceof Error ? error.message : '获取音乐状态失败',
        });
    }
});
router.get('/playlist', async (req, res) => {
    try {
        const force = req.query.refresh === '1' || req.query.refresh === 'true';
        const data = await getMusicPlaylist(force);
        return res.status(200).json({
            success: true,
            data: {
                url: data.url,
                cached: data.cached,
                mode: data.mode,
                info: data.info,
                count: data.songs.length,
                songs: data.songs,
            },
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : '获取歌单失败';
        logger.warn(`获取歌单失败: ${message}`);
        const code = /未启用|未配置|无效/.test(message) ? 400 : 500;
        return res.status(code).json({ success: false, message });
    }
});
/**
 * 直接按 LX 协议解析播放地址
 * body/query:
 *  - source: kw|kg|tx|wy|mg
 *  - quality: 128k|320k|flac|flac24bit
 *  - musicInfo: object（或扁平字段）
 */
router.post('/url', async (req, res) => {
    try {
        const body = req.body || {};
        const result = await resolveMusicUrl({
            source: body.source,
            quality: body.quality,
            musicInfo: body.musicInfo || body,
            song: body.song,
        });
        return res.status(200).json({ success: true, data: result });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : '获取播放地址失败';
        logger.warn(`获取播放地址失败: ${message}`);
        const code = /未启用|缺少|未配置|无效/.test(message) ? 400 : 502;
        return res.status(code).json({ success: false, message });
    }
});
/** 按歌单内歌曲 id 取播放地址 */
router.get('/url', async (req, res) => {
    try {
        const id = String(req.query.id || '').trim();
        const quality = req.query.quality ? String(req.query.quality) : undefined;
        if (!id) {
            return res.status(400).json({ success: false, message: '缺少 id（歌单内歌曲 id）' });
        }
        const result = await resolvePlaylistSongUrl({ id, quality });
        return res.status(200).json({
            success: true,
            data: {
                url: result.url,
                source: result.source,
                quality: result.quality,
                from: result.from,
                song: {
                    id: result.song.id,
                    name: result.song.name,
                    singer: result.song.singer,
                    source: result.song.source,
                },
            },
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : '获取播放地址失败';
        logger.warn(`GET 播放地址失败: ${message}`);
        const code = /未启用|未找到|未配置|缺少/.test(message) ? 400 : 502;
        return res.status(code).json({ success: false, message });
    }
});
export default router;
