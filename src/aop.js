/**
 * aop —— 函数切面工具集
 *
 * 提供 before / unshift / after / pipe / around / wrapper / filter / times 八组能力，
 * （职责链 Chain、并发队列 co 不属于切面范畴，已分别迁至同目录 chain.js / co.js）
 * 每个 API 都有两种等价写法：
 *   1. 函数式：import {before} from "@asset/aop.js"; before(fn, b4fn, ctx)
 *   2. 原型式：import "@asset/aop.js"; fn.before(b4fn, ctx)   // 挂载 Function.prototype 后才能用
 *
 * 完整可运行示例见同目录下的 aop.example.js：
 *     node views/@asset/aop.example.js
 */

/**
 * 前置通知：b4fn 先于 fn 执行，两者收到完全相同的参数，b4fn 的返回值被忽略，
 * 整个调用的返回值是 fn 的返回值。b4fn 返回 Promise 时会等待其 resolve 后再执行 fn。
 *
 * @param fn {function} 目标函数
 * @param b4fn  {function} 前置函数
 * @param ctx {object} 执行 this，不传则使用调用时的 this
 * @return {function(): *}
 *
 * @example 函数式
 * const fn = before(add, (a, b) => console.log('计算', a, b));
 * fn(1, 2); // 打印"计算 1 2"，返回 3
 *
 * @example 原型式（需先 import 本模块挂载原型方法）
 * const fn = add.before((a, b) => console.log('计算', a, b));
 *
 * @example 异步前置（权限校验通过后才执行）
 * const fn = add.before(async () => await checkAuth());
 * await fn(1, 2);
 */

export function before(fn, b4fn, ctx) {
    return function () {
        const args  = arguments;
        const ths   = ctx || this;
        const b4val = b4fn.apply(ths, args);
        return b4val?.then ? b4val.then((val) => fn.apply(ths, args)) : fn.apply(ths, args);
    };
}

Function.prototype.before = function (b4fn, ctx) {
    return before(this, b4fn, ctx);
};

/**
 * 前置加工：b4fn 的返回值会替换 fn 的入参，作为 fn 的唯一参数传入。
 *
 * @param fn {function} 目标函数
 * @param b4fn {function} 前置函数，其返回值作为 fn 的唯一入参
 * @param ctx {object} 执行 this
 * @return {function(): *}
 *
 * @example 请求前统一组装参数
 * const save = unshift(saveData, (form) => ({...form, ts: Date.now()}));
 * save({name: 'rap'}); // saveData 收到 {name:'rap', ts: ...}
 *
 * @example 原型式
 * const double = ((v) => v * 2).unshift((a, b) => a + b);
 * double(1, 2); // b4fn 返回 3，(v) => v*2 收到 3，返回 6
 */

export function unshift(fn, b4fn, ctx) {
    return function () {
        const ths   = ctx || this;
        const b4val = b4fn.apply(ths, arguments);
        return b4val?.then ? b4val.then((val) => fn.apply(ths, [val])) : fn.apply(ths, [b4val]);
    };
}

Function.prototype.unshift = function (b4fn, ctx) {
    return unshift(this, b4fn, ctx);
};

/**
 *  @typedef after {Function}
 *  @param fn {function}
 *  @param afn {function}  the function you want to execute after, it will get 2 arguments,
 *  the first is the return value of fn, the second is the arguments of fn
 *  @param [ctx] {object}
 *
 *  @example 后置埋点，返回值仍是 fn 的结果
 *  const fn = after(add, (a, b) => report('add', a, b));
 *  fn(1, 2); // 执行上报，返回 3
 *
 *  @example 原型式，异步 fn 同样适用
 *  const fn = fetchList.after(() => hideLoading());
 *  await fn(params);
 */
export function after(fn, afn, ctx) {
    /**
     * @param afn   {function}
     */
    return function () {
        const ths    = ctx || this;
        const val    = fn.apply(ths, arguments);
        const retAfn = val?.then ? val.then((val) => afn.apply(ths, arguments)) : afn.apply(ths, arguments);
        return retAfn?.then ? retAfn.then(() => val) : val;
    };
}

Function.prototype.after = function (afn, ctx) {
    return after(this, afn, ctx);
};

/**
 * 管道：fn 的返回值作为 afn 的唯一入参，整个调用的返回值是 afn 的返回值。
 * 注意：pipe 不感知 Promise，fn 为异步时 afn 收到的是 Promise，需自行 then。
 *
 * @param fn {function}
 * @param afn {function} 接收 fn 的返回值
 * @param ctx {object}
 * @return {function(): *}
 *
 * @example 同步管道
 * const fn = pipe(add, (v) => v * 2);
 * fn(1, 2); // (1+2)*2 = 6
 *
 * @example 异步请求统一拆包（afn 内自行 then，项目中的真实用法）
 * lmdQer.post = lmdQer.post.pipe((rsp) => rsp.then(checkRsp));
 */

export function pipe(fn, afn, ctx) {
    return function () {
        const ths = ctx || this;
        return afn.apply(ths, [fn.apply(ths, arguments)]);
    };
}

Function.prototype.pipe = function (afn, ctx) {
    return pipe(this, afn, ctx);
};

/**
 * Wraps a function with before and after functions.
 *
 * @param {Function} fn - The function to wrap.
 * @param {Function} b4fn - The function to execute before the wrapped function.
 * @param {Function} afn - The function to execute after the wrapped function.
 * @param {Object} [ctx] - The context to use when calling the functions.
 * @returns {Function} - The wrapped function.
 *
 * @example 事务包裹
 * const fn = around(save, () => beginTx(), () => commitTx());
 * fn(data); // beginTx -> save(data) -> commitTx，返回 save 的结果
 *
 * @example 原型式：统计异步耗时
 * let start;
 * const fn = addAsync.around(() => (start = Date.now()), () => console.log(Date.now() - start));
 */
export function around(fn, b4fn, afn, ctx) {
    return function () {
        const ths    = ctx || this;
        const b4val  = b4fn.apply(ths, arguments);
        const ret    = b4val?.then ? b4val.then(() => fn.apply(ths, arguments)) : fn.apply(ths, arguments);
        const aftRet = ret?.then ? ret.then((val) => afn.apply(ths, arguments)) : afn.apply(ths, arguments);
        return aftRet?.then ? aftRet.then(() => ret) : ret;
    };
}

Function.prototype.around = function (b4fn, afn, ctx) {
    return around(this, b4fn, afn, ctx);
};

/**
 * wrap a function with before and after functions,
 * function b4fn will be executed before the function,
 * the return value of before function will be passed to the function,
 * function afn will be executed after the function fn;
 * @param fn
 * @param b4fn
 * @param afn
 * @param ctx
 * @return {function(): *}
 *
 * 同步与异步两种情况下语义一致：afn 拿到的都是 fn 的返回值。
 *
 * @example 入参与返回值都做加工
 * const query = wrapper(
 *     async (params) => request(params),  // 收到 b4fn 的返回值
 *     (page, size) => ({page, size}),     // 加工入参
 *     (rsp) => rsp.list,                  // 加工 fn 的结果
 * );
 * await query(1, 20); // 返回 rsp.list
 *
 * @example 同步场景：b4fn 求和 -> fn 翻倍 -> afn 拼字符串
 * const fn = ((v) => v * 2).wrapper((a, b) => a + b, (v) => `结果 ${v}`);
 * fn(1, 2); // '结果 6'
 */
export function wrapper(fn, b4fn, afn, ctx) {
    afn ||= (val) => val;
    return function () {
        const ths   = ctx || this;
        const b4ret = b4fn?.apply(ths, arguments);
        const _fn     = b4ret => {
            const ret = fn.apply(ths, [b4ret]);
            return ret?.then ? ret.then(afn) : afn(ret);
        };
        return b4ret?.then ? b4ret.then(_fn) : _fn(b4ret);
    };
}

/**
 * 条件拦截：filterFn 返回 false（严格等于 false）时 fn 不执行，调用返回 undefined。
 * filterFn 返回 Promise 时会等待其 resolve 后再判断是否执行。
 *
 * @param fn {function} 目标函数
 * @param filter {function} 判定函数，返回 false 阻断执行
 * @param ctx {object} 执行 this
 * @return {function(): *}
 *
 * @example 二次确认
 * const remove = filter(delById, (id) => id > 0);
 * remove(1);  // 执行删除
 * remove(-1); // 被拦截，返回 undefined
 *
 * @example 异步校验
 * const remove = filter(delById, async (id) => await hasPermission(id));
 * await remove(1);
 *
 * @see 注意：请使用本函数式写法，Function.prototype.filter 存在同名参数遮蔽问题（见下方实现）。
 */
// Define a function that filters the execution of another function based on a condition
export function filter(fn, filter, ctx) {
    return function () {
        const ths = ctx || this;
        const ret = filter.apply(ths, arguments);
        if (ret?.then) {
            return ret.then(ret => {
                if (ret === false) return;
                return fn.apply(ths, arguments);
            });
        } else if (ret !== false) {
            return fn.apply(ths, arguments);
        }
    };
}

/**
 * Add a filter method to the Function prototype that allows filtering of function execution
 * @param filter {function} return false to stop the function
 * @param ctx
 * @return {(function(): (undefined|*))|*}
 */
Function.prototype.filter = function (filter, ctx) {
    return filter(this, filter, ctx);
};

// Add a wrapper method to the Function prototype that wraps a function with before and after functions
Function.prototype.wrapper = function (b4fn, afn, ctx) {
    return wrapper(this, b4fn, afn, ctx);
};

/**
 * 重复执行函数若干次
 * @param fn {function}
 * @param cnt
 * @param interval
 * @return 返回一个 timesFn，调用后返回 Promise：跑满 cnt 次后 resolve(false)，
 * 被 stop() 中断则 resolve(true)
 *
 * @example 轮询 5 次，每 1 秒一次
 * const poll = times(() => refresh(), 5, 1000);
 * await poll(); // 5 次跑完后继续
 *
 * @example 满足条件后提前中断
 * let retry = 0;
 * const polling = times(() => {
 *     if (++retry === 2) polling.stop();
 * }, 5, 100);
 * await polling(); // resolve(true) 表示被中断
 */
export function times(fn, cnt, interval) {
    /**
     *
     * @return {Promise<unknown>}
     */
    const timesFn = function (...args) {
        let interrupt             = false;
        const ths                 = this;
        let resolve, reject, _cnt = cnt;
        timesFn.stop              = () => {
            interrupt = true;
            clearInterval(t);
            resolve(!!_cnt);
        };
        const p                   = new Promise((res, rej) => resolve = res);
        const t                   = setInterval(() => {
            interrupt || fn.apply(ths, args);
            _cnt--;
            if (interrupt || _cnt === 0) {
                clearInterval(t);
                interrupt || resolve(interrupt);
            }
        }, interval);
        return p;
    };
    return timesFn;
}
