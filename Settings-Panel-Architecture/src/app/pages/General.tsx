import React from "react";
import { useSettings } from "../hooks/useSettings";
import { Mic, Volume2, PictureInPicture2, ChevronRight, Monitor, Settings2, LayoutGrid } from "lucide-react";

export function General() {
  const { settings, updateSettings } = useSettings();

  const stateCards = [
    { id: "microphoneEnabled", label: "麦克风", icon: Mic, activeColor: "text-blue-500", bgColor: "bg-blue-500/10" },
    { id: "systemAudioEnabled", label: "系统音", icon: Volume2, activeColor: "text-green-500", bgColor: "bg-green-500/10" },
    { id: "pipEnabled", label: "画中画", icon: PictureInPicture2, activeColor: "text-purple-500", bgColor: "bg-purple-500/10" },
  ];

  return (
    <div className="space-y-8">
      <section>
        <div className="flex flex-col gap-1 mb-4">
          <h3 className="text-sm font-medium text-foreground">当前开关状态</h3>
          <p className="text-xs text-muted-foreground">（下次启动将自动还原）</p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {stateCards.map((item) => {
            const isActive = (settings.lastState as any)[item.id];
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => updateSettings("lastState", { [item.id]: !isActive })}
                className={`p-4 rounded-xl border transition-all flex flex-col items-center gap-2 text-center group ${
                  isActive
                    ? `border-primary ${item.bgColor} shadow-sm`
                    : "border-border bg-muted/30 hover:border-muted-foreground/50"
                }`}
              >
                <Icon className={`w-6 h-6 transition-colors ${isActive ? item.activeColor : "text-muted-foreground"}`} />
                <div className="flex flex-col">
                  <span className={`text-sm font-semibold ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                    {item.label}
                  </span>
                  <span className={`text-[10px] font-bold uppercase ${isActive ? item.activeColor : "text-muted-foreground/60"}`}>
                    {isActive ? "开启" : "关闭"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-4">
          <Settings2 className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">录制设置</h3>
        </div>
        <div className="space-y-4">
          {/* Countdown */}
          <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl border border-border">
            <div>
              <div className="font-medium">录制倒计时</div>
              <div className="text-sm text-muted-foreground text-balance">开启录制前的准备时间</div>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="0"
                max="10"
                value={settings.general.countdownSeconds}
                onChange={(e) => updateSettings("general", { countdownSeconds: parseInt(e.target.value) || 0 })}
                className="w-16 px-2 py-1 bg-input-background border border-border rounded-md text-center focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <span className="text-sm text-muted-foreground">秒</span>
            </div>
          </div>

          {/* FPS */}
          <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl border border-border">
            <div>
              <div className="font-medium">视频帧率</div>
              <div className="text-sm text-muted-foreground text-balance">选择录制视频的流畅度</div>
            </div>
            <div className="flex bg-input-background p-1 rounded-lg border border-border">
              {[30, 60].map((fps) => (
                <button
                  key={fps}
                  onClick={() => updateSettings("general", { fps: fps as 30 | 60 })}
                  className={`px-4 py-1 text-sm font-medium rounded-md transition-all ${
                    settings.general.fps === fps
                      ? "bg-white dark:bg-zinc-800 shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {fps} FPS
                </button>
              ))}
            </div>
          </div>

          {/* Resolution */}
          <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl border border-border">
            <div>
              <div className="font-medium">录制分辨率</div>
              <div className="text-sm text-muted-foreground text-balance">视频导出的清晰度</div>
            </div>
            <select
              value={settings.general.resolution}
              onChange={(e) => updateSettings("general", { resolution: e.target.value as any })}
              className="bg-input-background border border-border rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer pr-8 bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%22%20stroke%3D%22currentColor%22%3E%3Cpath%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%222%22%20d%3D%22m19%209-7%207-7-7%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1.25em_1.25em] bg-[right_0.5rem_center] bg-no-repeat"
            >
              <option value="original">原始分辨率 (Native)</option>
              <option value="1080P">1080P HD</option>
            </select>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">窗口行为</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl border border-border">
            <div>
              <div className="font-medium">关闭主面板时最小化到系统托盘</div>
              <div className="text-sm text-muted-foreground">保持应用在后台运行</div>
            </div>
            <button
              onClick={() => updateSettings("general", { minimizeToTrayOnClose: !settings.general.minimizeToTrayOnClose })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                settings.general.minimizeToTrayOnClose ? "bg-primary" : "bg-switch-background"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.general.minimizeToTrayOnClose ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
