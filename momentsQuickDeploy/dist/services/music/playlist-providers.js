import axios from 'axios';
import crypto from 'node:crypto';
import { Logger } from '../../utils/logger.js';
const logger = new Logger('MusicPlaylistProvider');
const LINUX_API_KEY = Buffer.from('rFgB&h#%2?^eDg:Q');
const WEAPI_IV = Buffer.from('0102030405060708');
const WEAPI_PRESET_KEY = Buffer.from('0CoJUm6Qyw8W8jud');
const WEAPI_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDgtQn2JZ34ZC28NWYpAUd98iZ37BUrX/aKzmFbt7clFSs6sXqHauqKWqdtLkF2KexO40H1YTX8z2lSgBBOAxLsvaklV8k4cBFK9snQXE9/DDaFt6Rr7iVZMldczhC0JNgTz+SHXT6CBHuX3e9SdB1Ua44oncaTWz7OBGLbCiK45wIDAQAB
-----END PUBLIC KEY-----`;
const BASE62 = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function aesEncrypt(buffer, mode, key, iv) {
    const cipher = crypto.createCipheriv(mode, key, iv);
    return Buffer.concat([cipher.update(buffer), cipher.final()]);
}
function linuxapi(object) {
    const text = JSON.stringify(object);
    return {
        eparams: aesEncrypt(Buffer.from(text), 'aes-128-ecb', LINUX_API_KEY, '').toString('hex').toUpperCase(),
    };
}
function weapi(object) {
    const text = JSON.stringify(object);
    const secretKey = crypto.randomBytes(16).map((n) => BASE62.charCodeAt(n % 62));
    const params = aesEncrypt(Buffer.from(aesEncrypt(Buffer.from(text), 'aes-128-cbc', WEAPI_PRESET_KEY, WEAPI_IV).toString('base64')), 'aes-128-cbc', Buffer.from(secretKey), WEAPI_IV).toString('base64');
    const reversed = Buffer.from(secretKey).reverse();
    const padded = Buffer.concat([Buffer.alloc(Math.max(0, 128 - reversed.length)), reversed]).subarray(-128);
    const encSecKey = crypto.publicEncrypt({ key: WEAPI_PUBLIC_KEY, padding: crypto.constants.RSA_NO_PADDING }, padded).toString('hex');
    return { params, encSecKey };
}
function formatPlayTime(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0)
        return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function formatSinger(artists) {
    if (!artists?.length)
        return '未知歌手';
    return artists.map((a) => a.name || '').filter(Boolean).join('、') || '未知歌手';
}
function qualityFromPrivilege(privilege, item) {
    const qualitys = [];
    if (privilege?.maxBrLevel === 'hires')
        qualitys.push('flac24bit');
    switch (privilege?.maxbr) {
        case 999000:
            qualitys.push('flac');
        // fallthrough
        case 320000:
            qualitys.push('320k');
        // fallthrough
        case 192000:
        case 128000:
            qualitys.push('128k');
            break;
        default:
            if (item?.h)
                qualitys.push('320k');
            if (item?.l || item?.m)
                qualitys.push('128k');
    }
    const uniq = [...new Set(qualitys)];
    if (!uniq.length)
        uniq.push('128k', '320k');
    return uniq;
}
function mapWyTrack(item, privilege) {
    const songmid = item.id;
    const name = item.pc?.sn ?? item.name ?? '未知歌曲';
    const singer = item.pc?.ar ?? formatSinger(item.ar);
    const albumName = item.pc?.alb ?? item.al?.name ?? '';
    const picUrl = item.al?.picUrl ?? '';
    const interval = formatPlayTime((item.dt || 0) / 1000);
    const qualitys = qualityFromPrivilege(privilege, item);
    const musicInfo = {
        songmid,
        songId: songmid,
        name,
        singer,
        albumName,
        albumId: item.al?.id,
        source: 'wy',
        interval,
        img: picUrl,
        types: qualitys.map((type) => ({ type, size: null })),
        _types: Object.fromEntries(qualitys.map((type) => [type, { size: null }])),
        typeUrl: {},
    };
    return {
        id: String(songmid),
        name,
        singer,
        artist: singer,
        source: 'wy',
        interval,
        albumName,
        picUrl,
        qualitys,
        musicInfo,
        songmid,
    };
}
/** 识别是否为平台歌单链接 / 纯 id 约定 */
export function detectPlatformPlaylist(input) {
    const raw = String(input || '').trim();
    if (!raw)
        return null;
    // 纯数字：默认按网易云歌单 id
    if (/^\d{5,}$/.test(raw)) {
        return { platform: 'wy', id: raw };
    }
    // 网易云
    if (/music\.163\.com|163cn\.tv|y\.music\.163\.com/i.test(raw)) {
        const m1 = raw.match(/[?&]id=(\d+)/i);
        if (m1)
            return { platform: 'wy', id: m1[1] };
        const m2 = raw.match(/\/playlist\/(\d+)/i);
        if (m2)
            return { platform: 'wy', id: m2[1] };
    }
    // 酷我
    if (/kuwo\.cn/i.test(raw)) {
        const m = raw.match(/playlist(?:_detail)?\/(\d+)/i) || raw.match(/[?&]pid=(\d+)/i);
        if (m)
            return { platform: 'kw', id: m[1] };
    }
    // QQ
    if (/y\.qq\.com|i\.y\.qq\.com/i.test(raw)) {
        const m = raw.match(/\/playlist\/(\d+)/i) || raw.match(/[?&]id=(\d+)/i);
        if (m)
            return { platform: 'tx', id: m[1] };
    }
    // 酷狗
    if (/kugou\.com/i.test(raw)) {
        const m = raw.match(/special\/single\/(\d+)/i) || raw.match(/[?&](?:specialid|playlistId)=(\d+)/i);
        if (m)
            return { platform: 'kg', id: m[1] };
    }
    // 咪咕
    if (/migu\.cn/i.test(raw)) {
        const m = raw.match(/playlist\/(\d+)/i) || raw.match(/[?&](?:playlistId|id)=(\d+)/i);
        if (m)
            return { platform: 'mg', id: m[1] };
    }
    // 约定前缀：wy:123 / netease:123
    const prefix = raw.match(/^(wy|netease|kw|kg|tx|qq|mg)[:：#](\d+)$/i);
    if (prefix) {
        const map = {
            wy: 'wy',
            netease: 'wy',
            kw: 'kw',
            kg: 'kg',
            tx: 'tx',
            qq: 'tx',
            mg: 'mg',
        };
        return { platform: map[prefix[1].toLowerCase()], id: prefix[2] };
    }
    return null;
}
async function fetchWySongDetails(ids) {
    if (!ids.length)
        return [];
    const form = weapi({
        c: JSON.stringify(ids.map((id) => ({ id: Number(id) }))),
        ids: JSON.stringify(ids.map(Number)),
    });
    const body = new URLSearchParams(form).toString();
    const res = await axios.post('https://music.163.com/weapi/v3/song/detail', body, {
        timeout: 20_000,
        headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            origin: 'https://music.163.com',
            referer: 'https://music.163.com/',
        },
    });
    const data = res.data;
    if (data?.code !== 200 || !Array.isArray(data.songs)) {
        throw new Error(`网易云歌曲详情失败: code=${data?.code}`);
    }
    return data.songs.map((song, index) => {
        let privilege = data.privileges?.[index];
        if (privilege?.id !== song.id) {
            privilege = data.privileges?.find((p) => p.id === song.id);
        }
        return mapWyTrack(song, privilege);
    });
}
async function fetchWyPlaylist(id) {
    const form = linuxapi({
        method: 'POST',
        url: 'https://music.163.com/api/v3/playlist/detail',
        params: {
            id,
            n: 100000,
            s: 8,
        },
    });
    const body = new URLSearchParams(form).toString();
    const res = await axios.post('https://music.163.com/api/linux/forward', body, {
        timeout: 25_000,
        headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36',
            cookie: 'MUSIC_U=',
            referer: 'https://music.163.com/',
        },
    });
    const data = res.data;
    if (data?.code !== 200 || !data?.playlist) {
        throw new Error(`网易云歌单获取失败: code=${data?.code ?? res.status}`);
    }
    const playlist = data.playlist;
    const trackIds = (playlist.trackIds || []).map((t) => t.id);
    const tracks = playlist.tracks || [];
    const privileges = data.privileges || [];
    let songs = [];
    if (tracks.length && trackIds.length === privileges.length && tracks.length >= Math.min(trackIds.length, 1000)) {
        songs = tracks.map((item, index) => {
            let privilege = privileges[index];
            if (privilege?.id !== item.id) {
                privilege = privileges.find((p) => p.id === item.id);
            }
            return mapWyTrack(item, privilege);
        });
    }
    else if (trackIds.length) {
        // 大歌单：分批拉详情
        const batchSize = 200;
        for (let i = 0; i < trackIds.length; i += batchSize) {
            const batch = trackIds.slice(i, i + batchSize);
            const part = await fetchWySongDetails(batch);
            songs.push(...part);
        }
    }
    logger.log(`网易云歌单 ${id} 解析完成，共 ${songs.length} 首`);
    return {
        platform: 'wy',
        playlistId: id,
        info: {
            name: playlist.name,
            desc: playlist.description || '',
            img: playlist.coverImgUrl,
            author: playlist.creator?.nickname,
            playCount: playlist.playCount,
        },
        songs,
    };
}
async function fetchKwPlaylist(id) {
    const url = `http://nplserver.kuwo.cn/pl.svc?op=getlistinfo&pid=${id}&pn=0&rn=1000&encode=utf8&keyset=pl2012&identity=kuwo&pcmp4=1&vipver=MUSIC_9.0.5.0_W1&newver=1`;
    const res = await axios.get(url, {
        timeout: 20_000,
        headers: {
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
    });
    const data = res.data;
    if (data?.result !== 'ok' || !Array.isArray(data.musiclist)) {
        throw new Error(`酷我歌单获取失败: ${data?.result || res.status}`);
    }
    const songs = data.musiclist.map((item) => {
        const songmid = String(item.id || item.rid || '');
        const name = item.name || item.n || '未知歌曲';
        const singer = item.artist || item.a || '未知歌手';
        const musicInfo = {
            songmid,
            songId: songmid,
            name,
            singer,
            albumName: item.album || item.alb || '',
            source: 'kw',
            interval: item.songTimeMinutes || item.t || null,
            img: item.pic || item.img || '',
        };
        return {
            id: songmid,
            name,
            singer,
            artist: singer,
            source: 'kw',
            interval: musicInfo.interval,
            albumName: musicInfo.albumName,
            picUrl: musicInfo.img,
            musicInfo,
            songmid,
        };
    });
    return {
        platform: 'kw',
        playlistId: id,
        info: {
            name: data.title || data.name,
            desc: data.info || '',
            img: data.pic || data.img,
            author: data.uname || data.userName,
        },
        songs,
    };
}
async function fetchTxPlaylist(id) {
    const url = `https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&new_format=1&disstid=${id}&loginUin=0&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0`;
    const res = await axios.get(url, {
        timeout: 20_000,
        headers: {
            origin: 'https://y.qq.com',
            referer: `https://y.qq.com/n/yqq/playsquare/${id}.html`,
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
    });
    const data = res.data;
    if (data?.code !== 0 || !data?.cdlist?.[0]) {
        throw new Error(`QQ 音乐歌单获取失败: code=${data?.code}`);
    }
    const cd = data.cdlist[0];
    const songs = (cd.songlist || []).map((item) => {
        const songmid = item.mid || item.songmid;
        const name = item.name || item.songname || '未知歌曲';
        const singer = Array.isArray(item.singer)
            ? item.singer.map((s) => s.name).filter(Boolean).join('、')
            : (item.singer || '未知歌手');
        const musicInfo = {
            songmid,
            songId: item.id || item.songid,
            strMediaMid: item.file?.media_mid || item.strMediaMid,
            name,
            singer,
            albumName: item.album?.name || item.albumname || '',
            albumMid: item.album?.mid,
            source: 'tx',
            interval: item.interval ? formatPlayTime(item.interval) : null,
            img: item.album?.pmid
                ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${item.album.pmid}.jpg`
                : '',
        };
        return {
            id: String(songmid),
            name,
            singer,
            artist: singer,
            source: 'tx',
            interval: musicInfo.interval,
            albumName: musicInfo.albumName,
            picUrl: musicInfo.img,
            musicInfo,
            songmid,
        };
    });
    return {
        platform: 'tx',
        playlistId: id,
        info: {
            name: cd.dissname,
            desc: cd.desc,
            img: cd.logo,
            author: cd.nickname,
        },
        songs,
    };
}
/**
 * 从平台歌单链接 / id 拉取歌曲列表（当前网易云完整支持，酷我/QQ 基础支持）
 */
export async function fetchPlatformPlaylist(input) {
    const detected = detectPlatformPlaylist(input);
    if (!detected) {
        throw new Error('无法识别的歌单地址，请填写网易云/酷我/QQ 等平台歌单链接');
    }
    logger.log(`解析平台歌单 platform=${detected.platform} id=${detected.id}`);
    switch (detected.platform) {
        case 'wy':
            return fetchWyPlaylist(detected.id);
        case 'kw':
            return fetchKwPlaylist(detected.id);
        case 'tx':
            return fetchTxPlaylist(detected.id);
        case 'kg':
        case 'mg':
            throw new Error(`暂未实现 ${detected.platform} 平台歌单直链解析，请改用网易云/酷我/QQ 歌单链接`);
        default:
            throw new Error(`不支持的平台: ${detected.platform}`);
    }
}
export function isPlatformPlaylistUrl(input) {
    return detectPlatformPlaylist(input) != null;
}
