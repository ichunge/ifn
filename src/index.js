/**
 * index —— 统一出口
 *
 * import 顺序有意为之：intercept.js / filter.js 是历史模块，与 aop.js 挂载了同名的
 * Function.prototype 方法（before / unshift / after / pipe / around / wrapper / filter），
 * 因此历史模块先引入、aop.js 放最后，保证最终生效的是 aop.js 的实现。
 */
import * as _intercept from './intercept.js';
import _filter         from "./filter.js";
import {co as _co}     from './co.js';
import * as _throttle  from "./throttle.js";
import * as _aop       from './aop.js';
import {Chain}         from './chain.js';

export const aop       = _aop;
export const chain     = {Chain};
export {Chain};
export const co        = _co;
export const filter    = _filter;
export const intercept = _intercept;
export const throttle  = _throttle;

export default {aop, chain, Chain, co, filter, intercept, throttle};
