import React from "react";
import { NavLink, Outlet } from "react-router";
import { Settings, Keyboard, ListVideo, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";

export function Layout() {
  const handleClose = () => {
    toast("设置已保存", {
      description: "设置面板已关闭，工具条已恢复。",
      icon: <X className="w-4 h-4" />,
    });
  };

  const navItems = [
    { id: "general", label: "通用", icon: Settings, path: "/" },
    { id: "shortcuts", label: "快捷键", icon: Keyboard, path: "/shortcuts" },
    { id: "recordings", label: "录屏", icon: ListVideo, path: "/recordings" },
  ];

  return (
    <div className="flex h-[600px] w-[900px] bg-background overflow-hidden font-sans rounded-2xl border border-border shadow-2xl mx-auto my-auto self-center">
      {/* Sidebar */}
      <aside className="w-48 bg-sidebar border-r border-sidebar-border flex flex-col">
        <div className="p-5 flex items-center gap-3">
          <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center">
            <div className="w-3.5 h-3.5 bg-primary-foreground rounded-sm" />
          </div>
          <h1 className="text-lg font-bold tracking-tight">ZapRec</h1>
        </div>

        <nav className="flex-1 px-2 space-y-0.5">
          {navItems.map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors group ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                }`
              }
            >
              <item.icon className="w-4 h-4" />
              <span className="font-medium text-sm">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <p className="text-[10px] text-muted-foreground text-center opacity-60 uppercase tracking-widest">v1.3.824</p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-background">
        <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <h2 className="text-sm font-semibold">设置面板</h2>
          <button 
            onClick={handleClose}
            className="p-1.5 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
            title="关闭设置"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto p-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={window.location.pathname}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.15 }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
}
