/**
 * co —— 并发控制队列
 *
 * 与 aop.js 的分工：aop.js 是给「单个函数」套切面（before / after / around ...），
 * co 是把对某个函数的「多次调用」排队调度，控制同时运行的个数，两者是不同的关注点。
 *
 * 每个 API 都有两种等价写法：
 *   1. 函数式：import {co} from "@asset/ifn/co.js"; co(fn, concurrency, wt)
 *   2. 原型式：import "@asset/ifn/co.js"; fn.co(concurrency, wt)   // 挂载 Function.prototype 后才能用
 *
 * @example 批量操作：8 并发、800ms 间隔
 *   import {co} from "@asset/ifn/co.js";
 *   const coer = co((row) => duiZhang(row), 8, 800);
 *   await Promise.all(rows.map((row) => coer(row)));
 *
 * 完整可运行示例见同目录下的 co.example.js：
 *     node views/@asset/ifn/co.example.js
 */

/**
 * 并发控制：把对 func 的高频调用排队执行，最多同时运行 concurrency 个，
 * 每 wt 毫秒从队列取一个任务；每次调用返回 Promise，resolve 出 func 的结果。
 * 调用返回的 fn 上挂有 stop() —— 清空队列并停止调度。
 *
 * @param func {function} 被限流的函数
 * @param concurrency {number} 并发数，默认 1
 * @param wt {number} 取任务的间隔毫秒，默认 10
 * @return {function(...[*]): Promise<*>}
 *
 * @example 批量操作：8 并发、800ms 间隔
 * const coer = co((row) => duiZhang(row), 8, 800);
 * await Promise.all(rows.map((row) => coer(row)));
 *
 * @example 中断剩余任务
 * const coer = co(save, 2, 100);
 * rows.forEach((row) => coer(row));
 * await coer.stop(); // 队列清空，未执行的不再执行
 *
 * @example 原型式
 * const coer = save.co(4, 500);
 *
 * @see 项目用法见 views/rap/duizhang/merchant/data/list.vue、views/rap/individual/mac3.0/abnormal/@module/data-list.vue
 */
// 让函数并发执行
export function co(func, concurrency = 1, wt = 10) {
    const queue = [];
    let canceled;
    let workers = 0;

    function finish() {
        if (!canceled && fn.complete) {
            fn.complete();
        }
        fn.finish && fn.finish(canceled);
        canceled = undefined;
    }

    async function exec(queue, func) {
        let $resolve, todo = 0;
        const p            = new Promise(($res) => $resolve = $res);
        const fn           = async () => {
            if (queue.length < 1 || canceled) return;
            todo++;
            const {args, resolve} = queue.shift();
            Promise.resolve(func(...args)).then((ret) => resolve(ret)).then(() => todo--);
        };
        const timer        = setInterval(() => fn().then(stop), wt);
        // 清除定时并结束任务
        const stop         = () => {
            if (todo) return;
            if (queue.length < 1 || canceled) {
                $resolve();
                clearInterval(timer);
            }
        };
        fn().then(stop);
        return p;
    }

    function fn(...args) {
        if (canceled) return; // todo 抛出错误
        return new Promise(async (resolve, reject) => {
            queue.push({args, resolve, reject});
            if (workers >= concurrency) return;
            workers++;
            setTimeout(() => exec(queue, func).then(() => workers--).finally(() => workers === 0 && finish()));
        });
    }

    fn.stop = () => {
        queue.length = [];
        canceled     = true;
        fn.break && fn.break();
        return new Promise((res, rej) => setInterval(() => workers || res(), 100));
    };
    return fn;
}

Function.prototype.co = function (concurrency, waitTime = 0) {
    return co(this, concurrency, waitTime);
};
