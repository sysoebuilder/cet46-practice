# Android 基座启动

项目已迁移为直接渲染 Vue/Motion 的 HBuilderX **5+ App**。原有 uni-app 原生壳和 JS service 已移除。

执行 `npm run build:app`，然后将 `E:\CET46_practice\app` 导入 HBuilderX，识别为 5+ App，运行到 Android 手机/模拟器。不要继续导入旧 `dist/build/app` 或 `dist/dev/app`。

启动脚本等待 plusready，再加载随包 IIFE 脚本，渲染成功或失败后关闭启动屏；失败会显示原因和重试按钮。运行不依赖电脑地址或网页服务。

详细目录、配置、数据兼容、构建与验证说明见 [5+ App 开发说明](5plus-app.md)。
