# 🚀 极简录屏工具 - 画中画 (PIP) 功能实现方案

## 一、 核心产品理念与 UX 规范

基于“极简且强大”的设计思想，画中画功能将兼顾“录制前的自由定制”与“录制中的极高稳定性”：

1. **所见即所得 (预设自由)**：录制开始前，系统提供一个独立的摄像头悬浮小窗。用户可自由拖拽位置、缩放大小、切换形态（如圆形/方形），调整至最佳出镜状态。
2. **录制即锁定 (极简求稳)**：点击开始录制后，画中画在最终视频中的相对位置与形态将被瞬间锁定。摒弃录制中动态拖拽同步的复杂逻辑，彻底杜绝 IPC 通信过载、掉帧以及坐标错位等性能隐患。
3. **沉浸式无干扰模式 (隐身录制)**：录制过程中，若悬浮小窗遮挡屏幕操作，用户可一键隐藏该预览窗。隐藏仅作用于桌面 UI，底层的核心录制管线仍会持续将摄像头画面混入最终合成的视频中。

---

## 二、 双轨分离架构设计 (Dual-Track Architecture)

为实现上述体验，系统在架构上将 UI 展示与流媒体合成彻底解耦：

1. **前端预览轨 (PipWindow)**：
   专门负责 UI 交互。这是一个无边框、可拖拽、置顶的 Electron 独立窗口，仅用于展示摄像头画面并记录用户的物理操作（坐标 x/y、尺寸、形状）。
2. **后台混流轨 (Canvas Mixer)**：
   专门负责视频合成。在主屏幕流 (Screen/Window/Area) 传入 RecordingEngine 之前，Canvas 会接管每一帧，并根据录制启动时获取的 PipWindow“坐标快照”，将摄像头流硬编码叠加到主画面上。

---

## 三、 核心实施路径与代码设计

### 阶段一：唤起预览悬浮窗
用户在主工具条开启画中画功能时，主进程立刻动态拉起 `PipWindow`：
* 请求 `getUserMedia` 获得摄像头流进行预览。
* 开放窗口拖拽与缩放权限。

### 阶段二：录制启动与参数“快照”截取
用户点击“开始录制”的瞬间，执行绝对参数交接：

    // 伪代码：开始录制时的参数交接逻辑
    // 1. 获取主画面流 (全屏/窗口/区域)
    const mainStream = await startScreenCapture();

    // 2. 检查 PIP 状态并获取快照参数
    let pipStream = null;
    let pipConfig = null;

    if (cameraEnabled) {
        // 向主进程索要 PipWindow 当前的相对坐标快照 (例如：相对主屏幕的 x: 80%, y: 80%)
        pipConfig = await window.electron.getPipSnapshot();
        
        // 后台独立获取一份摄像头流用于硬编码混流
        pipStream = await mediaCapturer.startCameraCapture();
    }

    // 3. 将主画面流、摄像头流和固定配置喂给混合器
    const finalStream = await createMixedStream(mainStream, pipStream, pipConfig);

### 阶段三：Canvas 混合器硬编码叠加
升级底层的 Canvas 流生成器，根据传入的 `pipConfig` 将画面“钉”在视频的特定位置：

    // 伪代码：Canvas 混流器核心渲染逻辑
    function drawFrame() {
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        
        // 1. 绘制底层主画面
        ctx.drawImage(mainVideo, 0, 0, canvasWidth, canvasHeight);
        
        // 2. 绘制画中画 (PIP)
        if (pipVideo && pipConfig) {
            ctx.save();
            
            // 核心：将相对比例换算为当前 Canvas 的实际物理坐标
            const drawX = canvasWidth * pipConfig.relativeX;
            const drawY = canvasHeight * pipConfig.relativeY;
            const radius = pipConfig.size / 2;
            const centerX = drawX + radius;
            const centerY = drawY + radius;

            // 遮罩裁切 (如圆形)
            if (pipConfig.shape === 'circle') {
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
                ctx.clip();
            }
            
            // 绘制摄像头真实画面
            ctx.drawImage(pipVideo, drawX, drawY, pipConfig.size, pipConfig.size);
            ctx.restore();
        }
        requestAnimationFrame(drawFrame);
    }

### 阶段四：无干扰模式 (Hide Preview)
* 在 `PipWindow` UI 上提供隐藏按钮或支持全局快捷键。
* 点击隐藏时，主进程仅调用 `pipWindow.setOpacity(0)` 或 `pipWindow.hide()` 隐藏前端交互窗口。
* **机制保障**：由于后端的 Canvas 混流器持有独立的 `pipStream` 且坐标在录制初已锁定，隐藏预览窗口的操作完全不会干扰最终视频的合成质量。

---

## 四、 关键技术边界与防坑指南 (Edge Cases)

1. **坐标系换算屏障 (极度关键)**：
   `PipWindow` 产生的是电脑屏幕的绝对物理坐标（如 x: 1900, y: 1000）。而在混流时，Canvas 需要的是相对于“录制区域”的坐标。因此，在录制启动前，必须在主进程中**将物理绝对坐标换算成百分比相对坐标（Relative Ratio, %）**再传给 Canvas，以此保证不论是全屏还是小区域录制，PIP 的相对位置都能保持准确。

2. **摄像头独占冲突 (硬件限制)**：
   部分 Windows 设备的摄像头底层驱动不支持被两个不同的进程（或两个独立的 Video 标签）同时并发占用。
   **解决方案**：由底层的独立服务统一调用 `getUserMedia` 获取唯一的原始流，随后利用 `stream.clone()` 将这唯一的流分发两份：一份给前端 `PipWindow` 用于实时预览，另一份给后台 `Canvas` 用于硬编码混流。