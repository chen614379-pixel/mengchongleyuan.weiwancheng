# 在微信开发者工具里跑起来

## 结论先说

游戏代码本身在「没有 DOM 的小游戏运行时」里能正常启动：`node .dev/minigame-smoke.js 12 <项目目录>`
用 stub `wx` + 无 `document/window` 的环境 `require('js/main.js')`，跑 12 帧，
输出 `[petbrawl] boot start → first frame`，**fatal none / console errors 0**。

所以工具里跑不起来通常是**工程目录环境**问题（本仓库同时装着 `src/ work/ art-src/ tools/
docs/ node_modules/ .git/` 等开发期目录，开发者工具的编译与文件监听会把整个工程扫一遍）。

## 推荐做法：用「干净工程」导入

```powershell
node tools/export-dev.js          # 生成 ..\.petbrawl-dev
```

生成的 `D:\Users\CGQ\Documents\deepseek-harness\default-workspace\.petbrawl-dev` 里只有：

```
game.js  game.json  project.config.json  project.private.config.json
js/**    assets/**
```

（101 个文件 / 3,920,923 B，上限 4,194,304 B，余 273 KB；资源表里引用的 7 个图片路径全部存在。）

在开发者工具里：**小游戏 → 导入项目 → 目录选 `.petbrawl-dev` → AppID 填 `wx34404a5c6155f80f`**。

## 常见坑

- **别把仓库根目录当小游戏工程导入**时，先确认 `packOptions.ignore` 生效；更稳的是用上面的干净导出版。
- 真机预览/上传需要：登录 + 代码上传密钥 + 本机 IP 在白名单（公众平台 → 开发管理 → 开发设置 → 小程序代码上传）。
- 工具的服务端口默认关闭；要用 `cli.bat`（自动化/命令行预览）需要先在 **设置 → 安全设置 → 服务端口** 打开。