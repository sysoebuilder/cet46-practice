# HBuilderX 5+ App

项目使用标准 Vue 3 + Vite + Vue Router，Motion 在 5+ 的启动 WebView 中直接运行。没有 uni-app 编译器、原生页面、JS service、二层 WebView 或远程网页地址。

## 目录与命令

- `src/`：Vue 组件、页面、统一 Motion 配置、答题逻辑与内置题库。
- `web/index.html`：Vite 的开发与构建入口。
- `app/manifest.json`：保留的 5+ 配置源文件，直接在 HBuilderX 编辑。使用 `id`、`version`、`launch_path`、`plus`，Android 配置在 `plus.distribute.google`，iOS 在 `plus.distribute.apple`。构建将根目录 manifest 同步为便捷启动配置。
- `app/`：`npm run build:app` 生成的完整、独立 5+ 项目，**导入此目录到 HBuilderX**。包括 HTML、IIFE 脚本、启动脚本、manifest 和 `static/` 离线题库/音频。不包含 node_modules、Vue 源码和旧的 uni-app 资源。
- `scripts/native-bootstrap.js`：等待 plusready、加载随包普通脚本、关闭启动屏、失败重试、状态栏、Android 返回/退出、pause/resume。
- `src/utils/native-runtime.js`：5+ 存储与本地文件；浏览器使用 localStorage/fetch。
- `src/utils/audio-context.mjs`：HTMLAudioElement 适配现有播放器，保留播放进度与错误处理。
- `src/router.js`：Hash 路由，保留旧 `/pages/practice/index?paper=...&section=...` 地址；首页 KeepAlive、恢复返回位置，题型切换重新挂载答题页。

```sh
npm install
npm run build:app
npm run check:app
# 开发中自动重建 app/，供 HBuilderX 同步
npm run dev:app
# 浏览器开发与生产预览
npm run dev:h5
npm run build:h5
npm run preview:h5
```

`app/` 通过标记文件防止误覆盖同名的手写目录。题库/音频增量复制，避免每次重建重复复制约 1 GB 音频。修改 manifest、启动脚本、Vue 或题库会触发 watch 构建；manifest 源文件保留在 Git，其余生成内容忽略。

## HBuilderX 操作

1. 停止旧项目的 uni-app 基座运行，导入 `E:\CET46_practice\app`。
2. 右键“重新识别项目类型”，确认是 5+ App；选择“运行到手机或模拟器”。不依赖电脑 IP、局域网或 Vite 服务。
3. 首次打开 `app/manifest.json`，用自己的 DCloud 账号获取 AppID。项目没有代填其他人的 ID 或签名。后续构建保留此配置文件，不覆盖 AppID、图标和平台配置；根 manifest 自动同步。签名证书使用打包窗口或本地配置，不提交密码与私钥。
4. 发行使用 HBuilderX 的原生 App 打包入口，配置自己的证书。修改 Vue 后需重新构建；HBuilderX 的 5+ 运行不会编译 Vue SFC。

根开发目录也能识别为 5+，`launch_path` 指向 `app/index.html`，但包含开发依赖和历史构建。为了只同步和发布运行资源，请使用生成的独立 `app/` 项目。

旧 `dist/build/app`、`dist/dev/app`、`src/hybrid/html/cet` 不再更新，不再导入。没有删除这些历史生成目录，以免干扰仍打开的旧调试会话。

## 数据与交互兼容

题库、答案结构、题号、选项顺序和资源地址的数据定义不变。使用既有 `cet:progress:v1:`、`cet:audio:v1:`、`cet:font`、`cet:level` 键，读写旧的类型包装。原生运行用 plus.storage，浏览器用 localStorage，读取失败不覆盖进度。

升级已安装应用时沿用原 DCloud AppID、包名和签名，才能继续访问原应用沙箱；换 AppID、卸载或清空数据无法自动保留旧沙箱中的进度。

App 启动等待 plusready 再读取原生进度，避免先用浏览器存储启动造成分叉。构建时将每套 JSON 原样序列化为独立的普通脚本，App 按需加载入口目录下的 `static/papers/<id>.js`，不依赖 `fetch(file://)` 或 `plus.io.FileReader` 对 APK 内 assets 的路径解析。脚本加载后验证试卷身份、移除节点；并发读取合并，失败和超时后可重试。浏览器仍使用原 JSON/fetch，题目结构不变。音频继续使用入口目录下的本地文件 URL；根项目和独立 app 项目都可定位。所有资源离线随包，没有 CDN 或服务器依赖。

返回键先关闭当前弹层，再返回列表；列表页第一次返回显示退出提示，1.8 秒内第二次返回退出。进入后台暂停音频并保存，不自动恢复播放。原有按钮弹性、共享布局转场、菜单、Bottom Sheet、切题动画及减少动态效果继续使用 Motion。

## 验证边界

`npm test` 验证题库、答案、进度、音频状态机、存储兼容及试卷脚本并发/失败/身份校验。Playwright 检查手机/平板的交互、排版、Motion 中间帧与播放。`check:app` 逐套执行并对比 119 个生成脚本与源 JSON；从真实 file:// 加载生成包，禁用原生 FileReader 和 fetch，测试首次试卷加载失败后重试、延迟 plusready、关闭启动屏、原生存储、重载、音频、pause/resume、返回和双击退出；这些检查不代表 Android 设备验收。

## APK 安装后试卷读取失败

2026-10-24 已在 Android 11 模拟器直接安装 `H59A7E9D7__20261024202711.apk`，复现并取得原生错误 `code: 14, path does not exist`：旧文件接口无法解析 `file:///android_asset/...`。119 套 JSON 均存在且逐套与源数据一致，排除漏打包或内容损坏。修复后本地复用原生壳更新页面资源、签名安装，离线验证 119 套试卷、六类题型、原生保存、音频、面板和结束进程后恢复均通过。另已通过用户 vivo V2243A（Android 16）标准基座真机验收，并恢复基座原有记录；手机正式包未修改。本次未调用收费云构建。详细证据、免费重复验证方法和测试范围见 [Android APK 安装验证](android-apk-validation.md)。

更新后执行 `npm run build:app`、`npm run check:app`，在 HBuilderX 选择 `E:\CET46_practice\app` 重新云打包，再安装新 APK。已有 APK 不会随着源码构建自动更新；沿用 AppID、包名和签名覆盖安装以保留答题进度。

2026-10-24 迁移验收：H5/5+ 构建通过；21 项逻辑测试、72 项生产页面手机/平板回归通过；Vite 开发服务与自动构建验证通过；5+ 包检查及 file:// 启动交互检查通过。HBuilderX CLI 已导入并识别 `app(App)`。ADB 未发现 Android 设备，未执行实机安装或签名打包。

依据：[HBuilderX 项目类型](https://ask.dcloud.net.cn/article/id-35878__page-2)、[5+ manifest](https://ask.dcloud.net.cn/article/id-94__page-2)、[5+ 按键](https://www.html5plus.org/doc/zh_cn/key.html)、[5+ Navigator](https://www.html5plus.org/doc/zh_cn/navigator.html)、[Vue Router 组合式 API](https://router.vuejs.org/guide/advanced/composition-api.html)。
