import Sidebar from "@/components/Sidebar";
import ChatInterface from "@/components/ChatInterface";

export default function Home() {
  const activeProject = "Vivek Rameshbhai";

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#0f0f0f]">
      <Sidebar />
      <main className="flex-1 flex flex-col relative h-full bg-[#212121] rounded-l-2xl border border-white/5 shadow-2xl overflow-hidden mt-2 mb-2 mr-2">
        <ChatInterface activeProject={activeProject} />
      </main>
    </div>
  );
}