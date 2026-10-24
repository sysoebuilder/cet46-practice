# Android APK 安装验证（2026-10-24）

本次没有调用 HBuilderX 云打包或其他收费构建服务。

## 已确认的故障

先直接安装用户已付费生成的 `H59A7E9D7__20261024202711.apk`，在 Android 11 模拟器运行原包、连接其实际 WebView。原生接口返回：

```json
{
  "api": "plus.io.resolveLocalFileSystemURL",
  "url": "file:///android_asset/apps/H59A7E9D7/www/static/papers/CET4-2025-12-1.json",
  "error": { "code": 14, "message": "path does not exist" }
}
```

原包的 119 套 JSON 均存在，并与源数据一致；页面仍显示“试卷读取失败”。由此确认旧读取链路不能解析该 APK assets 地址，之前用 Node 模拟文件读取的测试未覆盖这一问题。

## 修复与安装验证

- App 构建将每套 JSON 分别序列化为普通脚本，WebView 按需从自身资源目录加载；119 套内容逐项对比不变。浏览器继续使用 JSON/fetch。
- 原生安装测试又暴露 Chromium 83 不支持 `inset`、`dvh`：已提供物理定位、`vh` 回退，并设置 Vite `build.cssTarget: 'chrome83'`，防止 CSS 压缩器重新合并为 `inset`。包检查直接检查最终生成文件。
- 本地复用原付费 APK 的原生代码、编译后的 Android manifest、图标及音频，只更新页面资源，经过 zipalign 和 Android debug 签名后安装到专用模拟器。
- 最终验证包入口为 `./assets/index-DhmZnI4O.js`；自动检查拒绝与当前 `app/index.html` 不一致的旧包。

验证环境：Android 11 / WebView 83.0.4103.106，390×844，ARM64 原生库通过系统 native bridge 运行；Wi-Fi、移动数据均关闭。没有模拟 `plus.storage`、文件系统或音频。UI 操作用 Android input service 注入真实触摸/键盘。

已通过：

1. 冷启动、plus 初始化、启动动画后释放界面。
2. 119 套试卷从 APK assets 加载，完整内容与源 JSON 一致。
3. 73 份被题库引用的独立音频均能在 Android WebView 读取有效时长。
4. 选卷及六类题型入口；选词填空、长篇阅读、仔细阅读触摸作答并原生保存。
5. 作文、翻译输入并原生保存。
6. 核对答案与面板关闭；禁用 fetch 和旧原生文件解析接口时答题仍可用。
7. 本地听力播放、切组、实际 Android HOME 切后台后暂停。
8. 25 题答题卡大字号无容器溢出，Android BACK 关闭面板。
9. WebView 重载恢复答案；结束整个 App 进程后重新打开，通过首页继续入口恢复答案。
10. 运行期间未捕获未处理的 JavaScript 异常。

## 免费重复验证

```sh
npm run build:app
npm run check:app
# 启动已安装本地验证包的专用模拟器，再执行：
npm run check:android
# 用 adb 结束该验证 App 并重新启动后：
npm run check:android -- --cold-resume
```

`check:android` 连接实际 Android WebView，不使用桌面模拟 plus。默认 APK 模式仅接受 `emulator-*`，并校验 AVD 名包含 `cet46_apk_validation`；完整回归只重置专用模拟器中一套样卷的六个练习记录。冷启动恢复阶段不清理记录。显式 `--connected-base` 模式仅允许独立的 `io.dcloud.HBuilder`，会备份、恢复基座 CET 数据，不连接手机正式 App。

配套检查结果：22 项逻辑测试、80 项手机/平板生产页面回归通过；最终 CSS 构建另通过 7 项启动与答题卡复查。

证据保存在 `E:\四六级真题\work\android\`：

- `paid-apk-root-cause.json`、`paid-apk-paper-error.png`：原收费包的故障证据。
- `installed-apk-report.json`、`cold-resume-report.json`：最终安装回归、结束进程后恢复报告。
- `apk-audio-metadata.json`：逐份音频时长。
- `apk-checked-sheet.png`、`apk-answer-card-large-font.png`、`apk-cold-resume.png`：Android WebView 实际截图。
- `cet46-local-validation.apk`：本地测试签名的验证包，**不是原签名正式升级包**；不要卸载用户正式 App 来安装它。

## 用户手机验收

已连接用户 vivo V2243A，Android 16 / WebView 155.0.8059.43，实际屏幕 1080×2400。用户安装的正式包未开放 WebView 调试；没有改动或卸载该正式包。通过手机已有的 `io.dcloud.HBuilder` 标准基座运行同一份 `index-DhmZnI4O.js`，不是网页远程访问。

真机基座已验证 119 套资源逐项一致、73 份独立音频时长、六类题型输入/选择与原生进度保存、播放/暂停/切组、核对面板、大字号 25 题答题卡、Android BACK 和重载恢复。触摸由 Android input service 注入；作文、翻译通过 WebView 输入协议验证原生输入事件与保存。测试前备份基座的 CET 记录，结束后逐键恢复并比较一致；正式 App 的答题记录未操作。

真机报告和截图在 `work/android/vivo/`：`physical-phone-base-report.json`、`storage-restore-report.json`、`apk-cloze-filled.png`、`apk-answer-card-large-font.png`。前述 APK 安装报告来自 Android 11 模拟器，真机报告来自 Android 16 标准基座，两者分开记录，不把基座运行当成该手机正式 APK 验收。

正式发布仍需沿用原签名、包名和 AppID。用户手机当前正式安装包仍是旧代码，基座测试不会自动升级它；下一份正式 APK 应从已验证的 `app/` 构建生成。无需为了排查前端问题反复调用收费云构建。
