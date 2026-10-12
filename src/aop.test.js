/**
 * aop.js 单元测试（基于 Node 内置 test runner，零依赖）
 *
 * 运行：
 *     npm test
 *     # 或 node --test views/@asset/aop.test.js
 *
 * 说明：
 * 1. 部分用例标注了【现有行为】，用于锁定当前实现（含已发现的历史缺陷），
 *    若后续修复了对应实现，需要同步更新这里的断言。
 */
import {describe, it}             from "node:test";
import assert                     from "node:assert/strict";
import {before, unshift, after, pipe, around, wrapper, filter, times} from "./aop.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("原型方法挂载", () => {
    it("import 后 Function.prototype 上具备各切面方法", () => {
        ["before", "unshift", "after", "pipe", "around", "wrapper"].forEach((name) => {
            assert.equal(typeof Function.prototype[name], "function", `缺少 Function.prototype.${name}`);
        });
    });
});

describe("before", () => {
    const add = (a, b) => a + b;

    it("b4fn 先于 fn 执行，参数一致，返回 fn 的结果", () => {
        const log = [];
        const fn  = before(add, (a, b) => log.push(`b4:${a},${b}`));
        assert.equal(fn(1, 2), 3);
        assert.deepEqual(log, ["b4:1,2"]);
    });

    it("b4fn 返回 Promise 时等待其 resolve 后再执行 fn", async () => {
        const log = [];
        const fn  = before(add, async (a, b) => {
            await sleep(10);
            log.push(`b4:${a},${b}`);
        });
        assert.equal(await fn(1, 2), 3);
        assert.deepEqual(log, ["b4:1,2"]);
    });

    it("b4fn 的返回值不会替换 fn 的入参", () => {
        const fn = before((a, b) => [a, b], () => "ignored");
        assert.deepEqual(fn(1, 2), [1, 2]);
    });

    it("传入 ctx 时 this 指向 ctx", () => {
        const ctx = {tag: "ctx"};
        const fn  = before(function () { return this.tag; }, () => {}, ctx);
        assert.equal(fn(), "ctx");
    });

    it("原型写法 fn.before(b4fn) 等价", () => {
        const log = [];
        assert.equal(add.before(() => log.push("b4"))(1, 2), 3);
        assert.deepEqual(log, ["b4"]);
    });
});

describe("unshift", () => {
    it("b4fn 的返回值作为 fn 的唯一入参", () => {
        const fn = unshift((payload) => payload, (form) => ({...form, ts: 1}));
        assert.deepEqual(fn({name: "rap"}), {name: "rap", ts: 1});
    });

    it("b4fn 返回 Promise 时同样生效", async () => {
        const fn = unshift((v) => v * 2, async (a, b) => {
            await sleep(10);
            return a + b;
        });
        assert.equal(await fn(1, 2), 6);
    });

    it("原型写法 fn.unshift(b4fn) 等价", () => {
        const fn = ((v) => v * 2).unshift((a, b) => a + b);
        assert.equal(fn(1, 2), 6);
    });
});

describe("after", () => {
    const add = (a, b) => a + b;

    it("afn 后于 fn 执行，返回值仍是 fn 的结果", () => {
        const log = [];
        const fn  = after(add, (a, b) => {
            log.push(`af:${a},${b}`);
            return "dropped";
        });
        assert.equal(fn(1, 2), 3);
        assert.deepEqual(log, ["af:1,2"]);
    });

    it("afn 收到的是 fn 的原始参数", () => {
        let received;
        after((a, b) => a + b, (...args) => (received = args))(1, 2);
        assert.deepEqual(received, [1, 2]);
    });

    it("fn 为异步时等待其 resolve 后才执行 afn", async () => {
        const log = [];
        const fn  = after(async (a, b) => {
            await sleep(10);
            return a + b;
        }, () => log.push("af"));
        assert.equal(await fn(1, 2), 3);
        assert.deepEqual(log, ["af"]);
    });

    it("原型写法 fn.after(afn) 等价", () => {
        const log = [];
        assert.equal(add.after(() => log.push("af"))(1, 2), 3);
        assert.deepEqual(log, ["af"]);
    });
});

describe("pipe", () => {
    it("fn 的返回值流入 afn，返回 afn 的结果", () => {
        assert.equal(pipe((a, b) => a + b, (v) => v * 2)(1, 2), 6);
    });

    it("原型写法 fn.pipe(afn) 等价", () => {
        assert.equal(((a, b) => a + b).pipe((v) => `结果 ${v}`)(1, 2), "结果 3");
    });

    it("【现有行为】pipe 不感知 Promise，afn 收到的是 Promise 实例", async () => {
        let received;
        await pipe(async () => 1, (v) => {
            received = v;
            return v.then((x) => x + 1);
        })();
        assert.ok(received instanceof Promise, "afn 收到 Promise");
        assert.equal(await received, 1);
    });
});

describe("around", () => {
    const add = (a, b) => a + b;

    it("执行顺序为 b4fn -> fn -> afn，返回 fn 的结果", () => {
        const log = [];
        const fn  = around(add, () => log.push("b4"), () => log.push("af"));
        assert.equal(fn(1, 2), 3);
        assert.deepEqual(log, ["b4", "af"]);
    });

    it("b4fn 与 afn 都收到 fn 的原始参数", () => {
        const seen = [];
        around(add, (...a) => seen.push(["b4", a]), (...a) => seen.push(["af", a]))(1, 2);
        assert.deepEqual(seen, [["b4", [1, 2]], ["af", [1, 2]]]);
    });

    it("支持异步 fn，并等待 afn 完成后再返回结果", async () => {
        const log = [];
        const fn  = around(async (a, b) => {
            await sleep(10);
            return a + b;
        }, () => log.push("b4"), async () => {
            await sleep(10);
            log.push("af");
        });
        assert.equal(await fn(1, 2), 3);
        assert.deepEqual(log, ["b4", "af"]);
    });

    it("原型写法 fn.around(b4fn, afn) 等价", () => {
        const log = [];
        assert.equal(add.around(() => log.push("b4"), () => log.push("af"))(1, 2), 3);
        assert.deepEqual(log, ["b4", "af"]);
    });
});

describe("wrapper", () => {
    it("异步分支：b4ret 传给 fn，afn 处理 fn 的结果", async () => {
        const fn = wrapper(
            async (params) => ({list: [1, 2], ...params}),
            (page, size) => ({page, size}),
            (rsp) => rsp.list,
        );
        assert.deepEqual(await fn(1, 20), [1, 2]);
    });

    it("同步分支：b4ret 传给 fn，afn 处理 fn 的结果", () => {
        const fn = wrapper((v) => v + 1, () => 10, (v) => v);
        assert.equal(fn(), 11, "afn 收到 fn 的结果 11，而非 b4ret=10");
    });

    it("同步分支：未传 afn 时原样返回 fn 的结果", () => {
        const fn = wrapper((v) => v * 2, () => 3);
        assert.equal(fn(), 6);
    });

    it("同步分支：原型写法与函数式一致", () => {
        const fn = ((v) => v * 2).wrapper((a, b) => a + b);
        assert.equal(fn(1, 2), 6, "3 -> 翻倍 -> 6");
    });

    it("同步与异步分支语义一致：afn 拿到的都是 fn 的结果", async () => {
        const sync  = wrapper((v) => v + 1, () => 1, (v) => v);
        const async = wrapper(async (v) => v + 1, () => 1, (v) => v);
        assert.equal(sync(), 2);
        assert.equal(await async(), 2);
    });
});

describe("filter", () => {
    it("filterFn 返回 false 时阻断执行，调用返回 undefined", () => {
        let called = 0;
        const fn   = filter(() => called++, () => false);
        assert.equal(fn(), undefined);
        assert.equal(called, 0);
    });

    it("filterFn 返回非 false 时正常执行（含 0 / null / undefined 等假值）", () => {
        let called = 0;
        [true, 0, null, undefined, "", 1].forEach((ret) => {
            filter(() => called++, () => ret)();
        });
        assert.equal(called, 6, "只有严格等于 false 才阻断");
    });

    it("filterFn 返回 Promise 时按 resolve 后的值判断", async () => {
        let called = 0;
        const fn   = filter(() => called++, async (id) => {
            await sleep(10);
            return id !== 2;
        });
        assert.equal(await fn(2), undefined, "resolve false -> 阻断");
        fn(3);
        await sleep(20);
        assert.equal(called, 1, "resolve true -> 执行");
    });

    it("阻断时 fn 收不到任何参数", () => {
        let args;
        filter((...a) => (args = a), () => false)(1, 2);
        assert.equal(args, undefined);
    });
});


describe("times", () => {
    it("按次数执行，跑满后 resolve(false)", async () => {
        const log   = [];
        const timer = times(() => log.push("tick"), 3, 10);
        assert.equal(await timer(), false);
        assert.equal(log.length, 3);
    });

    it("stop() 提前中断时 resolve(true)", async () => {
        let cnt     = 0;
        const timer = times(() => {
            if (++cnt === 2) timer.stop();
        }, 5, 10);
        assert.equal(await timer(), true);
        assert.equal(cnt, 2);
    });

    it("参数与 this 原样透传给 fn", async () => {
        const seen  = [];
        const ctx   = {tag: "ctx"};
        const timer = times(function (a, b) {
            seen.push([this?.tag, a, b]);
        }, 1, 10);
        await timer.call(ctx, 1, 2);
        assert.deepEqual(seen, [["ctx", 1, 2]]);
    });
});
