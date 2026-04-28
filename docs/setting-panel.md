# ZapRec 设置面板架构说明书 (v1.4)

## 一、 整体架构与布局规范

* **窗口形态**：独立窗口。开启时工具条隐藏，关闭时工具条恢复。
* **布局架构**：采用“左侧侧边栏导航 + 右侧主面板显示”的经典布局。点击左侧分区图标或文字，右侧主面板实时切换对应的设置项内容。
* **图标规范**：统一使用 `lucide-react` 图标库，保持与工具条视觉风格的一致性。
* **存储机制**：采用纯本地 JSON 读写 (`config.json`)，配置变更即刻持久化，无需手动保存。
* **状态记忆 (State Persistence)**：软件自动记忆工具条右侧开关的最后状态。包含：**两个音频源（麦克风、系统音）**与**一个画中画（PiP）**。下次启动时将自动加载并还原这些状态。

---

## 二、 分区与功能定义

### 1. 通用 (General)
* **录制倒计时**：数值步进器（0 - 10s）。
* **视频帧率**：拨动开关（30 FPS / 60 FPS）。
* **录制分辨率**：下拉选择（原始分辨率 / 1080P）。
* **窗口行为**：关闭主面板时最小化到系统托盘（Switch 开关）。

### 2. 快捷键 (Shortcuts)
* **开始 / 停止录制**：快捷键绑定输入框（默认：`Alt+Shift+R`）。
* **暂停 / 恢复录制**：快捷键绑定输入框（默认：`Alt+Shift+P`）。
* **唤出 / 隐藏工具条**：快捷键绑定输入框（默认：`Alt+Shift+H`）。

### 3. 录屏管理 (Recordings)
* **存储路径配置**：
    * **布局**：横向排列。左侧显示完整绝对路径，右侧放置 `[更改]` 与 `[打开]` 按钮。
* **视频文件列表 (Data Grid)**：
    * **展现形式**：纯文本数据表格，确保在大数据量下依然保持极高性能。
    * **数据列**：多选复选框、文件名、时长、文件大小、创建日期。
    * **行操作**：每行末尾提供 `[在文件夹中显示]` 与 `[删除]` 图标按钮。
    * **批量管理**：支持多选，在选中项 > 0 时激活列表顶部的 `[批量删除]` 按钮。

---

## 三、 数据结构 (Config Schema)

```json
{
  "general": {
    "countdownSeconds": 3,
    "fps": 60,
    "resolution": "original",
    "minimizeToTrayOnClose": true
  },
  "shortcuts": {
    "toggleRecord": "CommandOrControl+Shift+R",
    "togglePause": "CommandOrControl+Shift+P",
    "toggleVisibility": "CommandOrControl+Shift+H"
  },
  "storage": {
    "saveDirectory": "C:\\Users\\intangible\\Downloads"
  },
  "lastState": {
    "microphoneEnabled": false,
    "systemAudioEnabled": false,
    "pipEnabled": false
  }
}