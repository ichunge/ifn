# ifn

一组围绕「函数」的轻量增强工具：给函数套切面、把函数串成职责链、给函数排队限流、给函数加节流防抖。

纯 ESM、零运行时依赖、不打包，源码即发布内容，直接按文件引入使用。

## 目录结构

```
src/
├── ifn.js           函数切面：before / unshift / after / pipe / around / wrapper / filter / times
├── chain.js         职责链（中间件链、洋葱模型）
├── co.js            并发控制队列
├── throttle.js      throttle / debounce
├── index.js         统一出口（当前只导出 co / filter / intercept / throttle）
└── *.example.js     每个模块对应的可运行示例
    *.test.js        每个模块对应的单元测试（Node 内置 test runner）
```

## 安装

```bash
npm i https://github.com/imsasa/ifn.git
```

## 引入方式

每个模块都提供**两种等价写法**：

```javascript
// 1. 函数式：不污染原型，推荐在公共代码中使用
import {before, filter, times} from 'iaop/src/ifn.js';
const wrapped = before(fn, b4fn);

// 2. 原型式：import 模块即挂载 Function.prototype，之后可直接链式调用
import 'iaop/src/ifn.js';
const wrapped = fn.before(b4fn).after(afn);
```

> `ifn.js`、`co.js` 在首次 import 时会向 `Function.prototype` 挂载方法，这是本库的既有设计。
> `intercept.js` / `filter.js` 与 `ifn.js` 挂载了**同名**原型方法，同时引入会互相覆盖 —— 请统一只使用 `ifn.js`。
> `index.js` 目前未导出 `ifn.js` 与 `chain.js`，这两个模块请按路径直接引入。

---

## 一、ifn.js —— 函数切面

`ifn.js` 面向**单个函数**做装饰：在不改动原函数的前提下，往它的前后插入逻辑。

| API | 说明 | 包装后的返回值 |
| --- | --- | --- |
| `before(fn, b4fn, ctx)` | 前置通知：b4fn 与 fn 收到相同参数 | fn 的返回值 |
| `unshift(fn, b4fn, ctx)` | 前置加工：b4fn 的返回值替换 fn 的入参 | fn 的返回值 |
| `after(fn, afn, ctx)` | 后置通知：afn 收到的是 fn 的原始入参 | fn 的返回值 |
| `pipe(fn, afn, ctx)` | 管道：fn 的返回值流入 afn | afn 的返回值 |
| `around(fn, b4fn, afn, ctx)` | 前后包裹，b4fn/afn 都收到 fn 的原始入参 | fn 的返回值 |
| `wrapper(fn, b4fn, afn, ctx)` | b4fn 加工入参 + afn 加工结果 | afn 的返回值 |
| `filter(fn, filterFn, ctx)` | 条件拦截：filterFn 返回 `false` 时不执行 fn | fn 的返回值或 `undefined` |
| `times(fn, cnt, interval)` | 定时重复执行 cnt 次 | `Promise`（跑满 `false` / 中断 `true`） |

`ctx` 可选，用于指定执行时的 `this`，不传则沿用调用时的 `this`。除 `pipe` 外，其余 API 均自动识别 Promise：前置/后置函数返回 Promise 时会等待其 resolve 后再继续。

### before —— 前置通知

```javascript
import {before} from 'iaop/src/ifn.js';

const add = (a, b) => a + b;
const fn  = before(add, (a, b) => console.log('计算', a, b));
fn(1, 2);                  // 打印"计算 1 2"，返回 3

// 异步前置：权限校验通过后才执行
const guarded = add.before(async () => await checkAuth());
await guarded(1, 2);
```

### unshift —— 前置加工（替换入参）

```javascript
const save = unshift(saveData, (form) => ({...form, ts: Date.now()}));
save({name: 'rap'});       // saveData 收到 {name:'rap', ts: ...}

const double = ((v) => v * 2).unshift((a, b) => a + b);
double(1, 2);              // b4fn 返回 3 -> 返回 6
```

### after —— 后置通知（埋点 / 关闭 loading）

```javascript
const fn = after(add, (a, b) => report('add', a, b));
fn(1, 2);                  // 上报，返回值仍是 3

const fetchList2 = fetchList.after(() => hideLoading());
await fetchList2(params);  // 异步 fn 同样成立
```

> 注意：`after` 的 afn 收到的是 **fn 的入参**，不是 fn 的返回值；想拿返回值请用 `pipe` 或 `wrapper`。

### pipe —— 管道（结果拆包 / 数据转换）

```javascript
const fn = pipe(add, (v) => v * 2);
fn(1, 2);                  // (1+2)*2 = 6

// 异步：pipe 不感知 Promise，afn 收到的是 Promise，需自行 then
const query = request.pipe((rsp) => rsp.then((res) => res.data));
```

### around —— 前后包裹（事务 / 耗时统计）

```javascript
const fn = around(save, () => beginTx(), () => commitTx());
fn(data);                  // beginTx -> save -> commitTx，返回 save 的结果

let start;
const cost = addAsync.around(() => (start = Date.now()), () => console.log(Date.now() - start));
```

### wrapper —— 入参与结果都加工

```javascript
const query = wrapper(
    async (params) => request(params),  // 收到 b4fn 的返回值
    (page, size) => ({page, size}),     // 加工入参
    (rsp) => rsp.list,                  // 加工结果
);
await query(1, 20);        // 返回 rsp.list

const fn = ((v) => v * 2).wrapper((a, b) => a + b, (v) => `结果 ${v}`);
fn(1, 2);                  // '结果 6'
```

### filter —— 条件拦截

```javascript
const remove = filter(delById, (id) => id > 0);
remove(1);                 // 执行删除
remove(-1);                // 被拦截，返回 undefined

const guarded = filter(delById, async (id) => await hasPermission(id));
await guarded(1);          // 也支持异步判定
```

> 判定函数返回**严格等于 `false`** 时才阻断。请使用函数式写法 `filter(fn, filterFn)`：
> `Function.prototype.filter` 存在同名参数遮蔽，调用会报错。

### times —— 定时重复执行

```javascript
const poll = times(() => refresh(), 5, 1000);
await poll();              // 跑满 5 次后 resolve(false)

let retry = 0;
const polling = times(() => { if (++retry === 2) polling.stop(); }, 5, 100);
await polling();           // 被 stop() 中断，resolve(true)
```

### 组合使用

原型方法返回新函数，可继续链式叠加：

```javascript
const enhanced = add
    .before((a, b) => log(`即将计算 ${a}+${b}`))
    .around(() => log('开启事务'), () => log('提交事务'))
    .after(() => log('计算完成'));
```

---

## 二、chain.js —— 职责链

`Chain` 把**多个节点**串成一条可短路、可回流的管道（洋葱模型），适合权限校验、请求中间件这类场景。

```javascript
import {Chain} from 'iaop/src/chain.js';

const checkLogin = new Chain(next => async (arg) => {
    arg.log.push('checkLogin');
    if (!arg.user) return (arg.err = '未登录');   // 不调用 next -> 短路
    await next(arg);
    arg.log.push('checkLogin-out');               // 后继全部执行完才回到这里
});
const checkPerm = new Chain(next => async (arg) => {
    arg.log.push('checkPerm');
    if (!arg.user.admin) return (arg.err = '无权限');
    await next(arg);
});
const handler = new Chain(next => (arg) => {
    arg.log.push('handler');
    arg.result = '处理完成';
});

checkLogin.successor = checkPerm;
checkPerm.successor  = handler;

const arg = {user: {admin: true}, log: []};
await checkLogin.run(arg);
// arg.log → ['checkLogin', 'checkPerm', 'handler', 'checkLogin-out']
```

约定：

- 节点写成 `next => (...args) => {...}`（柯里化，推荐），也可写成 `(...args, next) => {...}`；
- **不调用 `next` 即短路**，后继节点全部不执行；
- 节点可以是 `async`，`await next(arg)` 之后的代码在后继全部执行完才执行；
- 参数个数不定，沿链原样传递；`next()` 不传参即沿用上游参数；
- `successor` 可挂另一个 `Chain` 实例、普通函数，传 `null` 解除挂载；传其他类型抛 `TypeError`；
- `run()` 恒返回 Promise，resolve 出**首节点**的返回值；想拿到链条结果请 `return next(...)` 或直接 `return 结果值`。

---

## 三、co.js —— 并发控制队列

`co` 把对某个函数的**多次调用**排队调度，控制消费速度。每次调用返回 Promise，resolve 出 fn 的结果。

```javascript
import {co} from 'iaop/src/co.js';

const coer = co((row) => duiZhang(row), 8, 800);
await Promise.all(rows.map((row) => coer(row)));

// 中断剩余任务
rows.forEach((row) => coer(row));
await coer.stop();         // 清空队列并停止调度

// 原型写法
const coer2 = save.co(4, 500);
```

签名：`co(func, concurrency = 1, wt = 10)`，`concurrency` 为消费循环条数，`wt` 为取任务的间隔毫秒。

> 【现有行为】消费循环每 `wt` 毫秒起一个任务，并不等上一个结束，因此**并发峰值可能高于 `concurrency`**。
> `stop()` 内部用 `setInterval` 等待收尾且未清理，Node 环境下会挂住事件循环，示例中需显式 `process.exit(0)`。

---

## 四、throttle.js —— 节流与防抖

```javascript
import {throttle, debounce} from 'iaop/src/throttle.js';

// 节流：默认 immediate=true，首次立即执行，窗口末尾再补一次（用最后一次的参数）
const search = throttle((kw) => request(kw), 200);

// 防连点：只保留窗口内首次，不做尾部补偿
const submit = throttle((order) => post(order), {delay: 300, leave: true});

// 标准防抖：停止调用满 delay 后才执行（需显式 immediate: false）
const update = debounce(handler, {delay: 80, immediate: false});
```

`opt` 可传数字（等价于 `{delay}`），也可传对象：

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `delay` | `1000` | 窗口长度；传 `0` 会被回退成 `1000` |
| `immediate` | `true` | 是否在窗口开始时立即执行 |
| `leave` | `false` | `true` 表示丢弃窗口内被拦下的调用，不补尾部执行 |

返回值恒为 Promise，可 `await` 拿到 fn 的结果；`retFn.clear()` 取消挂起的执行，并以字符串 `"$rej$"` reject 当前 promise。

### 注意事项（当前实现的已知行为）

1. `delay: 0` 会被 `opt.delay || 1000` 回退成 1000，不要用它表示「立即」。
2. `immediate` 默认 `true`，所以 `debounce` 的首次调用也会立即执行；想要标准防抖请显式传 `immediate: false`。
3. 窗口内的并发调用共享同一个 promise，拿到的是首次执行的结果，无法区分各自返回值。
4. `throttle` 尾部执行时：参数取最后一次调用，但 `this` 取安排定时器的那次调用，两者可能不配对。
5. `throttle` + `{immediate: false, leave: true}` 是死组合：首部被关、尾部被拦，fn 永不执行且 promise 永不 settle。
6. `clear()` 会 reject 挂起的 promise，调用处记得 `catch`，否则产生 unhandled rejection。
7. 尾部执行中 fn 抛出的异常发生在 `setTimeout` 回调里，不会进入 promise，需自行 try/catch。

---

## 运行示例与测试

项目已声明 `"type": "module"`，可直接用 node 执行：

```bash
node src/aop.example.js
node src/chain.example.js
node src/co.example.js
node src/throttle.example.js

node --test src/            # 87 个用例，基于 Node 内置 test runner，零依赖
```

> `package.json` 中的 `test:mocha` / `test:nyc` 仍指向已不存在的 `./tests/index.js`，暂未更新。

## API 文档

```bash
npm run gendoc    # jsdoc，配置见 jsdoc.conf.json
```
