# Foxlet 离线翻译交付记录（2026-10-27）

已修改实际应用 `E:\CET46_practice`。使用用户下载的 DCloud **5.26.82680_20260914**，已实际构建含完整业务资源、Foxlet v0.5.0、模型及 Native.js 封装的 5+ Android 测试 APK，配置了用户提供的离线 AppKey。独立原生包已由用户确认可离线翻译；完整业务包已通过 Android 模拟器的真实桥接与阅读交互回归。**模拟器为 x86，不支持 Foxlet 推理；完整业务包在 ARM64 真机上的离线推理、选区手柄拖动与重启仍需验收。**

## 工程与打包核查

- 根目录及 `app/manifest.json` 为标准 5+ 配置，AppID 为 `H59A7E9D7`，包名 `com.hexun.cet46practice`。HBuilderX 导入目录为 `app/`。
- 现有源码本来使用 Vue 3/Vite/Motion，构建为普通 HTML/CSS/IIFE，在 5+ 启动 WebView 中运行；这不是 uni-app。翻译新增代码为独立 JS/CSS/Kotlin，没有新增 Vue、uni-app、UTS、`uni.*`、React 或 Remotion。
- 普通 manifest 的 minSdk 仍为 23，未擅自更改。Foxlet 专用 Android 构建为 minSdk 28、compileSdk 36、Java/Kotlin JVM 17、仅 arm64-v8a。
- 本机有 HBuilderX 5.26、Android SDK 35/36、JDK 17。新增可构建的独立 Android 宿主 `native/foxlet/host-app`，使用下载的官方 App SDK 5.26，已完成 APK 编译、签名检查、安装及运行。测试包名 `com.hexun.cet46practice.foxlettest`，不会覆盖原应用，原答题数据不迁移。正式签名发布尚未配置。
- [DCloud 插件文档](https://nativesupport.dcloud.net.cn/NativePlugin/)说明传统 5+ 插件扩展机制的支持限制。这里使用 Native.js 调用宿主中真实打包的普通 Java 类，不注册旧 Feature，不使用 uni 插件。**Native.js 本身不负责把类/依赖放入 APK。**
- [当前离线 SDK 下载页](https://nativesupport.dcloud.net.cn/AppDocs/download/android.html)提供的 5.26 已在本次具体宿主中实测能启动普通 5+ HTML 页面、运行现有业务和调用自有 Java 类。此结论来自实际运行，不代表厂商恢复旧插件机制的维护承诺。

### SDK 候选选择修正（2026-10-27）

先前建议寻找 3.1.x、再选择 3.7.11，不能视为已经验证过的兼容结论。3.7.11 同样在官方所述旧插件机制停止支持的版本范围之后，没有证据证明它比当前正式版更适合本次普通 Java 类 + Native.js 方案。

最终采用与本机 HBuilderX 5.26 对应的 **Android App 离线 SDK 5.26 正式完整版**。官方简介的支持边界不能直接推出普通 Java + Native.js 路径必然不兼容；该路径已通过本次真实运行验证。

SDK 本地路径为 `E:\四六级真题\work\foxlet\sdk-research\5.26\extracted\Android-SDK@5.26.82680_20260914`。`dcloud-sdk.lock.json` 保存原始 ZIP 和实际使用的五个 AAR 的本地 SHA-256；这些是本地完整性记录，不冒充厂商签名校验和。构建脚本校验 AAR，保留 SDK 许可及第三方声明。没有修改或反编译 SDK 二进制。

宿主显式依赖 `lib.5plus.base-release.aar`、`uniapp-v8-release.aar` 及 SDK 示例要求的基础依赖；后者是供应商运行库文件名，前端仍为普通 `index.html`，不生成 uni-app service/page，不使用 `uni.*`。当前实测中，传入 `plus.android.importClass()` 返回的代理作为静态 invoke 目标会得到空值；已改为 `plus.android.invoke('完整Java类名', 'getInstance', ...)`。剪贴板静态调用也已同步修复。

## 文件清单

修改：

- `src/main.js`：导入一次翻译入口，不修改阅读模板或题目。
- `package.json`：增加 `prepare:foxlet`、`check:foxlet`。
- 运行 `build:app` 更新 `app/index.html`、IIFE、CSS 等生成文件；`app/manifest.json` 内容保持原样。

新增：

- `src/translation/translator.mjs`：Promise 接口、初始化合并、精确文本缓存、原生回调、错误/超时/销毁。
- `src/translation/text-selection.mjs`：识词、Range 坐标、选句快捷操作。
- `src/translation/reading-translation.js`：委托事件、原生选区、浮层、复制、请求竞态、返回键。
- `src/translation/translation.css`、`bootstrap.js`：样式、动效、一次安装。
- `native/foxlet/{settings.gradle.kts,build.gradle.kts,gradle.properties,gradlew,gradlew.bat,gradle/wrapper/*,.gitignore}`：可独立执行的 Gradle 工程与校验过的 Wrapper。
- `native/foxlet/foxlet.lock.json`：SDK/模型来源、版本、大小、SHA-256。
- `native/foxlet/bridge/build.gradle.kts`、`consumer-rules.pro`、`src/main/AndroidManifest.xml`。
- `native/foxlet/bridge/src/main/java/com/hexun/cet/foxlet/{FoxletBridge.kt,FoxletCallback.kt,BundledModels.kt}`。
- `native/foxlet/bridge/src/test/java/com/hexun/cet/foxlet/BundledModelsTest.kt`。
- `native/foxlet/bridge/src/androidTest/java/com/hexun/cet/foxlet/BundledModelsDeviceTest.kt`：使用真实 Android AssetManager/私有存储验证复制、复用、损坏及中断恢复。
- `native/foxlet/smoke/build.gradle.kts`、`src/main/AndroidManifest.xml`、`src/main/java/com/hexun/cet/foxlet/smoke/SmokeActivity.kt`。
- `native/foxlet/host-integration.gradle`：真实 5+ Android 宿主应用模块接入配置。
- `native/foxlet/dcloud-sdk.lock.json`：5.26 SDK 本地完整性记录。
- `native/foxlet/host-app/build.gradle.kts`、`src/main/AndroidManifest.xml`、`src/main/java/com/hexun/cet/host/{CetApplication.java,NativeProbe.java}`：实际可编译的宿主及调试入口。
- `native/foxlet/host-app/src/probe/index.html`：普通 5+ HTML 与异步回调探针。
- `scripts/{prepare-5plus-host.py,build-5plus-host.ps1,build-5plus-probe.mjs,check-5plus-host.mjs}`：宿主资源暂存、构建与真实 Android WebView 检查。
- `native/foxlet/licenses/{NOTICE.txt,SOURCE.txt,THIRD_PARTY_NOTICES.txt,SHA256SUMS,MODEL-MPL-2.0.txt,MODEL-SOURCE.txt}`。
- `scripts/{prepare-foxlet.py,build-foxlet.ps1,attach-foxlet-host.py,check-foxlet-apk.py,check-foxlet-device.py}`。
- `tests/translator.test.mjs`、`tests/e2e/translation.spec.mjs`。
- 本文。

已准备的本地资源与产物（模型、AAR 和 build 目录不提交 Git，可用固定脚本重建）：

- `native/foxlet/libs/foxlet-v0.5.0.aar`：官方 SDK，2,809,936 字节。
- `native/foxlet/models/`：四个模型文件，合计 **51,934,991 字节**。
- `native/foxlet/bridge/build/outputs/aar/bridge-release.aar`：桥接类、模型 assets、许可证。它不内嵌 SDK/协程的二进制，宿主必须显式依赖它们。
- `native/foxlet/smoke/build/outputs/apk/debug/smoke-debug.apk`：单独包名 `com.hexun.cet.foxlet.smoke`，开发签名，无 INTERNET 权限，**不是现有 5+ App**。
- `native/foxlet/host-app/build/outputs/apk/probe/debug/host-app-probe-debug.apk`：约 67 MB，Native.js 探针与真实 Foxlet，不含试卷音频。
- `native/foxlet/host-app/build/outputs/apk/full/debug/host-app-full-debug.apk`：约 **1.12 GB**，全部业务页面、119 套试卷、73 份音频及模型；音频约 1.04 GB 是主要体积来源。已排除 HBuilderX `unpackage` 缓存和嵌套 APK。

## 官方资源、哈希与许可

SDK 固定为 [官方 v0.5.0 Release](https://github.com/yinvoke/foxlet-translate/releases/tag/v0.5.0)，SHA-256：

```text
5dbb384907d69c2aba129fd15dba30dda94ede0fa556dc6a167d041ee479ec0e
```

与下载的官方 `SHA256SUMS` 一致。AAR 的 `SOURCE.txt` 记录构建 commit `0eff2a15032362115848a496ce1df8ed9fc68650`。以发行 AAR 公开签名、内置目录和实际 Kotlin metadata 为准，未混用 0.3.x API。此 AAR 的 Kotlin metadata 为 2.4.0，桥接实际使用 Kotlin 2.4.10 编译；协程依照官方文档显式使用 1.10.2。

模型为发行 AAR 自带 Mozilla 目录固定的 en → zh-Hans 2.2，文件下载地址及可信哈希直接取自已校验 AAR，不以下载后自算值作为独立信任来源：

| 文件 | 字节 | SHA-256 |
| --- | ---: | --- |
| lex.50.50.enzh.s2t.bin | 6506248 | `4a5e5827788060f1d718a8132b69440929387514a045796e9b77f935db68c055` |
| model.enzh.intgemm.alphas.bin | 43849787 | `4e5accc141373565ddc8fa1565bceaa8d0c3482a82cab8131c719ebcc6c2157c` |
| srcvocab.enzh.spm | 806952 | `bd9b65504acc6d9726dd281f7defc2adb7c2c22d0688fe2f84697de25197c8c5` |
| trgvocab.enzh.spm | 772004 | `aded6993c36e440284d11cec3f6b8aef9c0e43188a772d80be342a713adf223d` |

SDK 原创代码 MIT，Bergamot 等第三方组件各自许可，完整声明随 AAR 保留并复制进 assets；模型单独 MPL-2.0，原文和 Mozilla 来源说明也随包保存。没有修改权重或 SDK。准备脚本中的联网仅发生在开发机器构建阶段。

## 原生初始化与调用

APK assets 结构：

```text
assets/foxlet/foxlet.lock.json
assets/foxlet/en-zh-Hans-2.2/<四个模型文件>
assets/foxlet/licenses/<许可和来源>
```

第一次 `translator.init()`/`translate()`：

1. `plus.android.invoke('com.hexun.cet.foxlet.FoxletBridge', 'getInstance', ...)` 获取应用进程单例；传入 Activity 只用于获取 applicationContext，不保留 Activity。
2. 桥接检查 Android 9+、64 位进程和原生 ARM64 主 ABI；拒绝 x86 ARM 转译环境。
3. IO 协程校验 `context.noBackupFilesDir/cet-foxlet/en-zh-Hans-2.2`。完整目录直接复用；缺失/损坏时从随包 assets 复制到 staging、fsync、逐文件 SHA-256 校验，再同文件系统 rename 发布。不会把半份模型当作可用目录。
4. 使用 **`Foxlet.create`、`ExternalModel(LanguagePair("en", "zh-Hans"), ModelFiles.fromDirectory(...).copy(expectedSha256=...))`**。没有 `prepare/download/checkUpdates` 调用，不走远程模型或翻译接口。
5. 后台真实预热后才返回 ready。客户端进程级复用，推理由 Mutex 串行调度，单线程推理，空闲五分钟卸载权重；低内存回调等待推理后卸载。不会每次新建客户端。
6. `FoxletCallback` 是普通 Java 接口，通过 `plus.android.implements` 对接；原生通过主 Looper 回调，不直接从 JS 调用 Kotlin suspend。
7. `destroy()` 等待已提交任务并 `shutdown()`。单页面关闭只关闭 UI，不释放其他页面共享的客户端；进程结束由系统回收。最多 8 个待处理原生操作，释放操作不受队列限额阻挡。

损坏/缺失、存储不足、低内存、不兼容设备、翻译失败分别返回错误码；JS 不产生替代译文。缓存仅存内存，不落盘阅读内容，不记录原文日志。

## JavaScript 接口

```javascript
import translator from './translation/translator.mjs'

await translator.init()                 // 可省略，translate 也会初始化
const result = await translator.translate('Hello world') // String
translator.isReady()                   // Boolean
translator.getStatus()                 // JS 状态、缓存/并发数、原生状态快照
await translator.destroy()             // 全部使用者结束后调用，可再次 init
```

页面现有普通业务代码也可使用 `window.translator`。同词精确文本 LRU 缓存最多 256 条、同输入并发合并；保留大小写差异，避免将 `US` 与 `us` 合为一词。输入为 1–4000 字符，超时 180 秒。初始化复制仍在后台，UI 保持可交互。

## 阅读交互与设计

- 委托 `.material-panel .reading-text` 的事件，用 caret/Range 定位英文单词，支持大小写、撇号、缩写和连字符；跳过填空按钮、选项、输入框及中文原文，不给文章逐词插 span。
- 点按立即展示原文/准备状态，得到译文后轻量切换；请求序号确保迟到结果不覆盖最新选择；相同词命中内存缓存。
- 长按 420ms 后抑制单词推理；没有 `preventDefault` 系统长按，也没有禁用文本选择。通过 `selectionchange` 读取真实 Range；可以调整选区、跨同一文章段落选择，点击“翻译选文”。
- “选择整句”扩展真实系统选区；旧 WebView 使用保守英文句界规则，用户可以继续调整，复杂缩写不保证语义分句完全正确。
- 支持译文复制、关闭、重新选择、重试；Android 使用 ClipboardManager，浏览器使用剪贴板。
- 沿用原来的 `--surface/--ink/--muted/--green-dark`、系统字体、文章衬线字体、24px 圆角及绿色系细腻阴影。未重设计首页/阅读布局。
- 卡片以 9px 上移、.975→1 缩放、透明度和柔和减速进入，180ms 下沉淡出；文字轻微过渡，单词有不改排版的临时高亮；仅 transform/opacity 动画。没有添加动画库。
- 以当前 Range、visualViewport、窗口边界定位，上下选择可用空间；滚动关闭点词卡、选区卡随选区重定位；考虑键盘 viewport、状态栏并限制卡片滚动高度。极大选区几乎占满可见窗口时使用紧凑卡，**此场景的遮挡及系统选区工具条位置仍需真机确认**。
- `prefers-reduced-motion` 关闭位移/缩放/旋转，保留可读状态；返回键先关闭翻译卡，离开阅读路由/后台时关闭。

## 本地构建与 HBuilderX 后续操作

本次已经运行模型准备、前端构建与原生编译。重复执行：

```powershell
Set-Location E:\CET46_practice
npm run prepare:foxlet
npm run check:foxlet
npm run build:app
npm run check:app
npm test
npx playwright test
powershell -ExecutionPolicy Bypass -File scripts\build-foxlet.ps1
```

需要代理时，显式传 `-Proxy http://127.0.0.1:7897`（改为本机真实代理）；脚本临时配置并恢复变量。可传 `-JavaHome`、`-AndroidHome`。Gradle Wrapper 固定 8.14.3 及其官方 SHA-256，AGP 8.12.0，无需 NDK/CMake。

HBuilderX 中仍然导入 `E:\CET46_practice\app`、按 5+ 项目预览。**点击普通云打包或标准基座运行不会加入 Foxlet。**现在已有可构建的宿主，无需再次下载旧 SDK，也无需在 HBuilderX 中迁移项目。

在 `native/foxlet/local.properties` 配置 `cet.dcloudAppKey=`（用户提供的值已配置，该文件被 Git 忽略）。AppKey 绑定测试 AppID `H59A7E9D7`、包名 `com.hexun.cet46practice.foxlettest` 和本机 debug 证书，不能直接用于不同正式签名。构建完整包：

```powershell
Set-Location E:\CET46_practice
npm run build:app
powershell -ExecutionPolicy Bypass -File scripts\build-5plus-host.ps1 -SdkDirectory 'E:\四六级真题\work\foxlet\sdk-research\5.26\extracted\Android-SDK@5.26.82680_20260914' -Content Full -Proxy http://127.0.0.1:7897
```

`-Content Probe` 构建轻量探针，`Both` 构建两者。两种包使用同一测试包名，Full 版本号 12、Probe 11；完整包可正常覆盖探针，反向安装应使用独立测试环境处理降级，不卸载原业务应用。安装最终 Full APK 后关闭网络，在阅读页点词及长按选句即可验收；此测试 APK 没有 INTERNET 权限，模型无需下载。系统选择手柄仍由 Android WebView 提供。

开发签名 SHA1：`E7:18:93:A9:F4:F1:A7:68:F0:C8:8D:D8:6B:F6:22:2B:D9:02:89:82`；SHA256：`B2:18:20:DA:E6:DD:49:EF:F9:76:47:50:9A:2F:A5:50:E7:40:ED:36:C6:99:EF:AD:A2:62:A2:D4:1E:41:72:EC`。

连接调试设备并打开测试 App 后，可运行真实桥接/阅读检查（不会安装或清除应用数据）：

```powershell
node scripts/check-5plus-host.mjs --full --serial <adb设备序列号> --output E:/四六级真题/work/foxlet/phone-host
```

ARM64 上必须得到真实中文结果才计推理成功；x86 上只验证 `UNSUPPORTED_DEVICE` 回调与 UI，不计推理。完整包验证后如需覆盖正式应用，须另行使用原包名、正式证书及对应 AppKey 构建并测试升级，当前测试包不会覆盖正式应用。

对已验证可工作的 Java 5+ 宿主，配置现有 `assets/data/dcloud_control.xml` 的 AppID，然后执行：

```powershell
python E:\CET46_practice\scripts\attach-foxlet-host.py --host D:\your-working-5plus-host --module app
Set-Location D:\your-working-5plus-host
.\gradlew.bat -PcetFoxletDir=E:/CET46_practice/native/foxlet -PcetWebDir=E:/CET46_practice/app :app:assembleDebug
python E:\CET46_practice\scripts\check-foxlet-apk.py app\build\outputs\apk\debug\app-debug.apk
```

脚本备份后接入 Gradle、设置 extractNativeLibs；已有宿主 SDK/权限/AppKey/签名配置保留。Gradle 将桥接 AAR、官方 AAR、Kotlin stdlib、协程和模型真正进入 APK；暂存原生 assets 并替换 CET www，避免旧新资源重复，原宿主源 assets 不删除。脚本只支持常见 Groovy application 模块；Kotlin DSL 的宿主可手动追加：

```kotlin
apply(from = file("${property("cetFoxletDir")}/host-integration.gradle"))
```

以上通用接入脚本供另一个现有宿主使用，本次直接使用新建 `host-app`，不需要运行通用接入脚本。新宿主已构建并实测；未配置冲突库的盲目 pickFirst。ARM64 实际推理及 C++ 运行库共同运行仍需在完整业务 APK 真机确认。

正式发布沿用原 AppID、包名和正式签名；AppKey 绑定需与宿主实际证书匹配。正式签名在本机/Android Studio 配置，不提交私钥。HBuilderX 普通云包不能替代此原生宿主构建。

## 验证证据与边界

证据目录：`E:\四六级真题\work\foxlet`。

- 已下载官方 AAR，逐文件校验全部模型；构建前再次校验 SDK/模型，不接受损坏资源。
- 已成功执行 `:bridge:testDebugUnitTest :bridge:assembleRelease :smoke:assembleDebug`，不是仅生成配置。
- 最终 APK 已检查模型内容/哈希、DEX 中桥接/Foxlet/CoroutineScope、仅 ARM64 库、许可证、minSdk28；无 INTERNET 权限。报告 `smoke-apk-report.json`。
- Node 逻辑测试新增 6 项，加现有 22 项共 28 项通过。覆盖并发初始化、缓存、错误/重试、销毁等待、超时、识词和句界。
- 新增手机/平板交互测试 8 项通过。使用明确的原生传输测试替身来控制回包顺序；**这些测试不构成 Foxlet 推理成功证据**。DOM Selection/复制测试也不能替代 Android 手柄拖动。
- 全量 Playwright 首轮 87/88 通过；一项原有平板填空菜单 Escape 后焦点恢复检查失败，随后手机/平板针对该项及全部翻译交互重跑，10/10 通过。另已补查浮层边界、不遮挡点选单词、完全展开后的实际截图。未以重写原有答题逻辑掩盖首轮失败。
- 5+ 包检查、真实 file:// 页面测试通过；检查119套试卷、音频、保存、生命周期等。
- 独立验证 APK 实际安装到 `cet46_apk_validation30`，Android 11 x86_64 模拟器。首次测试在关闭 Wi-Fi/数据、APK 无网络权限情况下成功复制模型，私有模型主文件 SHA-256 与官方一致。
- 随后的真实预热推理失败：`libndk_translation` 报 `intrinsics_impl_x86_64.cc:86: CHECK failed: 524288 == 0` 并 SIGABRT。日志 `smoke-native-crash.log`。没有用假结果掩盖失败。
- 已据此修复设备门槛。最终验证包在同一模拟器返回 `UNSUPPORTED_DEVICE`，进程存活，报告 `unsupported-device/device-report.json`。
- 模型安装 Android instrumentation 测试实际通过（`model-install-instrumentation.txt`，1项）：直接读取随包 assets，首次完整安装，新建 installer 实例后时间戳不变，损坏文件及残留 staging 同时恢复并重验四个 SHA-256。该测试不运行推理，未把它算作进程重启后翻译验收。
- **用户真机反馈（2026-10-27）：「独立验证通过，可以离线翻译」。**这确认独立验证 APK 的 SDK、随包模型和本地推理链路已在用户手机上实际可用。该项来源为用户手动测试反馈，不冒充自动化测试日志，也不据此推定重启、低内存或业务页面已通过。
- 本次补充自动化复核时 ADB 连接已断开，脚本在获取设备 ABI 前退出，没有更改设备应用或数据；尚未取得对应的自动化真机报告。
- 5.26 轻量宿主实际安装启动，`probe-native-report.json`：普通 HTML 与 plusready、同步 echo、异步接口、工作线程非主线程/回调主线程、真实 Foxlet 类、JS Promise 错误回调、Android 剪贴板读写全部通过。
- 完整业务 APK 实际安装启动，`sdk-research/full-native-report.json`：Android 原生 tap 点词、850ms 长按产生真实系统选区、“选择整句”扩展至 71 字符、选文翻译调用、返回键仅关闭翻译、原生剪贴板均通过。截图 `full-reading-native.png`。x86 设备不进行推理，报告明确 `inferencePassed:false`；不是假译文测试。
- 无 INTERNET 权限的最终业务包已重新安装，页面启动和上述桥接/阅读检查再次通过。测试脚本修正了启动屏退出后 CDP WebView 原生坐标会变化的问题；每次 Android 触控前刷新屏幕偏移，避免使用过期坐标。
- 新宿主已运行 `check-installed-android.mjs`，输出在 `sdk-research/full-regression/`：119 套试卷逐字段一致、73 份音频元数据、六种题型与真实触控保存、听力播放及 HOME 后暂停、25 题答题卡/返回键、WebView 重载恢复答案均通过。
- 最终业务 APK 检查通过，SHA256 `29bb351bc574c99b5806d77c726ad1452148bd893c0531f40e273857f8493454`，大小 1,121,160,722 字节；开发证书 SHA1/SHA256 与注册身份一致。最终清单显式移除 DCloud AAR 合入的 INTERNET 权限，资源检查脚本会拒绝带此权限的本测试宿主包。供应商仍声明可选的存储/媒体和角标权限，本应用不为翻译申请它们。资源校验报告的 `deviceTested:false` 仅表示校验脚本自身不做设备测试；设备测试另见上述报告。
- **未完成：完整业务包 ARM64 真机离线首启/推理/重启/低内存、系统选区手柄拖动、正式签名覆盖升级。**独立包的用户成功反馈不替代这些验收。本轮尝试对专用测试包 force-stop 后重启的命令被自动审批策略拦截，未执行；已有重载恢复测试不冒充进程冷启动测试。

拿到原生 ARM64 设备后可执行单独原生验收（不覆盖业务 App）：

```powershell
python scripts\check-foxlet-device.py --serial YOUR_ARM64_DEVICE --output E:\四六级真题\work\foxlet\arm64
```

该脚本安装单独验证包，检查真实初始化/中文推理、重复调用初始化次数、force-stop 后模型复用。业务 5+ APK 仍需另测单词、长按选句、快速点选、断网重启、保存/音频/答题回归；不能把独立验证包当作业务整包验收。

重复运行模型安装专项（测试包只操作自身随机私有缓存目录）：

```powershell
Set-Location E:\CET46_practice\native\foxlet
.\gradlew.bat :bridge:assembleDebugAndroidTest
adb -s emulator-5580 install -r bridge\build\outputs\apk\androidTest\debug\bridge-debug-androidTest.apk
adb -s emulator-5580 shell am instrument -w com.hexun.cet.foxlet.test/androidx.test.runner.AndroidJUnitRunner
```
