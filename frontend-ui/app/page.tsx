// app/page.tsx
import Sidebar from "@/components/Sidebar";
import ChatInterface from "@/components/ChatInterface";
import { Cpu, ShieldCheck } from "lucide-react";

export default function Home() {
  // In the future, we will get this from the URL or state
  const activeProject = "Vivek Rameshbhai";

  return (
    <>
      <Sidebar />
      <main className="flex-1 flex flex-col bg-slate-950 relative">
        <header className="h-16 border-b border-slate-800/50 flex items-center justify-between px-8">
          <div className="flex items-center gap-2 font-semibold text-slate-200">
            {activeProject}
          </div>
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-1.5 text-[10px] bg-slate-900 border border-slate-800 px-3 py-1 rounded-full text-slate-400">
               <Cpu className="w-3 h-3" /> Compute: Local GPU
             </div>
             <div className="flex items-center gap-1.5 text-[10px] bg-cyan-500/10 border border-cyan-500/20 px-3 py-1 rounded-full text-cyan-400">
               <ShieldCheck className="w-3 h-3" /> PII Shield: Active
             </div>
          </div>
        </header>

        {/* The Interactive AI Brain */}
        <ChatInterface activeProject={activeProject} />

        <p className="text-center text-[9px] text-slate-600 mb-4 uppercase tracking-[0.2em]">
          Sovereign Data Residency Confirmed
        </p>
      </main>
    </>
  );
}