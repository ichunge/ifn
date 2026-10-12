/**
 * co.js 单元测试（基于 Node 内置 test runner，零依赖）
 *
 * 运行：
 *     npm test
 *     # 或 node --test views/@asset/ifn/co.test.js
 *
 * 说明：
 * 1. co 原先定义在 aop.js 中，因不属于「函数切面」范畴已迁至 co.js，用例随之迁出。
 * 2. 标注【现有行为】的用例用于锁定当前实现（含已发现的历史缺陷），
 *    若后续修复了对应实现，需要同步更新这里的断言。
 * 3. co#stop() 内部的 setInterval 未清理，会挂住事件循环导致进程不退出，
 *    因此相关用例用 captureTimers() 捕获并清理定时器。
 */
import {describe, it} from "node:test";
import assert           from "node:assert/strict";
import {co}             from "./co.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 捕获被测代码内部创建的 setInterval 并在结束后清理，
 * 避免 co#stop() 遗留的定时器导致测试进程无法退出。
 */
async function captureTimers(fn) {
    const origin               = globalThis.setInterval;
    const ids                  = [];
    globalThis.setInterval     = (...args) => {
        const id = origin(...args);
        ids.push(id);
        return id;
    };
    try {
        return await fn();
    } finally {
        ids.forEach((id) => clearInterval(id));
        globalThis.setInterval = origin;
    }
}

describe("原型方法挂载", () => {
    it("import 后 Function.prototype.co 可用", () => {
        assert.equal(typeof Function.prototype.co, "function", "缺少 Function.prototype.co");
    });
});

describe("co", () => {
    it("不丢任务，且每个调用都能拿到自己的返回值", async () => {
        const worker = co(async (id) => {
            await sleep(5);
            return `#${id}`;
        }, 2, 10);
        const rets = await Promise.all([1, 2, 3, 4, 5, 6].map((id) => worker(id)));
        assert.deepEqual(rets, ["#1", "#2", "#3", "#4", "#5", "#6"]);
    });

    it("任务耗时小于轮询间隔时表现为串行", async () => {
        const order  = [];
        const worker = co(async (id) => {
            order.push(`in${id}`);
            await sleep(1);
            order.push(`out${id}`);
        }, 1, 30);
        await Promise.all([1, 2, 3].map((id) => worker(id)));
        assert.deepEqual(order, ["in1", "out1", "in2", "out2", "in3", "out3"]);
    });

    it("【现有行为】concurrency 只决定消费循环条数，不保证同时运行上限", async () => {
        let running  = 0;
        let maxRun   = 0;
        const worker = co(async () => {
            running++;
            maxRun = Math.max(maxRun, running);
            await sleep(30);
            running--;
        }, 2, 10);

        await Promise.all([1, 2, 3, 4, 5, 6].map((id) => worker(id)));
        assert.ok(maxRun > 2, `并发峰值 ${maxRun} 超过设定的 2：消费循环每 wt 毫秒起一个任务，不等上一个结束`);
    });

    it("【现有行为】concurrency 为 1 且任务耗时大于轮询间隔时任务会重叠", async () => {
        const order  = [];
        const worker = co(async (id) => {
            order.push(`in${id}`);
            await sleep(20);
            order.push(`out${id}`);
        }, 1, 5);
        await Promise.all([1, 2, 3].map((id) => worker(id)));
        assert.deepEqual(order, ["in1", "in2", "in3", "out1", "out2", "out3"]);
    });

    it("默认参数（concurrency=1, wt=10）可执行", async () => {
        const worker = co(async (id) => id * 2);
        assert.deepEqual(await Promise.all([worker(1), worker(2)]), [2, 4]);
    });

    it("原型写法 fn.co(concurrency) 等价", async () => {
        const worker = (async (id) => id * 2).co(1);
        assert.equal(await worker(3), 6);
    });

    it("stop() 清空队列，未开始的任务不再执行", async () => {
        await captureTimers(async () => {
            const executed = [];
            const worker   = co(async (id) => {
                executed.push(id);
                await sleep(20);
            }, 1, 10);

            worker(1);
            worker(2);
            await sleep(15);
            worker(3);
            worker(4);
            await worker.stop();
            await sleep(60);

            assert.deepEqual(executed, [1, 2], "3 和 4 应被 stop 清空");
        });
    });
});
