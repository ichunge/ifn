/**
 * chain.js 单元测试（基于 Node 内置 test runner，零依赖）
 *
 * 运行：
 *     npm test
 *     # 或 node --test views/@asset/ifn/chain.test.js
 *
 * 说明：
 * 1. Chain 原先定义在 aop.js 中，因不属于「函数切面」范畴已迁至 chain.js，用例随之迁出。
 * 2. run() 恒返回 Promise；首节点没有显式返回值时 resolve 出 undefined，
 *    想拿到链条结果需要 `return next(...)` 或 `return 结果值`。
 */
import {describe, it} from "node:test";
import assert           from "node:assert/strict";
import {Chain}          from "./chain.js";

describe("Chain", () => {
    const buildChain = () => {
        const log     = [];
        const checkIn = new Chain(next => async (arg) => {
            log.push("c1-in");
            if (!arg.user) return (arg.err = "未登录");
            await next(arg);
            log.push("c1-out");
        });
        const checkPerm = new Chain(next => async (arg) => {
            log.push("c2");
            if (!arg.user.admin) return (arg.err = "无权限");
            await next(arg);
        });
        const handler = new Chain(next => (arg) => {
            log.push("handler");
            arg.result = "处理完成";
        });
        checkIn.successor   = checkPerm;
        checkPerm.successor = handler;
        return {log, checkIn};
    };

    it("按 洋葱模型 依次经过各节点，await next 之后的代码最后执行", async () => {
        const {log, checkIn} = buildChain();
        const arg            = {user: {admin: true}, log: []};
        await checkIn.run(arg);
        assert.deepEqual(log, ["c1-in", "c2", "handler", "c1-out"]);
        assert.equal(arg.result, "处理完成");
    });

    it("不调用 next 即短路，后继节点不执行", async () => {
        const {log, checkIn} = buildChain();
        const arg            = {log: []};
        await checkIn.run(arg);
        assert.deepEqual(log, ["c1-in"]);
        assert.equal(arg.err, "未登录");
        assert.equal(arg.result, undefined);
    });

    it("run 恒返回 Promise；首节点无显式返回值时 resolve 出 undefined", async () => {
        const {checkIn} = buildChain();
        const arg       = {user: {admin: true}, log: []};
        const ret       = checkIn.run(arg);
        assert.ok(ret instanceof Promise);
        assert.equal(await ret, undefined, "首节点没有 return，结果不被兜底替换");
        assert.equal(arg.result, "处理完成", "原地加工的 args 仍由调用方持有");
    });

    it("首节点 return next(...) 时可拿到下游的结果", async () => {
        const c = new Chain(next => (v) => next(v * 2));
        c.successor = (v) => `#${v}`;
        assert.equal(await c.run(3), "#6");
    });

    it("首节点直接 return 结果值时以该值为准", async () => {
        const c = new Chain(next => (v) => (v > 0 ? next(v) : "非法入参"));
        c.successor = (v) => v * 10;
        assert.equal(await c.run(2), 20);
        assert.equal(await c.run(-1), "非法入参");
    });

    it("节点显式返回值时以该值为准", async () => {
        const c = new Chain(next => () => "custom");
        assert.equal(await c.run(), "custom");
    });

    it("支持不定参数沿链传递，多参数 resolve 成数组", async () => {
        const c = new Chain(next => (a, b) => next(a + 1, b + 1));
        c.successor = (a, b) => a * b;
        assert.equal(await c.run(2, 3), 12);

        const spread = new Chain(next => (...ids) => next(...ids, "extra"));
        spread.successor = (...args) => args;
        assert.deepEqual(await spread.run(1, 2), [1, 2, "extra"]);
    });

    it("next() 不传参时沿用上游参数", async () => {
        const c = new Chain(next => (a, b) => next());
        c.successor = (a, b) => a + b;
        assert.equal(await c.run(2, 3), 5);
    });

    it("next 可替换下游收到的参数", async () => {
        const c = new Chain(next => (arg) => next({...arg, patched: true}));
        c.successor = (arg) => arg.patched;
        assert.equal(await c.run({}), true);
    });

    it("支持非柯里化写法 (...args, next)", async () => {
        const c = new Chain((a, b, next) => next(`${a}-${b}`));
        c.successor = (str) => str.toUpperCase();
        assert.equal(await c.run("rap", "report"), "RAP-REPORT");
    });

    it("尾节点的 next 是直通函数，不会抛错且原样返回", async () => {
        const c = new Chain(next => async (v) => await next(v));
        assert.equal(await c.run(9), 9);
    });

    it("successor 可挂普通函数，赋值 null 解除挂载", async () => {
        const c = new Chain(next => (v) => next(v));
        c.successor = (v) => v * 2;
        assert.equal(await c.run(3), 6);

        c.successor = null;
        assert.equal(c.successor, null);
        assert.equal(await c.run(3), 3);
    });

    it("successor 传入非法类型时抛 TypeError", () => {
        const c = new Chain();
        assert.throws(() => (c.successor = 123), TypeError);
    });

    it("未传处理函数时默认直通", async () => {
        assert.equal(await new Chain().run(7), 7);
    });
});
