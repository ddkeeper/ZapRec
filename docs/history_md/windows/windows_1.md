# 🐞 窗口选择器 (Window Picker) Bug 诊断与重构报告

## 一、 核心病灶与原理解析

当前窗口选择面板出现的“图片破损、排版错乱、高度闪烁”等问题，并非复杂的逻辑 Bug，而是由底层安全策略与 CSS 容器坍塌共同导致的：

1. **CSP 拦截导致图片破损与排版撑爆**
   * **现象**：缩略图全挂，`alt` 替代文本暴露并破坏了网格布局。
   * **原因**：Electron 的 `desktopCapturer` 返回的截图是 Base64 格式（`data:image/png;base64,...`）。但 HTML 的 Content-Security-Policy (CSP) 未放行 `data:` 协议的图片，导致资源被浏览器内核强行拦截。
2. **最小化窗口消失（非 Bug，为系统级物理限制）**
   * **原因**：Windows (DWM) 和 macOS (WindowServer) 为了节省 GPU 资源，会销毁已彻底最小化到任务栏的窗口渲染纹理。底层无画面流，抓取 API 自然无法捕获。这是符合预期的正常系统行为。
3. **加载时高度塌陷与 UI 闪烁**
   * **原因**：外层容器没有设定足够的基础高度。Loading 状态时列表为空，容器缩水；数据加载完毕后瞬间撑大。同时，UI 文本冗余，图标风格与主工具条不统一。

---

## 二、 修复指令 1：解除 CSP 安全封印 (HTML)

请修改 `window-picker.html` 的 `<meta>` 标签，在 `img-src` 中显式放行 `data:` 协议：

    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline';" />

---

## 三、 修复指令 2：UI 重构与防抖锁定 (TSX)

请使用以下代码彻底替换当前的 `src/components/WindowPicker.tsx`。
**核心优化点**：
* 锁死最小高度 `h-[70vh] min-h-[500px]`，彻底消灭加载前后的 UI 闪烁。
* 统一使用 Lucide 极简风格的 `AppWindow` SVG 图标，去除冗余废话。
* 增加 `onError` 图片破损兜底策略，完善 Hover 态的高亮与阴影质感。

```typescript
    import { useState, useEffect, useCallback } from 'react'
    import type { DesktopSource } from '../shared/types'

    interface WindowPickerProps {
      onSelect: (window: DesktopSource) => void
      onCancel: () => void
    }

    export default function WindowPicker({ onSelect, onCancel }: WindowPickerProps) {
      const [windows, setWindows] = useState<DesktopSource[]>([])
      const [loading, setLoading] = useState(true)
      const [hoveredWindow, setHoveredWindow] = useState<string | null>(null)

      useEffect(() => {
        loadWindows()
      }, [])

      const loadWindows = async () => {
        setLoading(true)
        try {
          const sources = await window.caplet.getSources(['window'])
          setWindows(sources)
        } catch (error) {
          console.error('[WindowPicker] Failed to load windows:', error)
        }
        setLoading(false)
      }

      const handleSelect = useCallback((window: DesktopSource) => {
        onSelect(window)
      }, [onSelect])

      const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onCancel()
        }
      }, [onCancel])

      useEffect(() => {
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
      }, [handleKeyDown])

      return (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          <div 
            className="w-[900px] h-[70vh] min-h-[500px] rounded-2xl overflow-hidden flex flex-col shadow-2xl"
            style={{
              backgroundColor: 'rgba(28, 28, 30, 0.95)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            {/* 头部区：极简风格与 Lucide 图标同步 */}
            <div 
              className="flex items-center justify-between px-6 py-4 shrink-0"
              style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}
            >
              <div className="flex items-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#e4e4e7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="M10 4v4" />
                  <path d="M2 8h20" />
                  <path d="M6 4v4" />
                </svg>
                <h2 className="text-zinc-200 text-lg font-medium tracking-wide">选择窗口</h2>
              </div>
              <button
                onClick={onCancel}
                className="w-8 h-8 rounded-md flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-all"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* 内容区：固定滚动，消除加载前后的高度闪烁 */}
            <div className="p-5 overflow-y-auto flex-1 bg-black/20">
              {loading ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                  <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-zinc-500 text-sm">正在获取桌面窗口...</span>
                </div>
              ) : windows.length === 0 ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                  <span className="text-zinc-500 text-sm">未检测到可录制的窗口（最小化的窗口无法录制）</span>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-5">
                  {windows.map((win) => (
                    <button
                      key={win.id}
                      onClick={() => handleSelect(win)}
                      onMouseEnter={() => setHoveredWindow(win.id)}
                      onMouseLeave={() => setHoveredWindow(null)}
                      className="group relative flex flex-col rounded-xl overflow-hidden transition-all duration-200 text-left"
                      style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.03)',
                        border: hoveredWindow === win.id 
                          ? '2px solid #3b82f6' 
                          : '2px solid transparent',
                        boxShadow: hoveredWindow === win.id ? '0 8px 24px rgba(0,0,0,0.4)' : 'none',
                        transform: hoveredWindow === win.id ? 'translateY(-2px)' : 'none',
                      }}
                    >
                      <div className="relative aspect-video bg-black/60 w-full overflow-hidden">
                        <img
                          src={win.thumbnail}
                          alt="thumbnail"
                          className="w-full h-full object-contain"
                          draggable={false}
                          onError={(e) => (e.currentTarget.style.display = 'none')} 
                        />
                        {hoveredWindow === win.id && (
                          <div className="absolute inset-0 flex items-center justify-center bg-blue-500/20 backdrop-blur-sm transition-all">
                            <div className="px-4 py-1.5 rounded-full bg-blue-600 shadow-lg">
                              <span className="text-white text-sm font-medium">点击录制</span>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="p-3 flex items-center gap-3 w-full border-t border-white/5 bg-white/[0.02]">
                        {win.appIcon ? (
                          <img
                            src={win.appIcon}
                            alt="icon"
                            className="w-5 h-5 rounded-sm shrink-0"
                            draggable={false}
                          />
                        ) : (
                          <div className="w-5 h-5 rounded-sm bg-white/10 shrink-0" />
                        )}
                        <span 
                          className="text-zinc-300 text-sm font-medium truncate flex-1"
                          title={win.name}
                        >
                          {win.name}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )
    }
```