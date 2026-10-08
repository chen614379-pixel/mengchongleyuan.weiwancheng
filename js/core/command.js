"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandQueue = void 0;
/** 指令队列：每个逻辑帧开头统一 drain，保证确定性顺序。 */
var CommandQueue = /** @class */ (function () {
    function CommandQueue() {
        this.items = [];
        /** 指令流水（结算页高光回放用） */
        this.history = [];
    }
    CommandQueue.prototype.push = function (command, at, by) {
        if (by === void 0) { by = 'player'; }
        this.items.push({ command: command, queuedAt: at, by: by });
    };
    /** 按入队顺序取出本帧全部指令。 */
    CommandQueue.prototype.drain = function () {
        if (this.items.length === 0)
            return [];
        var out = this.items;
        this.items = [];
        for (var i = 0; i < out.length; i++)
            this.history.push(out[i]);
        return out;
    };
    Object.defineProperty(CommandQueue.prototype, "pending", {
        get: function () {
            return this.items.length;
        },
        enumerable: false,
        configurable: true
    });
    /** 清空未处理指令（切阶段时调用）。 */
    CommandQueue.prototype.clear = function () {
        this.items = [];
    };
    return CommandQueue;
}());
exports.CommandQueue = CommandQueue;
