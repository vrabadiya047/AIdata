import { Plus, MessageSquare, Settings, Shield, User } from "lucide-react";

export default function Sidebar() {
  const recentChats = [
    "Bridge Structural Specs",
    "Compliance Audit 2025",
    "Thermal Dynamics Report"
  ];

  return (
    <aside className="w-[260px] bg-[#0f0f0f] flex flex-col h-full text-sm text-gray-300">
      {/* Top Header */}
      <div className="p-3">
        <button className="flex items-center gap-3 text-white hover:bg-[#1f1f1f] w-full rounded-xl px-3 py-2.5 transition-colors">
          <div className="p-1 bg-cyan-500/10 rounded-lg">
            <Shield className="w-5 h-5 text-cyan-500" />
          </div>
          <span className="font-semibold text-[15px] tracking-tight">Sovereign AI</span>
        </button>
      </div>

      {/* New Chat Button */}
      <div className="px-3 mb-2 mt-1">
        <button className="flex items-center justify-between w-full bg-white text-black hover:bg-gray-200 rounded-xl px-3 py-2.5 transition-colors font-medium shadow-sm">
          <span className="text-[14px]">New chat</span>
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Chat History */}
      <div className="flex-1 overflow-y-auto px-3 space-y-6 mt-4">
        <div>
          <h3 className="text-[11px] font-semibold text-gray-500 px-3 mb-2 uppercase tracking-wider">Today</h3>
          <div className="space-y-0.5">
            <button className="flex items-center gap-3 w-full rounded-xl px-3 py-2 truncate text-white bg-[#1f1f1f]">
              <MessageSquare className="w-4 h-4 shrink-0 text-gray-400" />
              <span className="truncate text-[14px]">Database Integration</span>
            </button>
          </div>
        </div>

        <div>
          <h3 className="text-[11px] font-semibold text-gray-500 px-3 mb-2 uppercase tracking-wider">Previous 7 Days</h3>
          <div className="space-y-0.5">
            {recentChats.map((chat, i) => (
              <button key={i} className="flex items-center gap-3 w-full hover:bg-[#1f1f1f] rounded-xl px-3 py-2 truncate text-gray-300 transition-colors">
                <MessageSquare className="w-4 h-4 shrink-0 text-gray-500" />
                <span className="truncate text-[14px]">{chat}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Profile/Settings */}
      <div className="p-3 mt-auto">
        <button className="flex items-center gap-3 w-full hover:bg-[#1f1f1f] rounded-xl px-3 py-2.5 transition-colors text-gray-300">
          <Settings className="w-4 h-4 text-gray-400" />
          <span className="text-[14px]">Settings</span>
        </button>
        <button className="flex items-center gap-3 w-full hover:bg-[#1f1f1f] rounded-xl px-3 py-2.5 transition-colors mt-0.5">
          <div className="w-6 h-6 bg-gradient-to-tr from-cyan-600 to-blue-500 rounded-full flex items-center justify-center text-white text-[11px] font-bold shadow-sm">
            AD
          </div>
          <span className="font-medium text-white text-[14px]">Admin Console</span>
        </button>
      </div>
    </aside>
  );
}