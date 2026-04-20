// components/Sidebar.tsx
import { HardDrive, Shield, Settings, LogOut, Globe, Lock } from "lucide-react";

export default function Sidebar() {
  const workspaces = [
    { name: "Vivek Rameshbhai", type: "Public", icon: <Globe className="w-4 h-4 text-cyan-500" /> },
    { name: "Maity_task", type: "Private", icon: <Lock className="w-4 h-4 text-amber-500" /> },
  ];

  return (
    <aside className="w-64 border-r border-slate-800 bg-slate-900/40 p-4 flex flex-col">
      <div className="flex items-center gap-3 px-2 mb-10">
        <div className="p-2 bg-cyan-500/10 rounded-lg">
          <Shield className="w-6 h-6 text-cyan-500" />
        </div>
        <h1 className="font-bold text-lg tracking-tight">SOVEREIGN AI</h1>
      </div>

      <nav className="flex-1 space-y-1">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2 mb-3">Workspaces</p>
        {workspaces.map((ws) => (
          <button key={ws.name} className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-slate-800/50 transition-all group">
            <div className="flex items-center gap-3">
              {ws.icon}
              <span className="text-sm font-medium text-slate-300 group-hover:text-white">{ws.name}</span>
            </div>
          </button>
        ))}
      </nav>

      <div className="pt-4 border-t border-slate-800 space-y-1">
        <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 text-slate-400 text-sm">
          <Settings className="w-4 h-4" />
          Admin Console
        </button>
        <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-500/10 text-red-400 text-sm">
          <LogOut className="w-4 h-4" />
          Secure Logout
        </button>
      </div>
    </aside>
  );
}