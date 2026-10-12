/**
 * chain.js 使用示例
 *
 * 运行方式（项目已声明 "type": "module"，可直接用 node 执行 ESM）：
 *      node views/@asset/ifn/chain.example.js
 *
 * Chain 是职责链（Chain of Responsibility / 中间件链），与 aop.js 的分工不同：
 *   - aop.js：给「单个函数」套切面（before / after / around ...）
 *   - chain.js：把「多个节点」串成一条可短路、可回流的管道
 *
 * 核心约定：
 *   1. 节点写成 next => (...args) => {...}（柯里化，推荐），也可写成 (...args, next) => {...}；
 *   2. 不调用 next 即短路，后继节点全部不会执行；
 *   3. 节点可以是 async 函数，await next(arg) 之后的代码后继全部执行完才执行（洋葱模型）；
 *   4. 参数个数不定，沿链原样传递；next() 不传参时沿用上游参数；
 *   5. run() 恒返回 Promise，resolve 出首节点的返回值——
 *      想拿到链条结果，节点要 `return next(...)` 或直接 `return 结果值`。
 *
 * 注：Chain 原先定义在 aop.js 中，因不属于函数切面范畴已迁至 chain.js，示例一并迁出。
 */
import {Chain} from "./chain.js";

const log  = console.log;
const hr   = (title) => log(`\n===== ${title} =====`);

/**
 * 1. 基本用法：权限校验链（正常放行）
 *    每个节点加工同一个 arg，调用 next(arg) 交给后继节点。
 */
async function demoBasic() {
    hr("1. 权限校验链（正常放行）");
    const checkLogin = new Chain(next => async (arg) => {
        arg.log.push("checkLogin");
        if (!arg.user) return (arg.err = "未登录");   // 不调用 next -> 短路
        await next(arg);
        arg.log.push("checkLogin-out");               // 后继全部执行完才回到这里
    });
    const checkPerm = new Chain(next => async (arg) => {
        arg.log.push("checkPerm");
        if (!arg.user.admin) return (arg.err = "无权限");
        await next(arg);
    });
    const handler = new Chain(next => (arg) => {
        arg.log.push("handler");
        arg.result = "处理完成";
    });
    checkLogin.successor = checkPerm;
    checkPerm.successor  = handler;

    const arg = {user: {admin: true}, log: []};
    await checkLogin.run(arg);
    log("  arg：", arg);
    log("  ↑ 注意 checkLogin-out 排在最后：await next(arg) 之后的代码最后执行");
}

/**
 * 2. 短路：任一节点不调用 next，链条到此终止
 */
async function demoShortCircuit() {
    hr("2. 短路（未登录 / 无权限）");
    const checkLogin = new Chain(next => async (arg) => {
        arg.log.push("checkLogin");
        if (!arg.user) return (arg.err = "未登录");
        await next(arg);
    });
    const handler = new Chain(next => (arg) => {
        arg.log.push("handler");
        arg.result = "处理完成";
    });
    checkLogin.successor = handler;

    const anonymous = {log: []};
    await checkLogin.run(anonymous);
    log("  无 user：", anonymous, "（handler 未执行）");

    const normal = {user: {admin: false}, log: []};
    await checkLogin.run(normal);
    log("  有 user：", normal);
}

/**
 * 3. successor 也可以直接挂普通函数；节点可返回新值
 */
async function demoSuccessor() {
    hr("3. successor 挂普通函数 / 挂 null 解除挂载");
    const parse = new Chain(next => (arg) => next({...arg, parsed: true}));
    parse.successor = (arg) => `${arg.name} -> ${arg.parsed}`;
    log("  挂函数：", await parse.run({name: "rap"}));

    const doubler = new Chain(next => (v) => next(v));
    doubler.successor = (v) => v * 2;
    log("  挂函数：run(3) =", await doubler.run(3));
    doubler.successor = null;                       // 解除挂载，尾节点 next 变成直通函数
    log("  挂 null：run(3) =", await doubler.run(3));

    const c = new Chain();
    try {
        c.successor = 123;
    } catch (e) {
        log("  挂非法类型：", e.constructor.name, "-", e.message);
    }
}

/**
 * 4. 参数个数不定：多参数沿链传递，节点可替换成任意个数
 */
async function demoMultiArgs() {
    hr("4. 不定参数沿链传递");
    const plusOne = new Chain(next => (a, b) => next(a + 1, b + 1));
    plusOne.successor = (a, b) => a * b;
    log("  run(2, 3) =", await plusOne.run(2, 3), "= (2+1)*(3+1)");

    const spread = new Chain(next => (...ids) => next(...ids, {at: "now"}));
    spread.successor = (...args) => args;
    log("  run(1, 2, 3) =", await spread.run(1, 2, 3), "（多参数 resolve 成数组）");

    const keep = new Chain(next => (a, b) => next());   // next() 不传参 -> 沿用上游参数
    keep.successor = (a, b) => a + b;
    log("  next() 不传参：run(2, 3) =", await keep.run(2, 3));
}

/**
 * 5. 非柯里化写法 (...args, next)：next 位于参数最后
 */
async function demoNonCurried() {
    hr("5. 非柯里化写法 (...args, next)");
    const join = new Chain((a, b, next) => next(`${a}-${b}`));
    join.successor = (str) => str.toUpperCase();
    log("  返回值：", await join.run("rap", "report"));
}

/**
 * 6. 拿链条结果的三种写法
 */
async function demoReturnValue() {
    hr("6. 想拿到结果：return next(...) / return 值 / 原地加工");
    const withReturn = new Chain(next => (v) => next(v * 2));
    withReturn.successor = (v) => `#${v}`;
    log("  return next(...)：", await withReturn.run(3));

    const direct = new Chain(next => (v) => (v > 0 ? next(v) : "非法入参"));
    direct.successor = (v) => v * 10;
    log("  return 结果值：", await direct.run(2), "/", await direct.run(-1));

    const inPlace = new Chain(next => (arg) => {
        arg.done = true;                    // 只做原地加工，没有 return
    });
    log("  无 return：", await inPlace.run({}), "（调用方自行持有入参即可）");
}

async function main() {
    log("chain.js 使用示例（每个片段都可独立复制到项目中使用）");
    await demoBasic();
    await demoShortCircuit();
    await demoSuccessor();
    await demoMultiArgs();
    await demoNonCurried();
    await demoReturnValue();
    log("\n示例执行完毕。");
}

main();
