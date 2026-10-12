/**
 * throttle.js 使用示例
 *
 * 运行方式（项目已声明 "type": "module"，可直接用 node 执行 ESM）：
 *      node views/@asset/ifn/throttle.example.js
 *
 * 两个 API 共用同一套实现，区别只在 mode：
 *   throttle(fn, opt) —— 节流：delay 窗口内最多执行 1~2 次（首次 + 尾部）
 *   debounce(fn, opt) —— 防抖：每次调用都重置定时器，停止调用满 delay 后才执行
 *
 * opt 可传数字（等价于 {delay}），也可传对象：
 *   {delay: 300, immediate: true, leave: false}
 *     delay     窗口长度，默认 1000（传 0 会回退成 1000）
 *     immediate 是否在窗口开始时立即执行，默认 true
 *     leave     是否丢弃窗口内被拦下的调用（true = 不补尾部执行），默认 false
 *
 * 返回值：恒为 Promise，resolve 出 fn 的结果（fn 是 async 时会展平）。
 * 另有 retFn.clear()：取消挂起的执行，并以字符串 "$rej$" reject 当前 promise。
 *
 * 项目中的真实用法：
 *   views/rap/@module/Chart.vue                             debounce(updateAxisPointerHandler, 80)
 *   views/rap/individual/mac3.0/abnormal/@module/search-form.vue  watch(fidStr, throttle(fn, 1000))
 */
import {throttle, debounce} from "./throttle.js";

const log   = console.log;
const hr    = (title) => log(`\n===== ${title} =====`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const now   = () => String(Date.now() % 100000).padStart(5, "0");

/**
 * 1. throttle 基本用法 —— 搜索框输入
 *    默认 immediate=true：首次输入立即查一次；窗口内的输入被合并，
 *    窗口末尾再补一次（用最后一次的参数），保证不会漏掉最终值。
 */
async function demoThrottleBasic() {
    hr("1. throttle：默认行为（首次立即 + 窗口末尾补一次）");
    const search = throttle((kw) => log(`  [${now()}] 请求搜索：${kw}`), 200);

    for (const kw of ["r", "ra", "rap", "rap-"]) {   // 模拟连续输入
        search(kw);
        await sleep(50);
    }
    await sleep(250);
    log("  ↑ 只会看到 2 次请求：'r' 立即发出，'rap-' 在停止输入后补发");
}

/**
 * 2. leave: true —— 窗口内只保留首次，不做尾部补偿
 *    适合"防止重复提交 / 防连点"：一次点击立刻生效，随后的连点直接丢弃。
 */
async function demoThrottleLeave() {
    hr("2. throttle + leave:true：防连点（只保留窗口内首次）");
    const submit = throttle((order) => log(`  [${now()}] 提交订单 ${order}`), {delay: 300, leave: true});

    [1, 2, 3, 4].forEach((id) => submit(id));   // 连点 4 次
    await sleep(400);
    submit(5);                                  // 已超出窗口，立即执行
    await sleep(50);
    log("  ↑ 只有 1 号（首次）和 5 号（新一轮）被提交，2/3/4 被丢弃");
}

/**
 * 3. immediate: false —— 只保留窗口末尾那一次
 *    适合"拖拽结束 / 滚动停止后才处理"：过程中不执行，只认最后一次。
 */
async function demoThrottleImmediateFalse() {
    hr("3. throttle + immediate:false：只保留最后一次（滚动结束上报）");
    const report = throttle((pos) => log(`  [${now()}] 上报滚动位置 ${pos}`), {delay: 200, immediate: false});

    for (const pos of [100, 200, 300, 400]) {
        report(pos);
        await sleep(60);
    }
    await sleep(250);
    log("  ↑ 过程中一次都没执行，只在最后上报了 400");
}

/**
 * 4. debounce 默认（immediate=true）—— 注意一次突发会执行两次
 *    首次立即执行一次，停止调用满 delay 后再补一次尾部。
 */
async function demoDebounceDefault() {
    hr("4. debounce：默认（首次立即 + 尾部补一次）");
    const save = debounce((draft) => log(`  [${now()}] 保存草稿：${draft}`), 200);

    save("草稿1");
    await sleep(80);
    save("草稿2");
    await sleep(80);
    save("草稿3");
    await sleep(300);
    log("  ↑ 执行了两次：'草稿1'（立即）+ '草稿3'（尾部）");
}

/**
 * 5. debounce + immediate:false —— 标准防抖
 *    只在"停止调用满 delay"后执行一次，是 resize / 图表联动最常用的一组参数。
 */
async function demoDebounceStandard() {
    hr("5. debounce + immediate:false：标准防抖（图表 updateAxisPointer，项目真实用法）");
    // Chart.vue 中：updateAxisPointerHandler = debounce(updateAxisPointerHandler, 80)
    const updateAxisPointer = debounce((x) => log(`  [${now()}] 更新坐标轴指针 x=${x}`), {delay: 150, immediate: false});

    for (const x of [10, 20, 30, 40, 50]) {
        updateAxisPointer(x);
        await sleep(40);            // 间隔小于 delay，定时器被不断重置
    }
    await sleep(200);
    log("  ↑ 只执行了最后一次 x=50");

    hr("5. debounce + immediate:false：窗口自适应 —— 停止输入后才校验");
    const validate = debounce((v) => log(`  [${now()}] 校验手机号 ${v}`), {delay: 200, immediate: false});
    "138001380".split("").forEach((c, i) => setTimeout(() => validate("138001380".slice(0, i + 1)), i * 60));
    await sleep(900);
}

/**
 * 6. await 返回值 / 异步 fn
 *    被包装后的函数恒返回 Promise，可直接 await 拿到 fn 的结果；
 *    注意窗口内的并发调用共享同一个 promise，拿到的是首次执行的结果。
 */
async function demoReturnValue() {
    hr("6. 返回值：恒为 Promise，可 await（异步 fn 同样适用）");
    const query = throttle(async (id) => {
        await sleep(30);
        return {id, name: `报表-${id}`};
    }, {delay: 200, immediate: false});
    log("  await 结果：", await query(7));

    hr("6. 返回值：窗口内的并发调用共享同一个 promise");
    const sync = throttle((v) => `#${v}`, 200);
    const p1 = sync(1);
    const p2 = sync(2);
    log("  是同一个 promise 吗：", p1 === p2, "-> 两次 await 结果：", await p1, await p2);
    await sleep(250);
}

/**
 * 7. clear() —— 取消挂起的执行
 *    组件卸载 / 路由切换时主动收尾；挂起的 promise 会以字符串 "$rej$" reject，需自行 catch。
 */
async function demoClear() {
    hr("7. clear()：取消挂起的防抖任务（组件卸载时收尾）");
    const flush = debounce((data) => log(`  上报埋点 ${JSON.stringify(data)}`), {delay: 300, immediate: false});

    const pending = flush({evt: "page-leave"});
    pending.catch(() => {});            // clear 会 reject，这里先兜住
    await sleep(100);
    flush.clear();
    log("  已 clear，挂起的 promise 结果：", await pending.then(() => "resolved", (e) => `rejected: ${e}`));

    hr("7. clear()：返回函数自身可链式；clear 后计时归零，下一次调用立即生效");
    const t = throttle((v) => log(`  [${now()}] 执行 ${v}`), {delay: 300});   // immediate 默认 true
    t(1);
    (t.clear())("clear 之后的调用");    // clear 把计时归零，不会被上一轮的窗口拦下
    await sleep(50);
    log("  ↑ 注意：immediate:false 时 clear 后的调用仍要等满 delay（尾部定时器重新计时）");
}

/**
 * 8. 与 Vue watch 组合（项目真实写法）
 *    views/rap/individual/mac3.0/abnormal/@module/search-form.vue：
 *        watch(fidStr, throttle((val) => { queryParams.ids = val?.split(/[,]|[，]/) || []; }, 1000));
 */
async function demoWithVueWatch() {
    hr("8. 与 Vue watch 组合：把节流函数直接作为 watch 回调");
    // 这里用普通回调模拟 watch 触发
    const onFidChange = throttle((val) => {
        const ids = val?.split(/[,]|[，]/) || [];
        log(`  queryParams.ids =`, ids);
    }, 300);

    ["1001", "1001,1002", "1001,1002,1003"].forEach((v) => onFidChange(v));
    await sleep(400);
    log("  ↑ 连续的 watch 触发被合并，最终 ids 与最后一次输入一致");
}

/**
 * 9. 注意事项（当前实现的已知行为，详见 throttle.test.js）
 */
function demoCaveats() {
    hr("9. 注意事项");
    [
        "delay 默认 1000ms；delay: 0 会被 `opt.delay || 1000` 回退成 1000，不要用它表示'立即'。",
        "immediate 默认 true，所以 debounce 的首次调用也会立即执行；想要标准防抖请显式传 immediate: false。",
        "窗口内的并发调用返回的是同一个 promise，拿到的是首次执行的结果，无法区分各自返回值。",
        "throttle 尾部执行时：参数取最后一次调用，但 this 取安排定时器的那次调用，两者可能不配对。",
        "throttle + {immediate: false, leave: true} 是死组合：首部被关、尾部被拦，fn 永不执行且 promise 永不 settle。",
        "clear() 会把挂起的 promise 以字符串 \"$rej$\" reject，调用处记得 catch，否则会产生 unhandled rejection。",
        "尾部执行中 fn 抛出的异常发生在 setTimeout 回调里，不会进入 promise，需要自行 try/catch。",
    ].forEach((tip, i) => log(`  ${i + 1}. ${tip}`));
}

async function main() {
    log("throttle.js 使用示例（每个片段都可独立复制到项目中使用）");
    await demoThrottleBasic();
    await demoThrottleLeave();
    await demoThrottleImmediateFalse();
    await demoDebounceDefault();
    await demoDebounceStandard();
    await demoReturnValue();
    await demoClear();
    await demoWithVueWatch();
    demoCaveats();
    log("\n示例执行完毕。");
}

main();
