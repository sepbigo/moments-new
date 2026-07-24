import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
function unwrap(mod) {
    if (!mod)
        return mod;
    return mod.default !== undefined ? mod.default : mod;
}
function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) {
    try {
        const info = gen[key](arg);
        const value = info.value;
        if (info.done)
            resolve(value);
        else
            Promise.resolve(value).then(_next, _throw);
    }
    catch (error) {
        reject(error);
    }
}
let cached = null;
/**
 * 为 LX 自定义源脚本注入 Babel 编译产物常见 helper
 * （很多混淆音源会用到 _regenerator / _asyncToGenerator / _typeof 等）
 */
export function getBabelHelpers() {
    if (cached)
        return cached;
    const helpers = {};
    try {
        const runtimePkg = require.resolve('@babel/runtime/package.json');
        const helpersDir = path.join(path.dirname(runtimePkg), 'helpers');
        const load = (name) => {
            try {
                return unwrap(require(path.join(helpersDir, `${name}.js`)));
            }
            catch {
                return undefined;
            }
        };
        for (const file of fs.readdirSync(helpersDir)) {
            if (!file.endsWith('.js'))
                continue;
            const name = file.slice(0, -3);
            const val = load(name);
            if (val === undefined)
                continue;
            helpers[name] = val;
            helpers[`_${name}`] = val;
        }
        const regenerator = load('regenerator');
        helpers._regenerator = regenerator;
        helpers._regeneratorRuntime = regenerator;
        helpers.regeneratorRuntime = regenerator;
        helpers._regeneratorDefine = load('regeneratorDefine');
        helpers._regeneratorDefine2 = helpers._regeneratorDefine;
        helpers.asyncGeneratorStep = asyncGeneratorStep;
        helpers._asyncGeneratorStep = asyncGeneratorStep;
    }
    catch {
        // @babel/runtime 不可用时至少提供 regenerator 相关空壳，避免直接崩溃
        helpers.asyncGeneratorStep = asyncGeneratorStep;
        helpers._asyncGeneratorStep = asyncGeneratorStep;
    }
    cached = helpers;
    return helpers;
}
