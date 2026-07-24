import axios from 'axios';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import vm from 'node:vm';
import { Logger } from '../../utils/logger.js';
import { getBabelHelpers } from './babel-helpers.js';
const logger = new Logger('LxMusicRuntime');
function createUtils() {
    return {
        crypto: {
            aesEncrypt(buffer, mode, key, iv) {
                const cipher = crypto.createCipheriv(mode, Buffer.from(key), Buffer.from(iv));
                return Buffer.concat([cipher.update(Buffer.from(buffer)), cipher.final()]);
            },
            rsaEncrypt(buffer, key) {
                const input = Buffer.from(buffer);
                const padded = Buffer.concat([Buffer.alloc(Math.max(0, 128 - input.length)), input]).subarray(-128);
                return crypto.publicEncrypt({ key: typeof key === 'string' ? key : key.toString(), padding: crypto.constants.RSA_NO_PADDING }, padded);
            },
            randomBytes(size) {
                return crypto.randomBytes(size);
            },
            md5(str) {
                return crypto.createHash('md5').update(String(str)).digest('hex');
            },
        },
        buffer: {
            from(data, encodingOrOffset, length) {
                return Buffer.from(data, encodingOrOffset, length);
            },
            bufToString(buf, format) {
                return Buffer.from(buf, 'binary').toString(format || 'utf8');
            },
        },
        zlib: {
            inflate(buf) {
                return new Promise((resolve, reject) => {
                    zlib.inflate(buf, (err, data) => {
                        if (err)
                            reject(err);
                        else
                            resolve(data);
                    });
                });
            },
            deflate(data) {
                return new Promise((resolve, reject) => {
                    zlib.deflate(data, (err, buf) => {
                        if (err)
                            reject(err);
                        else
                            resolve(buf);
                    });
                });
            },
        },
    };
}
function createLxApi(state, timeoutMs) {
    const EVENT_NAMES = {
        request: 'request',
        inited: 'inited',
        updateAlert: 'updateAlert',
    };
    return {
        EVENT_NAMES,
        version: '2.0.0',
        env: 'desktop',
        currentScriptInfo: {
            name: '',
            description: '',
            version: '',
            author: '',
            homepage: '',
            rawScript: '',
        },
        utils: createUtils(),
        on(eventName, handler) {
            if (eventName !== EVENT_NAMES.request) {
                return Promise.reject(new Error(`unsupported event: ${eventName}`));
            }
            state.handler = handler;
            return Promise.resolve();
        },
        send(eventName, data) {
            if (eventName === EVENT_NAMES.inited) {
                state.inited = true;
                state.sources = (data?.sources || {});
                return Promise.resolve();
            }
            if (eventName === EVENT_NAMES.updateAlert) {
                logger.warn(`音源更新提示: ${String(data?.log || '').slice(0, 200)}`);
                return Promise.resolve();
            }
            return Promise.reject(new Error(`unsupported event: ${eventName}`));
        },
        request(url, options = {}, callback) {
            const method = (options.method || 'get').toLowerCase();
            const timeout = Math.min(typeof options.timeout === 'number' && options.timeout > 0 ? options.timeout : timeoutMs, 60_000);
            let data;
            let headers = { ...(options.headers || {}) };
            if (options.body !== undefined) {
                data = options.body;
            }
            else if (options.form !== undefined) {
                data = options.form;
                headers = {
                    'content-type': 'application/x-www-form-urlencoded',
                    ...headers,
                };
            }
            else if (options.formData !== undefined) {
                data = options.formData;
            }
            const config = {
                url,
                method: method,
                headers,
                timeout,
                responseType: 'arraybuffer',
                validateStatus: () => true,
                maxRedirects: 5,
            };
            if (data !== undefined && method !== 'get' && method !== 'head') {
                config.data = data;
            }
            const controller = new AbortController();
            config.signal = controller.signal;
            void axios(config)
                .then((res) => {
                const raw = Buffer.from(res.data);
                let body = raw.toString('utf8');
                try {
                    body = JSON.parse(body);
                }
                catch {
                    // keep string body
                }
                const resp = {
                    statusCode: res.status,
                    statusMessage: res.statusText,
                    headers: res.headers,
                    bytes: raw.length,
                    raw,
                    body,
                };
                callback?.(null, resp, body);
            })
                .catch((err) => {
                callback?.(err, null, null);
            });
            return () => controller.abort();
        },
    };
}
export class LxScriptRuntime {
    scriptUrl;
    timeoutMs;
    state = null;
    loading = null;
    constructor(scriptUrl, timeoutMs) {
        this.scriptUrl = scriptUrl;
        this.timeoutMs = timeoutMs;
    }
    get url() {
        return this.scriptUrl;
    }
    get sources() {
        return this.state?.sources || {};
    }
    async ensureLoaded() {
        if (this.state?.inited && this.state.handler)
            return this.state;
        this.loading ??= this.load();
        try {
            return await this.loading;
        }
        finally {
            this.loading = null;
        }
    }
    async load() {
        logger.log(`加载音源脚本: ${this.scriptUrl}`);
        const response = await axios.get(this.scriptUrl, {
            timeout: Math.max(this.timeoutMs, 20_000),
            responseType: 'text',
            transformResponse: [(data) => data],
            headers: {
                'user-agent': 'moments-music-gateway/1.0',
                accept: 'text/plain,application/javascript,*/*',
            },
        });
        const script = String(response.data || '');
        if (!script.trim()) {
            throw new Error(`音源脚本为空: ${this.scriptUrl}`);
        }
        const state = {
            handler: null,
            sources: {},
            inited: false,
            scriptUrl: this.scriptUrl,
            loadedAt: Date.now(),
        };
        const lx = createLxApi(state, this.timeoutMs);
        lx.currentScriptInfo.rawScript = script;
        // 使用 vm + Babel helpers 执行脚本。
        // 很多 LX 音源经 Babel 编译/混淆后依赖 _regenerator、_asyncToGenerator 等全局 helper。
        try {
            this.runScript(script, lx);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`执行音源脚本失败 (${this.scriptUrl}): ${message}`);
        }
        // 部分脚本异步 inited，短暂等待
        const deadline = Date.now() + 5000;
        while (!state.inited || !state.handler) {
            if (Date.now() > deadline)
                break;
            await new Promise((r) => setTimeout(r, 50));
        }
        if (!state.inited || !state.handler) {
            throw new Error(`音源脚本未正确初始化: ${this.scriptUrl}`);
        }
        this.state = state;
        logger.log(`音源脚本就绪: ${this.scriptUrl} sources=${Object.keys(state.sources).join(',') || '-'}`);
        return state;
    }
    runScript(script, lx) {
        const babelHelpers = getBabelHelpers();
        const sandbox = {
            ...babelHelpers,
            lx,
            console,
            Buffer,
            process: { env: {} },
            setTimeout,
            clearTimeout,
            setInterval,
            clearInterval,
            Promise,
            URL,
            URLSearchParams,
            TextDecoder,
            TextEncoder,
            atob: (value) => Buffer.from(value, 'base64').toString('binary'),
            btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
            fetch: globalThis.fetch?.bind(globalThis),
        };
        sandbox.globalThis = sandbox;
        sandbox.window = sandbox;
        sandbox.self = sandbox;
        sandbox.global = sandbox;
        const code = `
      globalThis.lx = lx;
      ${script}
    `;
        vm.runInNewContext(code, sandbox, {
            filename: 'lx-user-api.js',
            timeout: Math.max(this.timeoutMs, 10_000),
        });
    }
    async requestMusicUrl(payload) {
        const state = await this.ensureLoaded();
        if (!state.handler)
            throw new Error('音源未注册 request 处理器');
        const result = await Promise.race([
            state.handler(payload),
            new Promise((_, reject) => {
                setTimeout(() => reject(new Error(`音源请求超时: ${this.scriptUrl}`)), this.timeoutMs);
            }),
        ]);
        if (typeof result !== 'string' || !/^https?:\/\//i.test(result)) {
            throw new Error(`音源返回的播放地址无效: ${String(result).slice(0, 120)}`);
        }
        if (result.length > 2048) {
            throw new Error('音源返回的播放地址过长');
        }
        return result;
    }
}
