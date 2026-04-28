import React, { useState } from "react";
import { useSettings } from "../hooks/useSettings";
import { Folder, ExternalLink, Trash2, FolderOpen, CheckSquare, Square, Search, Film } from "lucide-react";
import { toast } from "sonner";

interface Recording {
  id: string;
  name: string;
  duration: string;
  size: string;
  date: string;
}

const MOCK_RECORDINGS: Recording[] = [
  { id: "1", name: "Tutorial_Setup_2026.mp4", duration: "05:22", size: "124 MB", date: "2026-04-20" },
  { id: "2", name: "Quick_Demo_ZapRec.mp4", duration: "01:15", size: "45 MB", date: "2026-04-22" },
  { id: "3", name: "Meeting_Recording_Sales.mp4", duration: "45:10", size: "1.2 GB", date: "2026-04-25" },
  { id: "4", name: "Bug_Report_Repro.mp4", duration: "00:45", size: "12 MB", date: "2026-04-26" },
  { id: "5", name: "New_UI_Teaser.mp4", duration: "02:30", size: "88 MB", date: "2026-04-27" },
];

export function Recordings() {
  const { settings, updateSettings } = useSettings();
  const [recordings, setRecordings] = useState<Recording[]>(MOCK_RECORDINGS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleAll = () => {
    if (selectedIds.size === recordings.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(recordings.map(r => r.id)));
    }
  };

  const deleteRecording = (id: string) => {
    setRecordings(prev => prev.filter(r => r.id !== id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    toast.success("录像已删除");
  };

  const deleteSelected = () => {
    setRecordings(prev => prev.filter(r => !selectedIds.has(r.id)));
    setSelectedIds(new Set());
    toast.success(`${selectedIds.size} 个录像已批量删除`);
  };

  return (
    <div className="space-y-8">
      {/* Storage Path */}
      <section>
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">存储位置</h3>
        <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-xl border border-border">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-muted-foreground mb-1 uppercase tracking-tight">当前保存路径</div>
            <div className="font-mono text-sm truncate bg-input-background px-3 py-1.5 rounded border border-border">
              {settings.storage.saveDirectory}
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => toast.info("正在调用系统文件选择器...")}
              className="px-4 py-2 bg-secondary text-secondary-foreground text-sm font-medium rounded-lg hover:bg-secondary/80 transition-colors flex items-center gap-2"
            >
              <FolderOpen className="w-4 h-4" />
              更改
            </button>
            <button 
              onClick={() => toast.success("已在文件资源管理器中打开")}
              className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              打开
            </button>
          </div>
        </div>
      </section>

      {/* Video List */}
      <section className="flex flex-col h-[350px]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Film className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">录屏管理</h3>
          </div>
          
          <div className="flex items-center gap-3">
            {selectedIds.size > 0 && (
              <button
                onClick={deleteSelected}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                批量删除 ({selectedIds.size})
              </button>
            )}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input 
                type="text" 
                placeholder="搜索录像..." 
                className="pl-9 pr-3 py-1.5 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 w-48"
              />
            </div>
          </div>
        </div>

        <div className="flex-1 border border-border rounded-xl overflow-hidden flex flex-col bg-card shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead className="bg-muted/50 border-b border-border sticky top-0">
              <tr>
                <th className="p-3 w-10">
                  <button onClick={toggleAll} className="text-muted-foreground hover:text-primary transition-colors">
                    {selectedIds.size === recordings.length ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                  </button>
                </th>
                <th className="p-3 text-xs font-semibold text-muted-foreground uppercase">文件名</th>
                <th className="p-3 text-xs font-semibold text-muted-foreground uppercase">时长</th>
                <th className="p-3 text-xs font-semibold text-muted-foreground uppercase">大小</th>
                <th className="p-3 text-xs font-semibold text-muted-foreground uppercase">日期</th>
                <th className="p-3 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border overflow-y-auto">
              {recordings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-muted-foreground italic">
                    暂无录屏记录
                  </td>
                </tr>
              ) : (
                recordings.map((rec) => (
                  <tr 
                    key={rec.id} 
                    className={`hover:bg-muted/30 transition-colors ${selectedIds.has(rec.id) ? "bg-primary/5" : ""}`}
                  >
                    <td className="p-3">
                      <button onClick={() => toggleSelect(rec.id)} className="text-muted-foreground hover:text-primary transition-colors">
                        {selectedIds.has(rec.id) ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                      </button>
                    </td>
                    <td className="p-3 font-medium truncate max-w-[200px]">{rec.name}</td>
                    <td className="p-3 text-sm text-muted-foreground">{rec.duration}</td>
                    <td className="p-3 text-sm text-muted-foreground">{rec.size}</td>
                    <td className="p-3 text-sm text-muted-foreground">{rec.date}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => toast.success("已在文件夹中定位")}
                          className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors"
                          title="在文件夹中显示"
                        >
                          <Folder className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => deleteRecording(rec.id)}
                          className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
