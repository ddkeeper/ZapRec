# ZapRec 设置面板全栈开发实施白皮书 (v2.4 终极完整版)

## 一、 项目基础与技术底座

| 类别 | 技术选型/规范 |
|-----|-------------|
| **技术栈** | React 18.3.1 + TypeScript + Electron |
| **状态管理** | Zustand |
| **样式方案** | Tailwind CSS + `lucide-react` (图标库) |
| **持久化库** | `electron-store` (主进程托管) |
| **窗口形态** | 独立 BrowserWindow（无边框/固定尺寸）。开启时隐藏主工具条，关闭时恢复主工具条。 |

---

## 二、 分区与设置项定义

### 1. 通用 (General)
* **录制倒计时 (countdownSeconds)**：`number` 范围 0-10，步进器。默认 `3`。
* **视频帧率 (fps)**：`30 | 60`，拨动开关。默认 `60`。
* **录制分辨率 (resolution)**：`"original" | "1080P"`，下拉选择。默认 `"original"`。
* **窗口行为 (minimizeToTrayOnClose)**：`boolean`，Switch 开关。默认 `true`。

### 2. 快捷键 (Shortcuts)
* **开始 / 停止录制 (toggleRecord)**：快捷键输入框。默认 `"Alt+Shift+R"`。
* **暂停 / 恢复录制 (togglePause)**：快捷键输入框。默认 `"Alt+Shift+P"`。
* **唤出 / 隐藏工具条 (toggleVisibility)**：快捷键输入框。默认 `"Alt+Shift+H"`。

### 3. 录屏管理 (Storage & Recordings)
* **存储路径配置 (saveDirectory)**：
    * 布局：左侧显示完整绝对路径，右侧放置 `[更改]` 与 `[打开]` 按钮。
* **视频文件列表 (Data Grid)**：
    * 展现形式：纯文本数据表格（拒绝缩略图以保障性能）。
    * 数据列：复选框、文件名、时长、文件大小、创建日期。
    * 行操作：每行末尾提供 `[在文件夹中显示]` 与 `[删除]` 图标。
    * 批量管理：支持多选，选中项 > 0 时激活顶部 `[批量删除]` 按钮。

---

## 三、 核心逻辑规范 (关键避坑指南)

### 1. 状态记忆的即时保存 (LastState)
不需要繁琐的默认状态设置，软件通过 `lastState` 隐性记忆。
**规范**：不在关闭设置窗口时保存，而是在 `Toolbar.tsx` 中。每次用户点击麦克风/系统音/PiP 开关时，**立即异步调用** `settingsAPI.set` 写入本地 JSON。

### 2. 快捷键更新防冲突逻辑
**规范**：在主进程更新全局快捷键时，必须**先注销旧按键，再注册新按键**。
```typescript
// 主进程伪代码规范
function updateShortcut(key: string, newAccelerator: string) {
  const oldAccelerator = settingsStore.get(key)
  if (oldAccelerator) {
    globalShortcut.unregister(oldAccelerator) // 卸载旧键，防止冲突
  }
  globalShortcut.register(newAccelerator, () => { /* 触发逻辑 */ })
  settingsStore.set(key, newAccelerator)
}
```

---

## 四、 模块通信与 IPC 接口字典

### 1. 模块架构图

```text
┌─────────────────────────────────────────────────────────┐
│                    主进程 (main)                       │
│  ┌─────────────────┐  ┌─────────────────────────────┐  │
│  │  electron-store │  │  globalShortcut 管理器      │  │
│  └────────┬────────┘  └──────────────┬─────────────┘  │
│           │ IPC                      │                │
├───────────┼──────────────────────────┼───────────────┤
│                        Preload                       │
│  settingsAPI: load / save / set / reset              │
│  fileAPI: getRecordings / deleteRecordings / open... │
├─────────────────────────────────────────────────────┤
│                    渲染进程 (React)                    │
│  ┌──────────┐  ┌───────────────┐  ┌──────────────┐   │
│  │ Toolbar  │→ │ SettingsApp   │  │ Recordings   │   │
│  │(即时保存)│  │ (独立窗口入口)│  │ (纯文本列表) │   │
│  └──────────┘  └───────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────┘
```

### 2. IPC API 暴露清单

| API 命名空间 | 方法名 | 参数 | 用途说明 |
|------------|--------|------|---------|
| `window.caplet.settingsAPI` | `load()` | - | 读取 config.json 全量数据 |
| | `set(key, value)`| 键值对 | 局部更新字段（如即时保存 lastState） |
| `window.caplet.fileAPI` | `getRecordings(path)`| 目录路径 | 返回包含名称、大小、日期的视频数组 |
| | `deleteRecordings(paths)` | 绝对路径数组 | 批量执行 `fs.unlink` |
| | `openInFolder(path)` | 文件绝对路径 | 触发 `shell.showItemInFolder` |
| | `selectDirectory()`| - | 触发 `dialog.showOpenDialog` 获取新目录 |

---

## 五、 文件迁移与改造计划

### 1. 迁移清单 (从旧架构提取复用)

| 原路径 (Settings-Panel-Architecture) | 迁移后路径 | 说明 |
|-------|-----------|-----|
| `src/app/types/settings.ts` | `src/settings/types.ts` | 配置 TS 类型定义 |
| `src/app/pages/General.tsx` | `src/settings/pages/General.tsx` | 通用设置 Tab |
| `src/app/pages/Shortcuts.tsx` | `src/settings/pages/Shortcuts.tsx` | 快捷键设置 Tab |
| `src/app/pages/Recordings.tsx` | `src/settings/pages/Recordings.tsx` | 录屏管理 Tab (需改造为纯文本表格) |
| `src/app/hooks/useSettings.ts` | `src/settings/hooks/useSettings.ts` | 改造为底层 IPC 异步调用 |
| `src/app/components/ui/*` | `src/components/ui/*` | 基础 UI 组件复用 |
| `src/app/components/Layout.tsx` | `src/settings/components/SettingsLayout.tsx`| 侧边栏布局组件 |

### 2. 新增文件 (底层基建与新窗口)

| 路径 | 说明 |
|-----|------|
| `src/main/settingsStore.ts` | 主进程：配置持久化管理器 (`electron-store` 实例) |
| `src/preload/settingsApi.ts` | Preload：桥接暴露 `settingsAPI` 与 `fileAPI` |
| `src/SettingsApp.tsx` | **渲染进程：独立设置窗口的 React 根节点** |
| `src/settings/pages/index.ts` | Tab 页面统一导出 |

### 3. 改造文件 (业务接入)

| 文件 | 改造内容 |
|-----|---------|
| `src/components/Toolbar.tsx` | 添加齿轮图标的 `onOpenSettings` IPC 唤醒；为 mic/sys/PiP 状态开关注入即时保存逻辑 |
| `src/main/index.ts` | 增加 `createSettingsWindow()` 主进程创建独立窗口逻辑及其相关 IPC 监听 |
| `src/shared/types.ts` | 补充导出或引用 Settings 相关的全局 TS 类型声明 |

---

## 六、 分阶段实施步骤

### 阶段一：底层基建搭建 (Main & Preload)
1. **类型定义**：创建 `src/settings/types.ts` 定义全量 `Settings` 接口。
2. **状态初始化**：创建 `src/main/settingsStore.ts`，引入 `electron-store`，注入下方的 `DEFAULT_SETTINGS`。
3. **接口桥接**：在 `preload/index.ts` 中暴露 `settingsAPI` 和 `fileAPI`。
4. **主进程监听**：在 `main/index.ts` 补充上述 IPC 的 `handle` 与快捷键刷新逻辑。

### 阶段二：状态层改造 (React Hooks)
5. **Hook 改造**：重写 `useSettings.ts`，彻底移除 LocalStorage，全量接入 IPC 异步调用 `window.caplet.settingsAPI`。

### 阶段三：渲染层架构与 UI 迁移
6. **UI 迁移**：将旧架构的页面迁移至 `src/settings/pages/`，清理无效代码，统一使用 `lucide-react`。
7. **入口挂载**：创建 `src/SettingsApp.tsx` 作为独立窗口的 React 根组件，挂载左侧导航与右侧路由。
8. **窗口创建**：在主进程 `main/index.ts` 中完成 `createSettingsWindow` 的实现（无边框、固定尺寸），并配置对应的路由入口。

### 阶段四：业务逻辑接入与闭环
9. **工具条改造**：在 `Toolbar.tsx` 的齿轮按钮绑定创建设置窗口的 IPC 调用。
10. **状态同步**：在 `Toolbar.tsx` 中为麦克风、系统音、PiP 按钮补充 `settingsAPI.set` 即时保存触发逻辑。
11. **录屏面板接入**：在 Recordings 页面实现纯文本 Data Grid，并对接文件读写与批量删除 API。

---

## 七、 默认配置字典 (DEFAULT_SETTINGS)

```typescript
export const DEFAULT_SETTINGS: Settings = {
  general: {
    countdownSeconds: 3,
    fps: 60,
    resolution: "original",
    minimizeToTrayOnClose: true,
  },
  shortcuts: {
    toggleRecord: "Alt+Shift+R",
    togglePause: "Alt+Shift+P",
    toggleVisibility: "Alt+Shift+H",
  },
  storage: {
    saveDirectory: "", // 运行时由主进程 app.getPath('downloads') 动态写入
  },
  lastState: {
    microphoneEnabled: false,
    systemAudioEnabled: false,
    pipEnabled: false,
  },
}
```