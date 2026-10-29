# 在微信开发者工具里跑起来

## 结论先说

**直接把仓库根目录当小游戏工程导入**，不要再复制出「干净工程」副本。

导入路径就是本仓库：

```
D:\Users\CGQ\Documents\deepseek-harness\default-workspace\petbrawl
```

AppID 填 `wx34404a5c6155f80f`（已在 `project.config.json` 里写好）。

## 只有一条链路：改 .ts → 编译 → 刷新

```
src/*.ts  --tsc-->  js/*.js  --开发者工具编译-->  运行
```

微信小游戏的运行时**不吃 TypeScript**，入口 `game.js` 里写的是 `import './js/main';`，
所以 `tsc` 这一步不能省。它是唯一的机械步骤：

```powershell
npm run build          # 或直接：node_modules\.bin\tsc.cmd -p tsconfig.json
```

改完代码 → 跑一次 `npm run build` → 在开发者工具里点 **编译**（`Ctrl+B`）。

想省掉手动编译，把 watch 挂成常驻任务，改一次 `.ts` 自动出 `.js`：

```powershell
npm run watch
```

## 为什么不再需要「干净工程」副本

早期做过 `tools/export-dev.js`，把 `game.js / game.json / js / assets / project*.json`
复制到仓库外的 `.petbrawl-dev`，理由是"本仓库目录太杂，开发者工具扫描时会编译不过"。

这个顾虑已经被 `project.config.json` 的 `packOptions.ignore` 解决 —— 它已经排除：

```
src/  work/  tools/  art-src/  docs/  node_modules/
.weixin-minigame-helper/  .dev/
.git/  .gitignore  .gitattributes
tsconfig.json  package.json  README.md  project.private.config.json  .eslintrc.js  pnpm-lock.yaml
```

所以根目录导入不会把开发期目录打进包、也不会干扰编译。

**那个副本已经被删除**，因为它带来过一个真实的坑：它是**仓库外的死副本**，
既不在 `tsc` 的输出路径上、也不被 git 跟踪，改完源码忘了同步，
开发者工具就一直跑旧版本，表现为"改了代码但看不到效果"。

## 历史遗留目录

`work/dev-export/` 是当年用 `export-dev.js` 导出的旧副本，已经没有任何作用。
它被 `.gitignore` 排除，可以安全删除；如果删除时报 `EPERM`，
说明开发者工具还开着它 —— 先在工具里**关闭该项目**，再删，然后把根目录重新导入。

## 常见坑

- 真机预览/上传需要：登录 + 代码上传密钥 + 本机 IP 在白名单（公众平台 → 开发管理 → 开发设置 → 小程序代码上传）。
- 工具的服务端口默认关闭；要用 `cli.bat`（自动化/命令行预览）需要先在 **设置 → 安全设置 → 服务端口** 打开。
- `js/` 是**被 git 跟踪的**（50 个文件），所以编译产物可回滚、可 review，
  改坏了直接 `git checkout -- js/` 或整体 `git revert` 即可，不需要靠副本保底。