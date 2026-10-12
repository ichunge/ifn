/**
 * chain —— 职责链（Chain of Responsibility / 中间件链）
 *
 * 与 aop.js 的分工：aop.js 是对「单个函数」做切面装饰（before / after / around ...），
 * Chain 是把「多个节点」串成一条可短路、可回流的管道（洋葱模型），两者是不同的模式。
 *
 * @example
 *   import {Chain} from "@asset/ifn/chain.js";
 *   const node = new Chain(next => async (arg) => {
 *       if (!arg.user) return (arg.err = '未登录');   // 不调用 next -> 短路
 *       await next(arg);
 *   });
 *
 * 完整可运行示例见同目录下的 chain.example.js：
 *     node views/@asset/ifn/chain.example.js
 */

/**
 * 职责链（Chain of Responsibility / 中间件链）
 *
 * 每个节点是一个高阶函数：next => (...args) => {...}，参数个数不定，沿链原样传递
 *   - args ：沿链传递的参数，各节点可原地加工，也可把加工后的新参数交给 next
 *   - next ：把参数交给后继节点，返回 Promise；不调用 next 即短路，链条到此终止
 * 节点可以是 async 函数，await next(arg) 之后的代码会在后继节点全部执行完才执行（洋葱模型）。
 *
 * @example 权限校验链：任一节点不调用 next 即短路
 *   const checkLogin = new Chain(next => async (arg) => {
 *       arg.log.push('checkLogin');
 *       if (!arg.user) return (arg.err = '未登录');   // 不调用 next，链条终止
 *       await next(arg);
 *       arg.log.push('checkLogin-out');               // 后继全部执行完才回到这里
 *   });
 *   const checkPerm = new Chain(next => async (arg) => {
 *       arg.log.push('checkPerm');
 *       if (!arg.user.admin) return (arg.err = '无权限');
 *       await next(arg);
 *   });
 *   const handler = new Chain(next => (arg) => {
 *       arg.log.push('handler');
 *       arg.result = '处理完成';
 *   });
 *   checkLogin.successor = checkPerm;
 *   checkPerm.successor  = handler;
 *
 *   const arg = {user: {admin: true}, log: []};
 *   await checkLogin.run(arg);
 *   // arg.log → ['checkLogin', 'checkPerm', 'handler', 'checkLogin-out']
 *   // arg.result → '处理完成'
 *
 * @example 短路：去掉 user，链条在第一个节点就终止
 *   await checkLogin.run({log: []});   // arg.err → '未登录'，handler 不会执行
 *
 * @example 不定参数：多参数一起沿链传递
 *   const c1 = new Chain(next => (a, b) => next(a + 1, b + 1));
 *   c1.successor = (a, b) => a * b;
 *   await c1.run(2, 3);   // (2+1) * (3+1) = 12
 */
export class Chain {
    /**
     * @param fn {function} 节点处理函数，两种等价写法（参数个数均不定）：
     *                      next => (...args) => {...}（柯里化，推荐）
     *                      (...args, next) => {...}
     */
    constructor(fn) {
        this.fn    = typeof fn === "function" ? fn : (next) => (arg) => next(arg);
        this._next = null;
    }

    /** 后继节点：另一个 Chain 实例，或 (...args) => ... 函数；传 null 解除挂载 */
    get successor() {
        return this._next;
    }

    set successor(node) {
        if (node != null && !(node instanceof Chain) && typeof node !== "function") {
            throw new TypeError("Chain#successor 只接受 Chain 实例、函数或 null");
        }
        this._next = node || null;
    }

    /**
     * 执行当前节点，并把 next 注入给它；参数个数不定，原样沿链传递
     * @param args {...*} 沿链传递的参数，个数与 run(...args) 保持一致
     * @return {*} 节点未显式返回值时返回 undefined
     */
    dispatch(...args) {
        const next = (...vals) => {
            const data = vals.length ? vals : args;   // next() 不传参即沿用上游参数
            if (!this._next) return Promise.resolve(data.length > 1 ? data : data[0]);   // 尾节点：next 是空的直通函数
            return this._next instanceof Chain ? this._next.run(...data) : this._next(...data);
        };
        // 柯里化写法 next => (...args) => {}，或非柯里化写法 (...args, next) => {}
        return this.fn.length > 1 ? this.fn(...args, next) : this.fn(next)(...args);
    }

    /**
     * 从当前节点启动链条，参数个数不定
     * @param args {...*} 沿链传递的参数，各节点可加工后再交给 next
     * @return {Promise<*>} 恒为 Promise，resolve 出首节点的返回值；
     * 首节点没有显式返回值（即没有 return / 没有 return next(...)）时 resolve 出 undefined。
     * 因此想拿到链条结果，节点应当 `return next(...)` 或直接 `return` 结果值；
     * 若采用原地加工 args 的写法，调用方自行持有传入的 args 即可。
     */
    async run(...args) {
        return await this.dispatch(...args);
    }
}
