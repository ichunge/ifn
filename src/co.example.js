/**
 * co.js 使用示例
 *
 * 运行方式（项目已声明 "type": "module"，可直接用 node 执行 ESM）：
 *      node views/@asset/ifn/co.example.js
 *
 * co 是并发控制队列，与 aop.js 的分工不同：
 *   - aop.js：给「单个函数」套切面（before / after / around ...）
 *   - co.js ：把对某个函数的「多次调用」排队调度，控制同时运行的个数
 *
 * co(fn, concurrency, wt)：
 *   - 每次调用入队，返回一个 Promise，resolve 出 fn 的结果（不丢任务、不丢返回值）；
 *   - 最多同时存在 concurrency 条消费循环，每条每 wt 毫秒从队列取一个任务；
 *   - fn.stop() 清空队列并停止调度，返回 Promise，await 它可等待收尾。
 *
 * 两种等价写法：
 *   1. 函数式：import {co} from "@asset/ifn/co.js"; co(fn, concurrency, wt)
 *   2. 原型式：import "@asset/ifn/co.js"; fn.co(concurrency, wt)
 *
 * 项目中的真实用法（8 并发、800ms 间隔的批量操作）：
 *   views/rap/duizhang/merchant/data/list.vue      :coer="co((r) => opHelp(attrs.duiZhang, attrs.query, r), 8, 800)"
 *   views/rap/individual/mac3.0/abnormal/@module/data-list.vue  :coer="co(attrs.ignoreOer, 8, 800)"
 *
 * 注：co 原先定义在 aop.js 中，因不属于函数切面范畴已迁至 co.js，示例一并迁出。
 */
import {co} from "./co.js";

const log   = console.log;
const hr    = (title) => log(`\n===== ${title} =====`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 1. 基本用法：并发 2、间隔 30ms 消费 6 个任务
 *    每次调用的返回值互不干扰，可 Promise.all 一次收齐。
 */
async function demoBasic() {
    hr("1. 并发 2、间隔 30ms 消费 6 个任务");
    const now = () => String(Date.now()).slice(-5);
    const fetchOne = co(async (id) => {
        log(`  开始 ${id} @${now()}`);
        await sleep(50);
        log(`  结束 ${id} @${now()}`);
        return `#${id}`;
    }, 2, 30);

    const rets = await Promise.all([1, 2, 3, 4, 5, 6].map((id) => fetchOne(id)));
    log("  全部返回值：", rets);
}

/**
 * 2. stop() 中断剩余任务（批量操作取消）
 */
async function demoStop() {
    hr("2. stop() 中断剩余任务");
    const job = co(async (id) => {
        log(`  执行 ${id}`);
        await sleep(50);
        return id;
    }, 1, 20);

    job(1);
    job(2);
    await sleep(30);
    log("  stop 前调用 job(3)/job(4)，随后 stop()");
    job(3);
    job(4);
    await job.stop();
    log("  已停止，3 和 4 不会执行");
}

/**
 * 3. 原型写法 fn.co(concurrency, wt)
 */
async function demoPrototype() {
    hr("3. 原型写法 fn.co(concurrency, wt)");
    const save = async (row) => {
        await sleep(20);
        return `saved:${row}`;
    };
    log("  返回值：", await Promise.all([1, 2, 3].map((id) => save.co(2, 10)(id))));
}

/**
 * 4. 【现有行为】concurrency 只决定消费循环条数，不保证同时运行上限
 *    消费循环每 wt 毫秒起一个任务，并不等上一个结束，所以并发峰值可能高于设定值。
 */
async function demoConcurrency() {
    hr("4. concurrency 并不严格限制并发峰值");
    let running = 0, maxRun = 0;
    const worker = co(async () => {
        running++;
        maxRun = Math.max(maxRun, running);
        await sleep(30);
        running--;
    }, 2, 10);
    await Promise.all([1, 2, 3, 4, 5, 6].map((id) => worker(id)));
    log(`  设定 concurrency=2，实测并发峰值 ${maxRun}（>2，属现有行为）`);
}

async function main() {
    log("co.js 使用示例（每个片段都可独立复制到项目中使用）");
    await demoBasic();
    await demoStop();
    await demoPrototype();
    await demoConcurrency();
    log("\n示例执行完毕。");
    // co#stop() 内部用 setInterval 等待收尾且未清理，node 环境下需显式退出进程
    process.exit(0);
}

main();
