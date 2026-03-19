# P2P 开发文档 - 画中画 (PIP) 功能双轨架构实现方案

## 1. 功能概述与核心产品理念 (Feature Overview)

根据 `SPEC.md` 与专家优化建议 (`P2P_add.md`)，当用户在录制（全屏/窗口/区域）的过程中，开启了“画中画”（PIP / `cameraEnabled`）功能时，系统需要将用户的摄像头采集画面叠加到输出的视频流中。

为了兼顾“录制前的自由定制”与“录制中的极高稳定性”，本功能采用**双轨分离架构 (Dual-Track Architecture)**，提供商业级录屏软件（如 Loom、OBS）的沉浸式体验。

### 1.1 核心 UX 规范
1. **所见即所得 (预设自由)**：录制开始前，当用户开启“画中画”开关时，系统提供一个独立的无边框透明 Electron 窗口 (`PipWindow`)，仅展示摄像头画面。用户可自由拖拽位置、缩放大小。
2. **无干扰模式 (Hide Preview)**：在 `PipWindow` 上提供隐藏/显示按钮（或热键）。如果用户觉得预览小窗挡住了视线，可以随时一键隐藏该窗口。隐藏仅仅作用于前端的 UI 交互展示，底层的 Canvas 混流器依然会持续把摄像头画面硬编码合成进最终的视频文件中。
3. **录制即锁定 (后台求稳) 与 自由调整 (前端灵动)**：
   * **后台**：当点击“开始录制”瞬间，系统提取 `PipWindow` 当前的大小和物理坐标作为**坐标快照 (Snapshot)**。
   * **前端**：录制开始后，**用户依然可以随时调整悬浮小窗的位置、大小和形态**（如将其拖到不碍事的地方，或改变形态以方便自己查看出镜状态）。
   * **机制保障**：前端的这些调整**绝对不会**同步至实际录制的视频中。视频内的画中画永远固定在录制开始那一瞬间快照的位置上。这种设计既满足了用户实时查看自身状态的安全感，又彻底杜绝了因实时同步坐标引发的高频 IPC 性能消耗和坐标错位崩溃。

---

## 2. 架构设计 (Architecture Design)

在 WebCodecs 硬编码管线中，底层的 `VideoEncoder` 只能接收单一流。因此必须使用 **Canvas 2D API** 作为混流器。
整个架构分为 UI 预览层与数据合并层：

### 2.1 双轨分离机制
1. **前端预览轨 (`PipWindow`)**: 
   独立的置顶透明小窗。负责向用户展示摄像头画面，并实时记录用户对窗口在屏幕上的物理坐标 (x, y) 和尺寸 (width, height)。提供 UI 按钮以允许自身被隐藏 (`setOpacity(0)` 或 `hide()`)。
2. **后台混流轨 (Canvas Mixer)**: 
   在 `App.tsx` 中，拦截每一次 `requestAnimationFrame` 或 `setInterval` 的屏幕帧，利用刚刚锁定的 `PipWindow` 坐标快照，调用 `ctx.drawImage` 将摄像头画面“钉”在主画面的对应位置。

### 2.2 摄像头单实例分发 (防独占报错)
由于 Windows 底层驱动限制，很多摄像头不允许被两个不同进程或视频标签同时调用。
为了避免硬件占用冲突：
* **最佳方案 (推荐)**：统一由一个 `MediaCapturer` 实例获取唯一的原始摄像头 `MediaStream`，然后通过 `stream.clone()` 克隆出两条流，一条传给 `PipWindow` 进行预览展示，一条传给底层的 Canvas 混流器。
* **次选方案**：如果跨窗口传递 `MediaStream` 遇到 Electron 序列化瓶颈，可以采用 WebRTC 的点对点本地传输，或者干脆只在主窗口渲染 `PipWindow`。本方案暂定创建一个纯正的 BrowserWindow 来承载 Pip，并在主进程做代理。

---

## 3. 核心实施路径与代码设计 (Implementation Plan)

### 3.1 创建独立的 PipWindow (主进程)
在 `main/index.ts` 新增 `createPipWindow()` 方法，创建一个置顶、透明、无边框的窗口。
并在 `preload/index.ts` 暴露与之相关的 IPC 方法：
* `window.caplet.openPip()`
* `window.caplet.closePip()`
* `window.caplet.hidePip()`
* `window.caplet.getPipSnapshot()`：返回当前的物理坐标和宽高。

### 3.2 坐标快照换算防坑 (Coordinate Translation)
**极度关键**：
如果用户框选了屏幕左上角区域（0,0 到 800x600），但 `PipWindow` 放在了屏幕右下角（1800,900）。此时如果按绝对物理坐标合并，画中画会画到画布外面。
**换算逻辑**：
* 在 `App.tsx` 开始录制时，获取 `PipSnapshot`，提取它的绝对屏幕坐标 (x, y)。
* **全屏录制**：可以直接将绝对坐标应用给 Canvas。
* **区域录制**：PIP 在最终视频里的物理坐标 = `PipWindow.x - 区域选框.x`。如果计算出的坐标完全不在选框范围内，则这部分 PIP 自然不会被录入（或者我们可以做 clamp 处理）。为了简单起见，最好的做法是在全屏画布下，记录相对全屏宽高的比例（`relativeX`, `relativeY`, `relativeSize`）。

```typescript
export interface PipSnapshot {
  x: number; 
  y: number;
  width: number;
  height: number;
  shape: 'circle' | 'square';
  isHidden: boolean;
}
```

### 3.3 Canvas 混流器升级 (App.tsx)
将上一版硬编码在右下角的 `createMixedStream` 重构，使其接受从主进程拿到或由 React 状态管理的 `PipSnapshot`：

```typescript
const createMixedStream = async (
  mainStream: MediaStream, 
  area: AreaSelection | null, 
  pipStream: MediaStream | null,
  pipSnapshot: PipSnapshot | null
): Promise<MediaStream>
```

并在绘制逻辑中：
```typescript
// 1. 绘制底层主画面
ctx.drawImage(mainVideo, sx, sy, sw, sh, 0, 0, physicalW, physicalH);

// 2. 如果存在 PIP 并且开启，则根据快照绘制
if (pipVideo && pipSnapshot) {
  ctx.save();
  
  // 计算最终在画布上的位置
  // 如果是区域录制，需要做偏移减法
  const offsetX = area ? area.x : 0;
  const offsetY = area ? area.y : 0;
  
  // 考虑到 dpr 的缩放
  const drawX = (pipSnapshot.x - offsetX) * scale;
  const drawY = (pipSnapshot.y - offsetY) * scale;
  const drawW = pipSnapshot.width * scale;
  const drawH = pipSnapshot.height * scale;
  
  const radius = drawW / 2;
  const centerX = drawX + radius;
  const centerY = drawY + radius;

  // 执行圆形遮罩裁切 (Masking)
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  
  // 处理摄像头居中填满圆形 (Object-Fit: Cover)
  // ... 之前的缩放逻辑保持不变
  
  ctx.drawImage(pipVideo, sourceX, sourceY, sourceW, sourceH, drawX, drawY, drawW, drawH);
  ctx.restore();
  
  // 描边增强
  // ...
}
```

---

## 4. MVP (最小可行性产品) 演进阶段
1. **MVP v1.0 (已完成)**：默认将画中画**硬编码死死钉在**录制画面的右下角，验证了 Canvas 混流引擎的稳定性。
2. **MVP v2.0 (当前目标)**：引入独立的 `PipWindow`。在主工具条开启画中画时，唤起无边框预览悬浮窗；允许用户任意拖拽、放大缩小和一键隐藏。
   * **录制开始前**：用户的所有操作是为了定位（Positioning）和定型（Shaping）。
   * **录制开始瞬间**：后台采集坐标快照传给 Canvas 混流器，由混流器硬编码输出，无论之后窗口发生什么，视频内的人像位置和大小将稳稳固化！
   * **录制进行中**：用户不仅可以一键隐藏 `PipWindow`，还可以**继续自由拖拽小窗或调整大小形状**，以方便实时查看出镜状态。后台的混流器将始终使用最开始截取的快照，完全不理会前端随后的动态调整，真正实现了“前端灵动预览、后台死磕稳定”的双赢架构。

本架构文档完全吸收了 `P2P_add.md` 提出的专家建议，通过分离 UI 预览与 Canvas 硬编码，完美实现了“所见即所得”与“隐身防干扰”的体验融合。