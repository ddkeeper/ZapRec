import React, { useState } from "react";
import { useSettings } from "../hooks/useSettings";
import { Command, Radio, Pause, EyeOff, Keyboard } from "lucide-react";

export function Shortcuts() {
  const { settings, updateSettings } = useSettings();
  const [activeInput, setActiveInput] = useState<string | null>(null);

  const handleKeyDown = (e: React.KeyboardEvent, key: string) => {
    e.preventDefault();
    
    const modifiers = [];
    if (e.ctrlKey || e.metaKey) modifiers.push("CmdOrCtrl");
    if (e.altKey) modifiers.push("Alt");
    if (e.shiftKey) modifiers.push("Shift");
    
    // Ignore if it's just a modifier key
    if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return;

    const mainKey = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    const shortcut = [...modifiers, mainKey].join("+");
    
    updateSettings("shortcuts", { [key]: shortcut });
    setActiveInput(null);
  };

  const shortcutItems = [
    { label: "开始 / 停止录制", key: "toggleRecord", icon: Radio, color: "text-red-500" },
    { label: "暂停 / 恢复录制", key: "togglePause", icon: Pause, color: "text-blue-500" },
    { label: "唤出 / 隐藏工具条", key: "toggleVisibility", icon: EyeOff, color: "text-slate-500" },
  ];

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center gap-2 mb-6">
          <Keyboard className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">全局快捷键</h3>
        </div>
        
        <div className="space-y-4">
          {shortcutItems.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.key} className="flex items-center justify-between p-4 bg-muted/30 rounded-xl border border-border">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg bg-white dark:bg-zinc-800 shadow-sm ${item.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="font-medium">{item.label}</div>
                </div>
                
                <div className="relative group">
                  <button
                    onClick={() => setActiveInput(item.key)}
                    onKeyDown={(e) => activeInput === item.key && handleKeyDown(e, item.key)}
                    className={`min-w-[160px] px-4 py-2 rounded-lg border-2 transition-all font-mono text-sm text-center ${
                      activeInput === item.key
                        ? "border-primary bg-primary/5 text-primary shadow-[0_0_0_4px_rgba(var(--primary),0.1)]"
                        : "border-border bg-input-background text-foreground hover:border-muted-foreground"
                    }`}
                  >
                    {activeInput === item.key ? "按下按键组合..." : (settings.shortcuts as any)[item.key]}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        
        <p className="mt-6 text-sm text-muted-foreground bg-accent/50 p-4 rounded-lg border border-border/50">
          <strong>提示：</strong> 点击输入框后直接按下你想要设置的组合键。建议包含至少一个修饰键（如 Alt, Ctrl 或 Shift）。
        </p>
      </section>
    </div>
  );
}
