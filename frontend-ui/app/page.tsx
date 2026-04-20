import Sidebar from "@/components/Sidebar";
import ChatInterface from "@/components/ChatInterface";

export default function Home() {
  const activeProject = "Vivek Rameshbhai";

  return (
    <div
      className="grain-overlay"
      style={{
        display: "flex",
        height: "100svh",
        width: "100%",
        background: "var(--void)",
        overflow: "hidden",
      }}
    >
      <Sidebar />

      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          position: "relative",
          overflow: "hidden",
          background: "var(--deep)",
        }}
      >
        {/* Ambient corner glow */}
        <div
          style={{
            position: "absolute",
            top: "-100px",
            right: "-100px",
            width: "400px",
            height: "400px",
            background:
              "radial-gradient(circle, rgba(245,158,11,0.04) 0%, transparent 70%)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "0",
            left: "30%",
            width: "500px",
            height: "300px",
            background:
              "radial-gradient(ellipse, rgba(34,211,238,0.025) 0%, transparent 70%)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />

        <ChatInterface activeProject={activeProject} />
      </main>
    </div>
  );
}