# UI 与动效维护

本项目使用 Vue 3 / Vite / Vue Router，在 HBuilderX 5+ WebView 中直接渲染。题库 JSON、解析器、答题存储格式和评分方法保持原样。使用 `motion-v 2.8.0`，图标使用 `@lucide/vue`；VueUse 12 与现有 Vue 3.4 兼容。

## 动效入口

- `src/motion/presets.js`：按钮、布局、底部面板三套物理弹簧，以及短距离内容切换和交错间隔。物理弹簧分别采用 stiffness / damping / mass 调节，避免在页面里独立调参。
- `MotionButton.vue`：原生按钮上的 Motion `whilePress`。保留 disabled、ARIA、键盘和 click 行为。
- `MotionSheet.vue`：`AnimatePresence` 保留退出期间的内容；面板使用 Spring，遮罩独立淡入淡出。`useDragControls` 只从把手或标题启动拖动，内容区保留原生滚动。释放超过 110px，或向下超过 20px 且速度超过 650px/s 时关闭；其余回弹。
- `PaperTransition.vue`、`navigation.js`：文档级 Vue 动画宿主在同一 `LayoutGroup` 中保留卡片、标题和元信息的 `layoutId`。动画层覆盖 Vue Router 的路由交接，KeepAlive 保留首页状态，返回时缩回原试卷位置。导航有重入保护，异常也会移除覆盖层。
- 首页分段控件、年份筛选：共享 `layoutId` 滑块。列表按筛选键使用 `AnimatePresence mode="wait"`。
- 答题页：词库按空格的视口位置在上方或下方展开，限制宽高，内容可滚动。填词保留退出动画。阅读文章、题目和听力题组按方向进出；听力播放器位于题组的 keyed 动画之外，切题不会重建播放器。

## 可用性与性能

`MotionConfig reducedMotion="user"` 禁用布局与位移动画；按压、进度条、底部面板还根据 `useReducedMotion` 单独降级。保留短淡化。动画主要使用 transform / opacity，没有全局 will-change。

弹层传送到 body，使用固定 body 保存长文章的滚动位置。菜单尺寸使用 offsetWidth / offsetHeight，避免测量入场缩放导致定位偏移。关闭或卸载时恢复 body、滚动、焦点和背景 inert；Escape 与 Tab 焦点循环可用。弹层滚动不会重复触发菜单定位。

阅读字号通过 `readingSize` 显式传入传送后的弹层，确保题目和解析继承用户选择的字号。

Motion 输出标准 HTML button，统一使用原生按钮重置。错误、未答、缺失答案仍明确区分；写作及翻译只提供参考对照。

存储在 5+ 使用 plus.storage，在网页使用 localStorage；音频使用 HTMLAudioElement 适配器。播放器参数、存储键及数据格式保持一致。核对汇总不把缺失答案计入可核对题数，主观题不显示客观得分。

## 验证

```sh
npm test
npm run build:h5
npm run preview:h5
npx playwright test
```

`tests/e2e/motion.spec.mjs` 检查实际变换中间帧、快速切换、共享页面转场、贴边菜单、长文滚动恢复、面板拖动/速度释放/触屏滚动、播放器连续性和减少动态效果。既有功能测试继续覆盖原题选项、解析、重做、持久化、音频和保存失败。

Playwright 使用 Chrome 的 390×844 手机及 1180×820 平板尺寸。它不能替代真实 iPhone Safari 和低端设备的性能验收，未对真实设备作出 60fps 保证。

生产包测试可设置 `CET_BASE_URL=http://127.0.0.1:5175` 后执行 Playwright；这时不启动开发服务器。静态服务器必须支持 HTTP Range，确保长音频可以定位和恢复。请使用 `preview:h5` 或具备同等能力的正式静态服务器。

2026-10-24 5+ 迁移后：H5/5+ 构建通过；21 项逻辑测试、72 项生产包手机/平板回归通过。320/360/390px 答题卡及大字模式均通过边界检查。迁移前静态预览的 Lighthouse 历史结果为性能 98、可访问性 100，LCP 2.1s、TBT 30ms、CLS 0；此次未重新运行 Lighthouse，不将此分数当作迁移后或真机性能结果。

API 依据：[Motion for Vue](https://motion.dev/docs/vue)、[Layout](https://motion.dev/docs/vue-layout-animations)、[AnimatePresence](https://motion.dev/docs/vue-animate-presence)、[Drag controls](https://motion.dev/docs/vue-use-drag-controls)。
