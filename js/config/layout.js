"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LAYOUT = void 0;
exports.anchorToPixel = anchorToPixel;
/**
 * 横屏布局与排版常量（§2.6 / §2.8 / §7.5）。
 * 逻辑分辨率 1280×720；真实屏幕由 platform/screen.ts 按「竖向铺满 + 横向等比拉伸
 * （clamp 1.3）」映射，常见手机比例下 padX = padY = 0，逻辑坐标即屏幕坐标。
 *
 * 下面带「底板烘焙件」注释的常量是照 art-src/ui-board-empty-16x9-01 实测出来的，
 * 动态层必须贴着这些坐标画，否则会和底板上烘死的卡槽/齿轮/木牌错位。
 */
exports.LAYOUT = {
    SCREEN_W: 1280,
    SCREEN_H: 720,
    /** 左/右侧栏宽度 */
    SIDE_W: 210,
    /** 底部替补席高度 */
    BENCH_H: 104,
    /** 中央棋盘区（不含侧栏与底部） */
    BOARD: { x: 210, y: 0, w: 860, h: 616 },
    /** 棋盘逻辑网格 12×8，我方 6×4 左下、敌方 6×4 右上（§4.1） */
    GRID: { cols: 12, rows: 8, originX: 232, originY: 44, cellW: 68, cellH: 68, farSquash: 0.12 },
    /** 左侧栏控件（底板烘焙件：齿轮中心 (44,51) 直径 60） */
    GEAR: { x: 14, y: 21, size: 60 },
    /**
     * 左侧栏 6 格候选条（底板烘焙件，量测后重排）。
     *
     * 用户口径（2026-10-14）：底板那版纸槽**显示宽度太大**，侧栏改成
     * 「只用圆形的动物头像框」——血条就是绕圆框的一圈绿弧（满血整圈，弧长按血量）。
     * 所以这里的 w 不再是纸槽宽，而是**头像圆框 + 右侧 HP 数字**的实际宽度。
     *
     * 竖向：h 50 + gap 7 → pitch 57，从 y 106 排到 y 441。
     * 下界 441 是硬约束：底板把「戴草帽的大男孩」烘死在逻辑 y 459.6 起（x 6..122），
     * 排到 441 才留出 18px 空档，血环**绝不压到小男孩**。
     */
    MY_ENTRY: { x: 12, y: 106, w: 168, h: 50, gap: 7 },
    MY_COACH: { x: 0, y: 445, avatar: 140, house: { w: 76, h: 80 } },
    /** 右侧栏控件（底板烘焙件：标题卷轴 x 1090..1270 y 10..85） */
    SCROLL: { x: 1232, y: 88, size: 36 },
    /**
     * 右侧栏 6 格候选条（底板烘焙件，量测后重排）。
     *
     * 同左栏：只用圆形头像框。x 从 1094 起（圆框圆心 1122、半径 24 → 圆占 1098..1146，
     * 右侧留 HP 数字的位置），**左边界必须 ≥1046**：底板把小恶魔烘死在
     * 逻辑 x 902..1040 / y 20..200，纸槽左移到 1005 时圆框/纸面就压住小恶魔了。
     *
     * 竖向：h 50 + gap 7 → pitch 57，从 y 132（卷轴按钮底 124 之下）排到 y 467。
     */
    ENEMY_ENTRY: { x: 1094, y: 132, w: 176, h: 50, gap: 7 },
    SUN_COIN: { x: 1204, y: 528, size: 56 },
    ENEMY_IMP: { x: 902, y: 20, w: 138, h: 180 },
    /** 底部替补席：8 格 84×84，间距 0 —— 对齐底板烘焙的 8 个苔藓垫
     *（垫中心 x = 350.4 + i*83.63，格子中心 x = 346 + i*84，误差 ≤5px） */
    BENCH: { slots: 8, cell: 84, gap: 0, y: 720 - 104 + 8 },
    /** 战斗阶段替补席收窄 */
    BENCH_NARROW_H: 46,
    /**
     * 替补席动物渲染尺寸与落脚线（**两阶段共用同一份常量**，唯一尺寸来源）。
     *
     * 硬规则：布阵阶段与战斗阶段画的是同一只、同一尺寸、同一位置的动物。
     * 历史问题：这里曾有两套常量（布阵 88 / 战斗 38），一点「准备就绪」动物就整体缩一档，
     * 观感像换了个人。现在尺寸只有 BENCH_ART.size 一份，
     * `drawBench` 无论 narrow 与否都取它，底座草垫 BENCH_ART.mound 按同一比例联动。
     *
     * `seatY` 是动物的「脚底线」：底板（art-src/ui-board-empty-16x9-01）把 8 个苔藓垫
     * 烘死在 y 660..707，动物脚底落在 670（略进苔藓）才读得出「站在草垫上」。
     * 两个阶段都用这一条线，所以阶段切换时动物既不缩放也不位移。
     */
    BENCH_ART: {
        /**
         * 动物**可见内容**的目标绘制边长（正方形，贴图与程序化回退共用）。
         *
         * 注意这量的是「不透明像素的包围盒」，不是贴图画布：
         * assets/pets/*.png 是 256×256，四周有透明留白（尤其左右），
         * 若直接把画布压进 size×size，可见部分会明显小于 size，
         * 且各物种留白不同 → 同一常量下 wolf 只有 50px 宽、elephant 有 83px，
         * 视觉体积差 1.65 倍，还会显得比底座草垫（78 宽）小一圈。
         * 因此绘制时按 SPECIES_ART_BOX 归一化：先按包围盒裁切语义缩放，
         * 让**可见内容**填满 size，而不是让画布填满。
         */
        size: 88,
        /** 动物脚底相对草垫基线的抬起量（草垫顶到动物脚底） */
        lift: 6,
        /** 草垫（草堆）中心线的 y —— 底板烘焙的苔藓垫所在高度 */
        seatY: 670,
        /** 底座草垫（草堆）尺寸：宽 78 / 高 26，按 size 等比 */
        mound: { w: 78, h: 26 },
        /** 拖拽悬停时亮苔提示的尺寸 */
        hover: { w: 78, h: 26 },
    },
    /**
     * 每只宠物贴图（assets/pets/<species>.png，256×256）的不透明包围盒，
     * 由 work/measure_alpha.py 对 alpha>8 实测烘焙（不含 scipy 依赖）。
     * 字段：[left, top, width, height]。
     *
     * 用途：drawImage 前按此把「可见内容」而不是画布映射到目标矩形，
     * 消除物种间留白差异导致的视觉大小不一。
     */
    SPECIES_ART_BOX: {
        cat: [29, 9, 197, 241],
        dog: [18, 9, 220, 241],
        elephant: [7, 12, 241, 236],
        leopard: [7, 14, 241, 232],
        lion: [38, 9, 180, 241],
        mouse: [26, 9, 204, 241],
        tiger: [21, 9, 213, 241],
        wolf: [55, 9, 146, 241],
    },
    /** 新战斗底板（art-src/ui-board-empty-16x9-01）烘焙件的量测坐标 */
    PLATE: {
        /**
         * 侧栏血环半径（两栏共用）。
         *
         * 原为 46.5（配 h=93 的大格）。6 格均分后格高 h=56，环直径必须 ≤ h 才不越格：
         * 取 24 → 直径 48，上下各留 4px 呼吸，血环、HP 数字、等级角标都还在格内。
         * 该值同时是 `small` 紧凑排版的判据（见 render/sidebar.ts 的 `r < 34`），
         * 因此 6 格统一走紧凑排版：环左、HP 数字在环右侧，风格仍是「环 + 数值」。
         */
        ringR: 24,
        playerRingCx: 61,
        enemyRingCx: 1122,
        /** 狗屋木牌（底板烘死了「HP 24/30」，已补掉，动态数值画在同一位置） */
        houseHp: { x: 136, y: 670, w: 114, h: 40 }
    },
    /** 卡牌（§7.5） */
    CARD: { w: 168, h: 232, radius: 16, artRatio: 0.48, overflow: 12 },
    /** 血量环（§2.8） */
    RING: { gap: 8, width: 5, trackWidth: 2.5, ghostAlpha: 0.5, notchW: 1, sidebarRadius: 24, sidebarWidth: 3 },
    /** 牧场 → 渲染：远端透视压缩（仅渲染，逻辑层无透视） */
    PERSPECTIVE: 0.12,
    /** 列表与按钮 */
    ENTRY: { w: 190, h: 64, radius: 18 },
    PANEL_RADIUS: 24,
    BUTTON_RADIUS: 26,
    STROKE: 3,
    SHADOW: { dy: 4, alpha: 0.18 },
    /** 字号（§2.4） */
    FONT: { h1: 40, h2: 28, body: 24, entry: 20, badge: 18, coin: 32, cardName: 28 },
    /** 字体族（中文优先系统圆体） */
    FONT_FAMILY: '"PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", sans-serif',
    /** 视差系数（§2.5） */
    PARALLAX: { far: 0.10, mid: 0.35, near: 1.00 },
    /** 叶隙光斑数量与透明度区间 */
    SUNSPECKS: { count: 10, alphaMin: 0.06, alphaMax: 0.12, cycleMin: 6000, cycleMax: 10000 }
};
/** 逻辑点位 → 渲染像素（含 12% 远端透视压缩）。 */
function anchorToPixel(col, row) {
    var g = exports.LAYOUT.GRID;
    var anchorX = g.originX + (col + 0.5) * g.cellW;
    var depthRow = (g.rows - 1 - row) / (g.rows - 1); // 0 = 最下方（近），1 = 最上方（远）
    var squash = 1 - exports.LAYOUT.PERSPECTIVE * depthRow;
    var anchorY = g.originY + (row + 0.5) * g.cellH * squash + (1 - squash) * 40;
    return { x: anchorX, y: anchorY };
}
