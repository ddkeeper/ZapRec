import { useState, useEffect } from 'react'
import { useSettings } from '../hooks/useSettings'
import { Folder, ExternalLink, Trash2, FolderOpen, CheckSquare, Square, HelpCircle } from 'lucide-react'
import { DISPLAY_NAME } from '../../config'

export function Recordings() {
  const { settings, updateSettings, setSetting } = useSettings()
  const [recordings, setRecordings] = useState<{ id: string; name: string; path: string; size: number; sizeFormatted: string; date: string }[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [showTemplateHint, setShowTemplateHint] = useState(false)
  const [appName, setAppName] = useState(DISPLAY_NAME)

  useEffect(() => {
    loadRecordings()
    ;(window.screenApi as any).getAppName().then((name: string) => {
      if (name) setAppName(name)
    })
  }, [settings.storage.saveDirectory])

  const loadRecordings = async () => {
    if (!settings.storage.saveDirectory) {
      setLoading(false)
      return
    }
    setLoading(true)
    const items = await (window.screenApi as any).getRecordings(settings.storage.saveDirectory)
    setRecordings(items || [])
    setLoading(false)
  }

// 辅助函数：格式化日期为 YYYY/M/D HH:mm
  const formatDisplayDate = (dateVal: string) => {
    if (!dateVal) return '-'
    
    try {
      // 兼容处理：如果后端传来的是 "2026-05-05T13:15" 这种格式，直接用字符串正则处理最快最稳
      if (typeof dateVal === 'string' && dateVal.includes('T')) {
        const [datePart, timePart] = dateVal.split('T')
        const [year, month, day] = datePart.split('-')
        const time = timePart.substring(0, 5) // 截取 HH:mm
        // parseInt 可以自然地去掉前面的 0，比如 parseInt("05") === 5
        return `${year}/${parseInt(month)}/${parseInt(day)} ${time}`
      }

      // 如果传过来的是标准时间戳或完整 Date 对象
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return dateVal; 
      
      const year = d.getFullYear();
      const month = d.getMonth() + 1; // 默认不补零
      const day = d.getDate();        // 默认不补零
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      
      return `${year}/${month}/${day} ${hours}:${minutes}`;
    } catch (e) {
      return dateVal;
    }
  }

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const toggleAll = () => {
    if (selectedIds.size === recordings.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(recordings.map(r => r.id)))
    }
  }

  const deleteRecording = async (id: string) => {
    const rec = recordings.find(r => r.id === id)
    if (!rec) return
    await (window.screenApi as any).deleteRecordings([rec.path])
    setRecordings(prev => prev.filter(r => r.id !== id))
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const deleteSelected = async () => {
    const paths = recordings
      .filter(r => selectedIds.has(r.id))
      .map(r => r.path)
    await (window.screenApi as any).deleteRecordings(paths)
    setRecordings(prev => prev.filter(r => !selectedIds.has(r.id)))
    setSelectedIds(new Set())
  }

  const handleChangeDirectory = async () => {
    const newPath = await (window.screenApi as any).selectDirectory()
    if (newPath) {
      updateSettings('storage', { saveDirectory: newPath })
      setSetting('storage.saveDirectory', newPath)
    }
  }

  const handleOpenFolder = () => {
    if (settings.storage.saveDirectory) {
      ;(window.screenApi as any).openInFolder(settings.storage.saveDirectory)
    }
  }

  const handleOpenInFolder = (path: string) => {
    ;(window.screenApi as any).openInFolder(path)
  }

const currentTemplate = (settings.storage as Record<string, string>).filenameTemplate || '{app}_{date}_{time}'
  currentTemplate
    .replace(/{app}/g, appName)
    .replace(/{date}/g, '2026-04-28')
    .replace(/{time}/g, '14-30-05')
  + '.mp4'

  return (
    <div className="space-y-6">
      {/* 模块 1：存储位置 (保持不变) */}
      <div>
        <h2 className="text-sm font-semibold text-slate-800 mb-3 ml-1">存储位置</h2>
        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex flex-col min-w-0 mr-4">
              <span className="text-[13px] font-medium text-slate-800">当前保存路径</span>
              <span className="text-[12px] text-slate-500 truncate mt-0.5 font-mono">
                {settings.storage.saveDirectory || '未设置'}
              </span>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={handleChangeDirectory} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-[12px] font-medium rounded hover:bg-slate-50 hover:border-slate-300 transition-colors flex items-center gap-1.5">
                <FolderOpen className="w-3.5 h-3.5" /> 更改
              </button>
              <button onClick={handleOpenFolder} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-[12px] font-medium rounded hover:bg-slate-50 hover:border-slate-300 transition-colors flex items-center gap-1.5">
                <ExternalLink className="w-3.5 h-3.5" /> 打开
              </button>
            </div>
          </div>
          <div className="flex flex-col border-t border-slate-100">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex flex-col">
                <span className="text-[13px] font-medium text-slate-800">文件命名</span>
                <span className="text-[12px] text-slate-500 mt-0.5">自定义录制文件的命名规则</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={currentTemplate}
                  onChange={(e) => {
                    updateSettings('storage', { filenameTemplate: e.target.value })
                    setSetting('storage.filenameTemplate', e.target.value)
                  }}
                  className="w-48 px-2.5 py-1.5 text-[12px] text-slate-700 font-mono border border-slate-200 rounded outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  placeholder="{app}_{date}_{time}"
                />
                <button onClick={() => setShowTemplateHint(!showTemplateHint)} className={`p-1.5 rounded transition-colors ${showTemplateHint ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}>
                  <HelpCircle className="w-[15px] h-[15px]" />
                </button>
              </div>
            </div>
            {showTemplateHint && (
              <div className="px-4 pb-4 pt-1 bg-slate-50/60 border-t border-slate-100/50">
                <p className="text-[12px] text-slate-600 font-medium mb-2">支持的变量说明：</p>
                <ul className="text-[12px] text-slate-500 space-y-1.5 font-mono ml-1">
                  <li><span className="inline-block w-[50px] text-blue-600 font-medium">{`{app}`}</span> - 软件名称 (如: {appName})</li>
                  <li><span className="inline-block w-[50px] text-blue-600 font-medium">{`{date}`}</span> - 录制日期</li>
                  <li><span className="inline-block w-[50px] text-blue-600 font-medium">{`{time}`}</span> - 录制时间</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 模块 2：录屏列表 */}
      <div className="flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-3 ml-1 shrink-0">
          <h2 className="text-sm font-semibold text-slate-800">录屏管理</h2>
          {selectedIds.size > 0 && (
            <button onClick={deleteSelected} className="flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium text-red-600 hover:bg-red-50 rounded transition-colors border border-red-100">
              <Trash2 className="w-3.5 h-3.5" /> 批量删除 ({selectedIds.size})
            </button>
          )}
        </div>

        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm flex flex-col min-h-[200px]">
          <div className="flex-1 overflow-y-auto custom-scrollbar">
        <table className="w-full text-left border-collapse table-fixed">
          {/* 表头部分 */}
          <thead className="bg-slate-50/80 border-b border-slate-200 sticky top-0 z-10 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
            <tr>
              {/* 1. 复选框：固定较窄宽度 */}
              <th className="py-2 px-3 w-12 text-center">
                <button onClick={toggleAll} className="text-slate-400 hover:text-blue-500 transition-colors mt-1">
                  {selectedIds.size === recordings.length && recordings.length > 0 ? <CheckSquare className="w-[15px] h-[15px] text-blue-500" /> : <Square className="w-[15px] h-[15px]" />}
                </button>
              </th>
              
              {/* 2. 文件名：分配最大的百分比空间，展示更长文本 */}
              <th className="py-2 px-3 text-[12px] font-medium text-slate-500 w-[45%]">文件名</th>
              
              {/* 3. 大小：分配 15% 宽度，拉开与文件名的间距 */}
              <th className="py-2 px-3 text-[12px] font-medium text-slate-500 w-[15%]">大小</th>
              
              {/* 4. 修改日期：分配 25% 宽度，拉开与大小的间距 */}
              <th className="py-2 px-3 text-[12px] font-medium text-slate-500 w-[25%]">修改日期</th>
              
              {/* 5. 操作列：固定为 80px，确保图标紧挨着日期，不再跑到屏幕最右边 */}
              <th className="py-2 px-3 w-[80px]"></th>
            </tr>
          </thead>

          {/* 表格内容 */}
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={5} className="py-10 text-center text-slate-400"><p className="text-[13px]">加载中...</p></td></tr>
            ) : recordings.length === 0 ? (
              <tr><td colSpan={5} className="py-10 text-center text-slate-400"><p className="text-[13px]">暂无录屏记录</p></td></tr>
            ) : (
              recordings.map((rec) => (
                <tr key={rec.id} className={`hover:bg-slate-50 transition-colors ${selectedIds.has(rec.id) ? 'bg-blue-50/40' : ''}`}>
                  <td className="py-2.5 px-3 text-center">
                    <button onClick={() => toggleSelect(rec.id)} className="text-slate-400 hover:text-blue-500 transition-colors mt-0.5">
                      {selectedIds.has(rec.id) ? <CheckSquare className="w-[15px] h-[15px] text-blue-500" /> : <Square className="w-[15px] h-[15px]" />}
                    </button>
                  </td>
                  
                  <td className="py-2.5 px-3">
                    {/* 这里的 div 只要加 truncate 即可，千万不要写死 max-w-xxx，它会根据上面 w-[45%] 的设置自动截断 */}
                    <div className="text-[13px] font-medium text-slate-700 truncate" title={rec.name}>
                      {rec.name}
                    </div>
                  </td>
                  
                  <td className="py-2.5 px-3 text-[12px] text-slate-500 whitespace-nowrap">{rec.sizeFormatted}</td>
                  <td className="py-2.5 px-3 text-[12px] text-slate-500 whitespace-nowrap">{formatDisplayDate(rec.date)}</td>
                  
                  <td className="py-2.5 px-3">
                    {/* 保持操作图标右对齐，由于列宽锁定了 80px，它们不会再漂移到很远的地方 */}
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => handleOpenInFolder(rec.path)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors" title="在文件夹中显示">
                        <Folder className="w-[15px] h-[15px]" />
                      </button>
                      <button onClick={() => deleteRecording(rec.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="删除">
                        <Trash2 className="w-[15px] h-[15px]" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
          </div>
        </div>
      </div>
    </div>
  )
}