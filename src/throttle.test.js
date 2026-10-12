/**
 * throttle.js 单元测试（基于 Node 内置 test runner，零依赖）
 *
 * 运行：
 *     npm test
 *     # 或 node --test views/@asset/ifn/throttle.test.js
 *
 * 说明：
 * 1. 全部用例使用真实定时器（delay 取 60~120ms），单个文件总耗时约 5 秒。
 * 2. 标注【现有行为】的用例用于锁定当前实现（含已发现的反直觉点/缺陷），
 *    若后续修复了对应实现，需要同步更新这里的断言。
 * 3. 关键点速览：
 *    - 被包装函数恒返回 Promise，可用 await 拿到 fn 的结果；
 *    - immediate 默认 true：首次调用立即执行；
 *    - leave 默认 false：窗口内被拦下的调用会在窗口末尾补执行一次（trailing）；
 *    - clear() 会取消挂起的执行并以字符串 "$rej$" reject 当前 promise。
 */
import {describe, it} from "node:test";
import assert           from "node:assert/strict";
import {throttle, debounce} from "./throttle.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 判断 promise 在 wait 毫秒内是否仍未 settle。
 * 用于锁定"永不返回"这类缺陷行为（Promise.race 已挂载 handler，不会产生 unhandled rejection）。
 */
function isPending(p, wait = 200) {
    return Promise.race([
        p.then(() => "settled", () => "settled"),
        sleep(wait).then(() => "pending"),
    ]);
}

/** 记录调用轨迹的桩函数：fn.calls() 取每次调用的首个参数，fn.log 取完整的 {args, self} */
function spy(impl = (v) => v) {
    const log = [];
    const fn  = function (...args) {
        log.push({args, self: this});
        return impl.apply(this, args);
    };
    fn.log   = log;
    fn.calls = () => log.map((it) => it.args[0]);
    return fn;
}

describe("基础能力", () => {
    it("调用后返回 Promise 实例", async () => {
        const t = throttle(spy(), 60);
        const p = t(1);
        assert.ok(p instanceof Promise, "返回 Promise，可 await");
        await p;
    });

    it("参数原样透传给 fn", async () => {
        const fn = spy();
        const t  = throttle(fn, 60);
        await t("a", "b", "c");
        assert.deepEqual(fn.log[0].args, ["a", "b", "c"]);
    });

    it("this 原样透传（retFn.call(ctx, ...)）", async () => {
        const ctx = {tag: "ctx"};
        const t   = throttle(function () { return this?.tag; }, 60);
        assert.equal(await t.call(ctx), "ctx");
    });

    it("fn 返回 Promise 时 resolve 出最终结果", async () => {
        const t = throttle(async (v) => {
            await sleep(10);
            return v * 2;
        }, 60);
        assert.equal(await t(21), 42, "async fn 的 Promise 会被展平");
    });

    it("fn 在立即执行分支抛异常时 promise reject", async () => {
        const t = throttle(() => { throw new Error("boom"); }, 60);
        const err = await t(1).then(() => null, (e) => e);
        assert.equal(err?.message, "boom");
    });

    it("opt 传数字等价于 {delay: 数字}", async () => {
        assert.equal(await throttle((v) => v * 2, 50)(5), 10);
        assert.equal(await throttle((v) => v * 2, {delay: 50})(5), 10);
    });
});

describe("throttle：默认（immediate=true，leave 未传）", () => {
    it("首次调用立即执行（leading）", async () => {
        const fn = spy();
        const t  = throttle(fn, 60);
        assert.equal(await t(1), 1);
        assert.deepEqual(fn.calls(), [1]);
    });

    it("窗口内的后续调用不会立即执行", async () => {
        const fn = spy();
        const t  = throttle(fn, 60);
        await t(1);
        t(2);
        t(3);
        await sleep(20);
        assert.deepEqual(fn.calls(), [1], "2 和 3 被拦下");
    });

    it("窗口末尾补一次执行，参数取最后一次调用", async () => {
        const fn = spy();
        const t  = throttle(fn, 80);
        await t(1);
        t(2);
        t(3);
        await sleep(150);
        assert.deepEqual(fn.calls(), [1, 3], "leading(1) + trailing(3)");
    });

    it("【现有行为】窗口内的调用复用首次的 promise，拿到的是首次的返回值", async () => {
        const fn = spy((v) => v * 10);
        const t  = throttle(fn, 80);
        const p1 = t(1);
        const p2 = t(2);
        assert.equal(p1, p2, "窗口内返回的是同一个 promise 实例");
        assert.equal(await p2, 10, "即使传入的是 2，拿到的仍是首次的 10");
    });

    it("【现有行为】尾部执行的返回值不会回传给已 resolve 的 promise", async () => {
        const fn = spy((v) => v * 10);
        const t  = throttle(fn, 80);
        const p  = t(1);
        t(3);
        await sleep(150);
        assert.deepEqual(fn.calls(), [1, 3], "尾部确实执行了 fn(3)");
        assert.equal(await p, 10, "但 promise 早已以 10 resolve，拿不到 30");
    });

    it("delay 结束后进入下一轮，可再次立即执行", async () => {
        const fn = spy();
        const t  = throttle(fn, 60);
        await t(1);
        t(2);
        await sleep(120);
        assert.equal(await t(3), 3, "新一轮的 leading");
        assert.deepEqual(fn.calls(), [1, 2, 3]);
    });

    it("默认 delay 为 1000ms（opt 省略时）", async () => {
        const fn = spy();
        const t  = throttle(fn);
        await t(1);
        t(2);
        await sleep(200);
        assert.deepEqual(fn.calls(), [1], "200ms 时尾部还没到点");
        await sleep(1000);
        assert.deepEqual(fn.calls(), [1, 2], "约 1000ms 后补执行");
    });

    it("【现有行为】delay 传 0 时按 1000ms 处理（opt.delay || 1000）", async () => {
        const fn = spy();
        const t  = throttle(fn, {delay: 0, immediate: false});
        t(1).catch(() => {});
        await sleep(150);
        assert.deepEqual(fn.calls(), [], "若真按 0 处理，此时应已执行");
        await sleep(1000);
        assert.deepEqual(fn.calls(), [1], "约 1000ms 后执行，说明 delay 被回退为 1000");
    });
});

describe("throttle：leave=true（丢弃中间调用）", () => {
    it("窗口内的调用被直接丢弃，不再补尾部执行", async () => {
        const fn = spy();
        const t  = throttle(fn, {delay: 80, leave: true});
        await t(1);
        t(2);
        t(3);
        await sleep(150);
        assert.deepEqual(fn.calls(), [1], "只有 leading，没有 trailing");
    });

    it("窗口过后的下一次调用会立即执行 fn", async () => {
        const fn = spy();
        const t  = throttle(fn, {delay: 80, leave: true});
        await t(1);
        t(2);
        await sleep(150);
        await t(4);
        assert.deepEqual(fn.calls(), [1, 4], "已超过 delay，4 立即执行");
    });

    it("【现有行为】leave=true 时 promise 不再轮换，返回值永远是首次的结果", async () => {
        const fn = spy();
        const t  = throttle(fn, {delay: 80, leave: true});
        await t(1);
        t(2);
        await sleep(150);
        assert.equal(await t(4), 1, "因为不排尾部任务，p 没有机会被重置，拿到的是首次的 1");
        assert.deepEqual(fn.calls(), [1, 4], "但 fn 确实以 4 执行了，返回值与执行结果错位");
    });
});

describe("throttle：immediate=false（只保留尾部）", () => {
    it("首次调用不立即执行，promise 保持 pending", async () => {
        const fn = spy();
        const t  = throttle(fn, {delay: 120, immediate: false});
        const p  = t(1);
        assert.deepEqual(fn.calls(), []);
        assert.equal(await isPending(p, 60), "pending", "delay 未到，promise 不应 settle");
    });

    it("delay 后执行一次，参数取最后一次调用", async () => {
        const fn = spy();
        const t  = throttle(fn, {delay: 80, immediate: false});
        const p  = t(1);
        t(2);
        t(3);
        assert.equal(await p, 3, "promise 在尾部执行后才 resolve");
        assert.deepEqual(fn.calls(), [3]);
    });
});

describe("debounce：默认（immediate=true）", () => {
    it("首次调用立即执行", async () => {
        const fn = spy();
        const d  = debounce(fn, 80);
        assert.equal(await d(1), 1);
        assert.deepEqual(fn.calls(), [1]);
    });

    it("【现有行为】连续突发会执行两次：首次立即 + 停止调用后补一次", async () => {
        const fn = spy();
        const d  = debounce(fn, 80);
        await d(1);
        d(2);
        await sleep(50);
        d(3);                       // 重置定时器
        await sleep(150);           // 距 d(3) 已超过 delay
        assert.deepEqual(fn.calls(), [1, 3], "2 被 3 覆盖，尾部补一次 3");
    });

    it("每次调用都重置定时器，只有停止调用满 delay 才执行", async () => {
        const fn = spy();
        const d  = debounce(fn, {delay: 80, immediate: false});
        for (let i = 1; i <= 5; i++) {
            d(i);
            await sleep(30);        // 间隔 30ms < delay，定时器被不断重置
        }
        await sleep(150);
        assert.deepEqual(fn.calls(), [5], "只执行最后一次");
    });
});

describe("debounce：immediate=false（标准防抖）", () => {
    it("窗口内的调用被全部合并，只执行最后一次", async () => {
        const fn = spy();
        const d  = debounce(fn, {delay: 80, immediate: false});
        const p  = d(1);
        await sleep(20);
        assert.deepEqual(fn.calls(), [], "过程中不执行");
        d(2);
        d(3);
        assert.equal(await p, 3);
        assert.deepEqual(fn.calls(), [3]);
    });
});

describe("debounce：leave=true", () => {
    it("【现有行为】只有首次调用生效，后续调用被吞掉且不再执行", async () => {
        const fn = spy();
        const d  = debounce(fn, {delay: 80, leave: true});
        assert.equal(await d(1), 1, "首次立即执行");
        const p2 = d(2);
        assert.equal(await p2, 1, "复用首次已 resolve 的 promise");
        await sleep(150);
        assert.deepEqual(fn.calls(), [1], "2 永远不会被执行");
    });
});

describe("clear()", () => {
    it("取消挂起的执行并以 \"$rej$\" reject 当前 promise", async () => {
        const fn = spy();
        const t  = throttle(fn, {delay: 80, immediate: false});
        const p  = t(1);
        t.clear();
        const err = await p.then(() => null, (e) => e);
        assert.equal(err, "$rej$");
        assert.deepEqual(fn.calls(), [], "被 clear 的任务不会执行");
    });

    it("对已经 resolve 的 promise 无效", async () => {
        const t = throttle((v) => v * 10, 60);
        const p = t(1);
        t.clear();
        assert.equal(await p, 10, "已 resolve 的 promise 不会被 reject");
    });

    it("返回函数自身，可链式调用", async () => {
        const t = throttle((v) => v, 60);
        await t(1);
        assert.equal(t.clear(), t);
    });

    it("重复调用幂等，只 reject 一次", async () => {
        const t = throttle((v) => v, {delay: 80, immediate: false});
        const p = t(1);
        t.clear();
        t.clear();
        const err = await p.then(() => null, (e) => e);
        assert.equal(err, "$rej$");
    });

    it("clear 后计时归零，下一次调用（immediate=true）立即执行", async () => {
        const fn = spy();
        const t  = throttle(fn, {delay: 80});           // immediate 默认 true
        await t(1);
        t.clear();
        assert.equal(await t(9), 9, "t 归零后重新立即触发，不会被上一轮的窗口拦下");
        assert.deepEqual(fn.calls(), [1, 9]);
    });

    it("【现有行为】immediate=false 时 clear 后的调用仍要等满 delay", async () => {
        const fn = spy();
        const t  = throttle(fn, {delay: 80, immediate: false});
        t(1).catch(() => {});
        t.clear();
        const p = t(9);
        assert.equal(await isPending(p, 40), "pending", "尾部定时器仍按整个 delay 重新计时");
        assert.equal(await p, 9);
        assert.deepEqual(fn.calls(), [9]);
    });
});

describe("已知陷阱", () => {
    it("【现有行为】尾部执行的 this 来自安排定时器的那次调用，参数却来自最后一次调用", async () => {
        const fn = spy();
        const t  = throttle(fn, 80);
        const A = {tag: "A"}, B = {tag: "B"}, C = {tag: "C"};
        await t.call(A, 1);   // leading：this=A
        t.call(B, 2);         // 这一次安排了尾部定时器：this 被记住是 B
        t.call(C, 3);         // args 被覆盖为 3，但 this 不会更新
        await sleep(150);
        const seen = fn.log.map((it) => [it.self?.tag, it.args[0]]);
        assert.deepEqual(seen, [["A", 1], ["B", 3]], "this 与 args 来自不同的调用，两者并不配对");
    });

    it("【现有行为】throttle + immediate:false + leave:true 时 promise 永不 settle", async () => {
        const fn = spy();
        const t  = throttle(fn, {delay: 60, immediate: false, leave: true});
        const p  = t(1);
        assert.equal(await isPending(p), "pending");
        assert.deepEqual(fn.calls(), [], "leave 拦下了尾部，immediate=false 又没有首部，fn 永不执行");
    });

    it("【现有行为】窗口内并发调用共享同一个 promise，无法区分各自的返回值", async () => {
        const fn = spy((v) => `#${v}`);
        const t  = throttle(fn, 80);
        const [a, b, c] = [t(1), t(2), t(3)];
        assert.equal(await a, "#1");
        assert.equal(await b, "#1");
        assert.equal(await c, "#1");
        assert.ok(a === b && b === c, "三次调用拿到的是同一个 promise 实例");
        await sleep(150);
    });
});
