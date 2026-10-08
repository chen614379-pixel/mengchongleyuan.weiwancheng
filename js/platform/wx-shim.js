"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HAS_WX = exports.WX = void 0;
exports.WX = typeof wx !== 'undefined' ? wx : null;
/** 宿主是否为微信小游戏（无头/自检环境下为 false）。 */
exports.HAS_WX = typeof wx !== 'undefined' && !!wx && typeof wx.createCanvas === 'function';
