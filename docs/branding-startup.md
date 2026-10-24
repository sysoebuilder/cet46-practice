# 图标与启动加载

使用 `参考/玻璃质感翡翠字母A图标.png` 原图，原文件保持不变。`scripts/generate-brand-assets.mjs` 确定主图形的方形边界，只去掉外围透明留白并保留安全边距；导出 21 种 PNG 尺寸、透明页面标识及 Android 启动图。桌面图标使用不透明浅色底，包含 iOS App Store 所需的 1024×1024 图。

页面标识采用约 27 KB 的透明 WebP，预加载并在首页与加载页共享缓存；原生图标继续使用 PNG。图标缩放与淡出由 Motion 渲染，CSS 负责静态排版。

`npm run assets:brand` 可单独重建。`dev:h5`、`build:h5`、`dev:app`、`build:app` 自动先导出；相同内容不重复写入，避免 Windows 文件占用和无意义的监听重建。正式资源在 `src/static/brand`，构建复制到 `app/static/brand`；`app/manifest.json` 配置 Android 与 iPhone/iPad 图标、Android 原生启动图，根 manifest 同步为带 app 前缀的路径。

## 启动衔接

1. `src/boot/shell.html` 与 `boot.css` 在文档中直接输出，主脚本尚未加载也有正确背景、图标、名称及状态。
2. 5+ 等待 plusready 后加载本地 IIFE。Vue 的 `StartupScreen.vue` 在两帧后接管，关闭原生启动图；同一图片、背景、中心位置保持画面连续。
3. Motion 为图标提供 0.96→1 的轻微物理回弹，细短状态轨道使用 transform 循环，页面准备好后淡出。最快只保留约 340ms 的安定过程和 220ms 淡出，不伪造百分比，不添加数秒的品牌广告等待。
4. 加载层显示时背景 inert，淡出完成恢复输入与焦点操作；减少动态效果时取消位移和循环，仅保留约 80ms 的淡化。Motion 自动清理循环，卸载清理计时器。
5. 主脚本失败、运行异常或 12 秒未完成时显示错误及重新加载按钮，同时关闭原生启动图，避免持续白屏。

`src/components/LoadingState.vue` 为读取试卷和题型提供轻量骨架，使用同一套 Motion 透明度反馈，减少动态效果时静止；读取错误继续走原来的错误与重试逻辑。题库、API、作答格式不变。

首页、网页 favicon、添加到主屏幕图标与启动页统一使用品牌资源。桌面图标属于 APK/IPA 原生资源，必须重新打包并安装后才更新；HBuilderX 的标准调试基座通常仍显示基座自己的桌面图标。覆盖安装沿用原 AppID、包名与签名，不要为了刷新图标清除学习数据。

## 检查

- `npm run build:h5`、`npm run build:app`。
- `npm run check:app`：文件存在、Android 尺寸、App Store 图无 alpha，以及真正 file:// 中的 plusready、启动屏衔接、作答、原生存储、音频和返回。
- `tests/e2e/startup.spec.mjs`：预脚本画面、Motion 实际中间帧、退出动画、恢复交互、减少动态效果、脚本加载失败后的重试、慢速题库骨架。
- 原有 Motion、答题卡及答案检查回归保留；直接输入前等待加载层退场，避免自动化向 inert 的不可交互区域输入。

2026-10-24 验证：H5/5+ 构建、21 项逻辑测试、32 项手机/平板启动及交互回归、5+ file:// 包检查通过。最终 WebP 资源再次通过 8 项启动检查。Lighthouse 手机模拟结果：性能 99、可访问性 100、LCP 1.9s、TBT 50ms、CLS 0；属于本地实验室检测，未将其等同真机帧率。报告在工作区 `work/app-previews/lighthouse-branding-mobile.json`。

文档依据：[Motion for Vue](https://motion.dev/docs/vue)、[DCloud 完整 manifest](https://uniapp.dcloud.net.cn/tutorial/app-manifest)、[关闭原生启动屏](https://www.html5plus.org/doc/zh_cn/navigator.html#plus.navigator.closeSplashscreen)。
