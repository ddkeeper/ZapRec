import { useSettings } from '../hooks/useSettings'

export function General() {
  const { settings, updateSettings, setSetting } = useSettings()

  return (
    <div className="space-y-6">
      
      {/* 模块 1：录制设置 */}
      <div>
        <h2 className="text-sm font-semibold text-slate-800 mb-3 ml-1">录制设置</h2>
        
        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
          
          {/* 列表项：录制倒计时 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex flex-col">
              <span className="text-[13px] font-medium text-slate-800">录制倒计时</span>
              <span className="text-[12px] text-slate-500 mt-0.5">开启录制前的缓冲时间</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="10"
                value={settings.general.countdownSeconds}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 0
                  updateSettings('general', { countdownSeconds: val })
                  setSetting('general.countdownSeconds', val)
                }}
                className="w-14 px-2 py-1 bg-white border border-slate-200 rounded text-center text-[13px] text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              />
              <span className="text-[12px] text-slate-500">秒</span>
            </div>
          </div>

          {/* 列表项：视频帧率 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex flex-col">
              <span className="text-[13px] font-medium text-slate-800">视频帧率</span>
              <span className="text-[12px] text-slate-500 mt-0.5">选择录制视频的流畅度</span>
            </div>
            <div className="flex bg-slate-100 p-0.5 rounded border border-slate-200">
              {[30, 60].map((fps) => {
                const isActive = settings.general.fps === fps
                return (
                  <button
                    key={fps}
                    onClick={() => {
                      updateSettings('general', { fps: fps as 30 | 60 })
                      setSetting('general.fps', fps)
                    }}
                    className={`px-3 py-1 text-[12px] font-medium rounded-sm transition-all ${
                      isActive
                        ? 'bg-white shadow-sm text-slate-800 border border-slate-200/50'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {fps} FPS
                  </button>
                )
              })}
            </div>
          </div>

          {/* 列表项：录制分辨率 */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex flex-col">
              <span className="text-[13px] font-medium text-slate-800">录制分辨率</span>
              <span className="text-[12px] text-slate-500 mt-0.5">视频导出的清晰度</span>
            </div>
            <select
              value={settings.general.resolution}
              onChange={(e) => {
                const val = e.target.value as 'original' | '1080P'
                updateSettings('general', { resolution: val })
                setSetting('general.resolution', val)
              }}
              className="bg-white border border-slate-200 rounded px-2.5 py-1.5 text-[13px] font-medium text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="original">原始分辨率 (Native)</option>
              <option value="1080P">1080P HD</option>
            </select>
          </div>

        </div>
      </div>

      {/* 模块 2：窗口行为 */}
      <div>
        <h2 className="text-sm font-semibold text-slate-800 mb-3 ml-1">窗口行为</h2>
        
        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
          {/* 列表项：最小化到托盘 */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex flex-col">
              <span className="text-[13px] font-medium text-slate-800">关闭主面板时最小化到系统托盘</span>
              <span className="text-[12px] text-slate-500 mt-0.5">保持应用在后台静默运行</span>
            </div>
            <button
              onClick={() => {
                const newValue = !settings.general.minimizeToTrayOnClose
                updateSettings('general', { minimizeToTrayOnClose: newValue })
                setSetting('general.minimizeToTrayOnClose', newValue)
              }}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                settings.general.minimizeToTrayOnClose ? 'bg-blue-500' : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                  settings.general.minimizeToTrayOnClose ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

    </div>
  )
}