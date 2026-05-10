# 应用托盘菜单实现文档

## 一、托盘图标创建

### 1.1 createTray() 函数 (src/main/index.ts:188-218)

```typescript
function createTray() {
  // 托盘使用 16x16 图标
  const iconPath = getIconPath(16)
  let icon: Electron.NativeImage
  
  // 优先使用图标文件，不存在则使用内联 base64 图片
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath)
  } else {
    icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAADASURBVDiNpdMxSgNBHAbgb7OFYGFhIVhYWFhYWIiFhVhYiIWFYGFhYWEhFhYWYiEWYiEWPjAw8IGm8WKz2WQ0+5LP7M7M+76ZNdmHGGMSIAXmQB44AAfgCnyAh5AHtoAFUACOgD3wDLyAHbCVS1D4bCWWs1R6zSUoAiZJkvRP4l+BEnAFXoE7sAYWwBBYAH1x+8fCJXCWe/y9gB1wA+5S10dRFPX+KqkHiA8f4i+Bd+AFrIJgPQdawBVYAs/AB9gFG2AN7CXJ7gP0B5e8y2b+4Q7kAQAAAABJRU5ErkJggg==')
  }
  
  // 创建托盘实例
  tray = new Tray(icon)
  
  // 设置鼠标悬停提示
  tray.setToolTip('ZapRec')
  
  // 构建右键菜单
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Window', click: () => mainWindow?.show() },
    { label: 'Show Camera', click: () => {
      if (cameraRecordingWindow && !cameraRecordingWindow.isVisible()) {
        cameraRecordingWindow.show()
      }
    }},
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ])
  
  // 设置右键菜单
  tray.setContextMenu(contextMenu)
  
  // 点击托盘图标显示主窗口
  tray.on('click', () => {
    mainWindow?.show()
  })
}
```

---

## 二、托盘菜单项说明

| 菜单项 | 功能 | 实现 |
|--------|------|------|
| Show Window | 显示主工具条 | `mainWindow?.show()` |
| Show Camera | 显示悬浮摄像头 | `cameraRecordingWindow.show()` |
| separator | 分割线 | - |
| Quit | 退出应用 | `app.quit()` |

---

## 三、托盘初始化时机

### 3.1 应用启动时创建托盘 (src/main/index.ts:1118)

```typescript
app.whenReady().then(() => {
  // ... 其他初始化
  createTray()  // 创建系统托盘
})
```

---

## 四、托盘图标尺寸

- **工具条窗口**: 256x256 (主窗口使用)
- **托盘图标**: 16x16 (getIconPath(16))
- **设置窗口**: 256x256 (设置窗口图标)

```typescript
function getIconPath(size: number) {
  return path.join(buildDir, `icon-${size}x${size}.png`)
}
```

---

## 五、托盘图标回退方案

如果图标文件不存在，使用内联的 base64 透明 PNG：

```
data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAADASURBVDiNpdMxSgNBHAbgb7OFYGFhIVhYWFhYWIiFhVhYiIWFYGFhYWEhFhYWYiEWYiEWPjAw8IGm8WKz2WQ0+5LP7M7M+76ZNdmHGGMSIAXmQB44AAfgCnyAh5AHtoAFUACOgD3wDLyAHbCVS1D4bCWWs1R6zSUoAiZJkvRP4l+BEnAFXoE7sAYWwBBYAH1x+8fCJXCWe/y9gB1wA+5S10dRFPX+KqkHiA8f4i+Bd+AFrIJgPQdawBVYAs/AB9gFG2AN7CXJ7gP0B5e8y2b+4Q7kAQAAAABJRU5ErkJggg==
```

---

## 六、托盘变量声明

```typescript
let tray: Tray | null = null
```

---

## 七、相关文件

| 文件 | 职责 |
|------|------|
| src/main/index.ts | 托盘创建及菜单逻辑 |
| vite.config.ts | 图标构建配置 |

---

## 八、托盘图标目录结构

```
scripts/build/
├── icon-16x16.png   # 托盘用
├── icon-256x256.png  # 工具条/设置窗口用
└── icon.png        # 回退用
```

---

## 九、托盘右键菜单示意图

```
┌─────────────────┐
│  Show Window     │  ← 显示主工具条
│  Show Camera    │  ← 显示悬浮摄像头
│  ──��──────────  │  ← 分割线
│  Quit          │  ← 退出应用
└─────────────────┘
```

鼠标左键点击托盘图标 → 显示主窗口 (与 "Show Window" 相同)