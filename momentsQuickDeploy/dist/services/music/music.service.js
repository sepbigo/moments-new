import axios from 'axios';
import { getConfigCache } from '../config.service.js';
import { Logger } from '../../utils/logger.js';
import { LxScriptRuntime } from './lx-runtime.js';
import { fetchPlatformPlaylist, isPlatformPlaylistUrl } from './playlist-providers.js';
const logger = new Logger('MusicService');
const QUALITIES = ['128k', '320k', 'flac', 'flac24bit'];
let runtimes = [];
let runtimeKey = '';
let playlistCache = null;
function parseSourceUrls(raw) {
    return String(raw || '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => /^https?:\/\//i.test(s));
}
function parseTimeout(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 3000)
        return 15_000;
    return Math.min(Math.floor(n), 60_000);
}
function normalizeQuality(raw) {
    const q = String(raw || '320k');
    return QUALITIES.includes(q) ? q : '320k';
}
async function getMusicConfig() {
    const cache = await getConfigCache();
    return {
        enabled: cache.music_enabled === '1' || cache.music_enabled === 'true',
        sourceUrls: parseSourceUrls(cache.music_source_urls || ''),
        playlistUrl: String(cache.music_playlist_url || '').trim(),
        defaultQuality: normalizeQuality(cache.music_default_quality),
        timeoutMs: parseTimeout(cache.music_source_timeout_ms),
    };
}
async function ensureRuntimes() {
    const conf = await getMusicConfig();
    const key = `${conf.timeoutMs}::${conf.sourceUrls.join('|')}`;
    if (key !== runtimeKey) {
        runtimeKey = key;
        runtimes = conf.sourceUrls.map((url) => new LxScriptRuntime(url, conf.timeoutMs));
        logger.log(`音源运行时已重建，共 ${runtimes.length} 个`);
    }
    return runtimes;
}
export async function getMusicStatus() {
    const conf = await getMusicConfig();
    const list = conf.enabled ? await ensureRuntimes() : [];
    const sources = await Promise.all(list.map(async (rt) => {
        try {
            const state = await rt.ensureLoaded();
            return {
                url: rt.url,
                ready: true,
                platforms: Object.keys(state.sources),
            };
        }
        catch (error) {
            return {
                url: rt.url,
                ready: false,
                platforms: [],
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }));
    return {
        enabled: conf.enabled,
        defaultQuality: conf.defaultQuality,
        sourceCount: conf.sourceUrls.length,
        hasPlaylist: Boolean(conf.playlistUrl),
        sources,
    };
}
function normalizePlaylistPayload(body) {
    if (Array.isArray(body))
        return body;
    if (body && typeof body === 'object') {
        const obj = body;
        if (Array.isArray(obj.list))
            return obj.list;
        if (Array.isArray(obj.data))
            return obj.data;
        if (Array.isArray(obj.songs))
            return obj.songs;
    }
    throw new Error('歌单 JSON 格式无效，需为数组或包含 list/data/songs 数组');
}
export async function getMusicPlaylist(force = false) {
    const conf = await getMusicConfig();
    if (!conf.enabled)
        throw new Error('音乐功能未启用');
    if (!conf.playlistUrl)
        throw new Error('未配置歌单地址 music_playlist_url');
    const playlistInput = conf.playlistUrl;
    const isHttp = /^https?:\/\//i.test(playlistInput);
    const isPlatform = isPlatformPlaylistUrl(playlistInput);
    // 允许：平台链接 / 纯数字 id / 自定义 JSON URL
    if (!isHttp && !isPlatform && !/^\d{5,}$/.test(playlistInput) && !/^(wy|netease|kw|kg|tx|qq|mg)[:：#]/i.test(playlistInput)) {
        throw new Error('歌单地址无效：请填写平台歌单链接（如网易云）或 JSON 地址');
    }
    const now = Date.now();
    if (!force
        && playlistCache
        && playlistCache.url === playlistInput
        && now - playlistCache.at < 60_000) {
        return { url: playlistInput, songs: playlistCache.data, cached: true };
    }
    // 1) 平台歌单链接（LX 同款：网易云 / 酷我 / QQ）
    if (isPlatform) {
        const result = await fetchPlatformPlaylist(playlistInput);
        const songs = result.songs.map((item, index) => {
            const id = item.id ?? item.songmid ?? index;
            return {
                ...item,
                id: String(id),
                name: item.name || '未知歌曲',
                singer: item.singer || item.artist || '未知歌手',
                source: item.source || item.musicInfo?.source,
            };
        });
        playlistCache = { url: playlistInput, at: now, data: songs };
        return {
            url: playlistInput,
            songs,
            cached: false,
            mode: 'platform',
            info: {
                platform: result.platform,
                playlistId: result.playlistId,
                ...result.info,
            },
        };
    }
    // 2) 自定义 JSON 歌单
    if (!isHttp)
        throw new Error('自定义歌单地址必须是 http(s) URL');
    const res = await axios.get(playlistInput, {
        timeout: Math.max(conf.timeoutMs, 15_000),
        headers: {
            'user-agent': 'moments-music-gateway/1.0',
            accept: 'application/json,text/plain,*/*',
        },
    });
    const songs = normalizePlaylistPayload(res.data).map((item, index) => {
        const id = item.id ?? item.songmid ?? item.songId ?? item.hash ?? index;
        return {
            ...item,
            id,
            name: item.name || item.songname || item.title || '未知歌曲',
            singer: item.singer || item.artist || item.singername || '未知歌手',
            source: item.source || item.musicInfo?.source,
        };
    });
    playlistCache = { url: playlistInput, at: now, data: songs };
    return { url: playlistInput, songs, cached: false, mode: 'json' };
}
function buildMusicInfo(input) {
    // 兼容：直接传 LX musicInfo，或扁平字段
    if (input.musicInfo && typeof input.musicInfo === 'object') {
        return { ...input.musicInfo };
    }
    return { ...input };
}
export async function resolveMusicUrl(params) {
    const conf = await getMusicConfig();
    if (!conf.enabled)
        throw new Error('音乐功能未启用');
    const quality = normalizeQuality(params.quality || conf.defaultQuality);
    const song = params.song;
    const musicInfo = buildMusicInfo({
        ...(song || {}),
        ...(params.musicInfo || {}),
        ...(song?.musicInfo || {}),
    });
    const source = String(params.source
        || song?.source
        || musicInfo.source
        || '').trim();
    if (!source)
        throw new Error('缺少 source（kw/kg/tx/wy/mg）');
    if (!musicInfo || Object.keys(musicInfo).length === 0) {
        throw new Error('缺少 musicInfo 歌曲信息');
    }
    // 补齐常见字段别名，方便脚本读取
    if (musicInfo.songmid == null && musicInfo.songId != null)
        musicInfo.songmid = musicInfo.songId;
    if (musicInfo.songId == null && musicInfo.songmid != null)
        musicInfo.songId = musicInfo.songmid;
    if (musicInfo.hash == null && musicInfo.kgHash != null)
        musicInfo.hash = musicInfo.kgHash;
    const payload = {
        source: source,
        action: 'musicUrl',
        info: {
            type: quality,
            musicInfo,
        },
    };
    const list = await ensureRuntimes();
    if (!list.length)
        throw new Error('未配置可用音源脚本地址 music_source_urls');
    const errors = [];
    for (const rt of list) {
        try {
            const state = await rt.ensureLoaded();
            const supported = state.sources[source];
            if (supported && Array.isArray(supported.actions) && !supported.actions.includes('musicUrl')) {
                errors.push(`${rt.url}: 源 ${source} 不支持 musicUrl`);
                continue;
            }
            const url = await rt.requestMusicUrl(payload);
            return { url, source, quality, from: rt.url };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            errors.push(`${rt.url}: ${message}`);
            logger.warn(`音源失败 ${rt.url}: ${message}`);
        }
    }
    throw new Error(`所有音源均失败：${errors.join(' | ')}`);
}
export async function resolvePlaylistSongUrl(params) {
    const { songs } = await getMusicPlaylist();
    const song = songs.find((item) => String(item.id) === String(params.id));
    if (!song)
        throw new Error(`歌单中未找到歌曲 id=${params.id}`);
    const resolved = await resolveMusicUrl({ song, quality: params.quality });
    return { ...resolved, song };
}
/** 配置变更后清空运行时与歌单缓存 */
export function resetMusicCaches() {
    runtimes = [];
    runtimeKey = '';
    playlistCache = null;
    logger.log('音乐缓存已清空');
}
