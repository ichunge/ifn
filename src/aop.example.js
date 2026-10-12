/**
 * aop.js 使用示例
 *
 * 运行方式（项目已声明 "type": "module"，可直接用 node 执行 ESM）：
 *      node views/@asset/aop.example.js
 *
 * aop.js 的每个 API 都有两种等价写法：
 *   1. 函数式：before(fn, b4fn, ctx)       —— 不污染原型，推荐在公共库中使用
 *   2. 原型式：fn.before(b4fn, ctx)        —— 需要先 import "…/aop.js" 挂载原型方法
 * 下面两种写法都会演示。
 */
import {before, unshift, after, pipe, around, wrapper, filter, times} from "./aop.js";

const log  = console.log;
const hr   = (title) => log(`\n===== ${title} =====`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 被装饰的目标函数：同步 */
function add(a, b) {
    log(`  add(${a}, ${b}) 执行`);
    return a + b;
}

/** 被装饰的目标函数：异步 */
async function addAsync(a, b) {
    await sleep(10);
    log(`  addAsync(${a}, ${b}) 执行`);
    return a + b;
}

/**
 * 1. before —— 前置通知
 *    b4fn 与 fn 收到完全相同的参数，b4fn 的返回值被忽略，fn 的返回值原样返回。
 *    b4fn 返回 Promise 时会等待其 resolve 后再执行 fn（可用于权限校验、loading 开启）。
 */
async function demoBefore() {
    hr("1. before：前置通知（同步）");
    const addWithBefore = before(add, (a, b) => log(`  before 收到参数 ${a}, ${b}`));
    log("  返回值：", addWithBefore(1, 2));

    hr("1. before：前置通知（异步，会等待 b4fn resolve）");
    const checkAuth = before(add, async () => {
        await sleep(10);
        log("  权限校验通过");
        return true;
    });
    log("  返回值：", await checkAuth(3, 4));

    hr("1. before：原型写法 fn.before(b4fn)");
    log("  返回值：", add.before((a, b) => log(`  before ${a}, ${b}`))(5, 6));
}

/**
 * 2. unshift —— 前置加工
 *    与 before 的区别：b4fn 的返回值会作为「唯一参数」传给 fn（替换原参数）。
 *    典型场景：请求前统一组装/转换参数。
 */
async function demoUnshift() {
    hr("2. unshift：b4fn 的返回值替换 fn 的入参");
    const save = (payload) => {
        log("  save 收到：", payload);
        return payload;
    };
    const saveWithParams = unshift(save, (form) => ({...form, ts: Date.now()}));
    log("  返回值：", saveWithParams({name: "rap"}));

    hr("2. unshift：原型写法 fn.unshift(b4fn)");
    const double = ((v) => v * 2).unshift((a, b) => a + b); // b4fn 返回 3，传给 fn 得到 6
    log("  返回值：", double(1, 2));
}

/**
 * 3. after —— 后置通知
 *    afn 在 fn 之后执行，收到的是 fn 的原始参数（不是返回值）；
 *    整个调用的返回值仍是 fn 的返回值，afn 的返回值会被丢弃。
 *    典型场景：埋点上报、关闭 loading。
 */
async function demoAfter() {
    hr("3. after：后置通知（返回值保持为 fn 的结果）");
    const addWithAfter = after(add, (a, b) => log(`  after 上报埋点：add(${a}, ${b})`));
    log("  返回值：", addWithAfter(1, 2));

    hr("3. after：fn 为异步时同样成立");
    const asyncAfter = after(addAsync, () => log("  after 关闭 loading"));
    log("  返回值：", await asyncAfter(10, 20));

    hr("3. after：原型写法 fn.after(afn)");
    log("  返回值：", add.after(() => log("  after done"))(7, 8));
}

/**
 * 4. pipe —— 管道
 *    fn 的返回值直接作为 afn 的第一个（唯一）参数，整个调用的返回值是 afn 的返回值。
 *    典型场景：请求结果统一拆包 / 数据转换（见 views/rap/individual/mac1.0/@asset/data.js）。
 */
async function demoPipe() {
    hr("4. pipe：fn 的返回值流入 afn");
    const addThenDouble = pipe(add, (v) => v * 2);
    log("  返回值：", addThenDouble(1, 2), "= (1+2)*2");

    hr("4. pipe：实战 —— 请求结果统一拆包");
    // 注意：pipe 不感知 Promise，fn 为异步时 afn 收到的是 Promise，需自行 then
    // （项目中的真实用法见 views/rap/individual/mac1.0/@asset/data.js：
    //   lmdQer.post = lmdQer.post.pipe((rsp) => rsp.then(checkRsp));）
    const request = async () => ({code: 0, data: {total: 100}});
    const query = pipe(request, (rsp) => rsp.then((res) => {
        if (res.code !== 0) throw new Error(res.msg || "请求失败");
        return res.data;
    }));
    log("  返回值：", await query());

    hr("4. pipe：原型写法 fn.pipe(afn)");
    log("  返回值：", add.pipe((v) => `结果是 ${v}`)(3, 4));
}

/**
 * 5. around —— 前置 + 后置
 *    b4fn 与 afn 都收到 fn 的原始参数，返回值保持为 fn 的结果。
 *    典型场景：事务包裹 / 耗时统计。
 */
async function demoAround() {
    hr("5. around：同时包裹前后");
    const timed = around(
        add,
        () => log("  事务开始"),
        (a, b) => log(`  事务提交 add(${a}, ${b})`),
    );
    log("  返回值：", timed(1, 2));

    hr("5. around：统计异步函数耗时");
    let start;
    const cost = around(
        addAsync,
        () => (start = Date.now()),
        () => log(`  耗时 ${Date.now() - start}ms`),
    );
    log("  返回值：", await cost(1, 2));

    hr("5. around：原型写法 fn.around(b4fn, afn)");
    log("  返回值：", add.around(() => log("  b4"), () => log("  af"))(2, 3));
}

/**
 * 6. wrapper —— 参数加工 + 结果加工
 *    b4fn 的返回值作为 fn 的唯一入参，afn 再处理 fn 的结果。
 *    同步与异步两种情况语义一致：afn 拿到的都是 fn 的返回值。
 */
async function demoWrapper() {
    hr("6. wrapper：b4fn 加工入参，afn 加工结果（异步）");
    const queryList = wrapper(
        async (params) => {
            log("  请求参数：", params);
            return {list: [1, 2, 3], ...params};
        },
        (page, size) => ({page, size}),
        (rsp) => rsp.list,
    );
    log("  返回值：", await queryList(1, 20));

    hr("6. wrapper：同步场景（b4fn 求和 -> fn 翻倍 -> afn 拼字符串）");
    const wrapped = ((v) => v * 2).wrapper((a, b) => a + b, (v) => `结果 ${v}`);
    log("  返回值：", wrapped(1, 2), "= 结果 6");
}

/**
 * 7. filter —— 条件拦截
 *    filterFn 返回 false（严格等于）时 fn 不会执行，调用返回 undefined。
 *    注意：请使用函数式 filter(fn, filterFn)，Function.prototype.filter 存在同名参数遮蔽的缺陷。
 */
async function demoFilter() {
    hr("7. filter：filterFn 返回 false 时阻断执行");
    const remove = (id) => log(`  删除 ${id}`);
    const guardedRemove = filter(remove, (id) => {
        const ok = id > 0;
        log(`  校验 id=${id} -> ${ok}`);
        return ok;
    });
    guardedRemove(1);       // 执行
    guardedRemove(-1);      // 被拦截

    hr("7. filter：filterFn 也可以是异步的");
    const asyncGuard = filter(remove, async (id) => {
        await sleep(10);
        return id !== 2;
    });
    await asyncGuard(2);    // 被拦截
    await asyncGuard(3);    // 执行
}

/**
 * 8. times —— 重复执行
 *    times(fn, cnt, interval)：每隔 interval 毫秒执行一次，共 cnt 次；
 *    返回的 promise 在全部执行完（或被 stop）后 resolve。
 *    timesFn.stop() 可提前中断。
 */
async function demoTimes() {
    hr("8. times：每 20ms 执行一次，共 3 次");
    let i = 0;
    const poll = times(() => log(`  第 ${++i} 次执行`), 3, 20);
    log("  结束状态（false 表示跑完）：", await poll());

    hr("8. times：stop() 提前中断");
    let j = 0;
    const polling = times(() => {
        j++;
        log(`  轮询第 ${j} 次`);
        if (j === 2) polling.stop();
    }, 5, 20);
    log("  结束状态（true 表示被中断）：", await polling());
}

/**
 * 9. 组合使用：链式叠加多个切面
 *     原型方法返回新函数，可以继续链式调用（见 1~9 的原型写法）。
 */
async function demoCompose() {
    hr("9. 组合：before -> around -> after 链式叠加");
    const enhanced = add
        .before((a, b) => log(`  [log] 即将计算 ${a}+${b}`))
        .around(() => log("  [tx] 开启"), () => log("  [tx] 提交"))
        .after(() => log("  [log] 计算完成"));
    log("  返回值：", enhanced(1, 2));

    hr("9. 组合：pipe + filter 组装业务请求");
    const del = filter(
        pipe(add, (v) => `删除了 ${v} 条记录`),
        (a, b) => a + b > 0,
    );
    log("  返回值：", del(1, 2));
    log("  返回值：", del(-1, 0));
}

async function main() {
    log("aop.js 使用示例（每个片段都可独立复制到项目中使用）");
    await demoBefore();
    await demoUnshift();
    await demoAfter();
    await demoPipe();
    await demoAround();
    await demoWrapper();
    await demoFilter();
    await demoTimes();
    await demoCompose();
    log("\n示例执行完毕。");
}

main();
