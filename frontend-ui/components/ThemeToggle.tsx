"use client";

import { Moon, Sun } from "lucide-react";
import { useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  const [hov, setHov] = useState(false);

  return (
    <button
      onClick={toggle}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title={`Switch to ${isDark ? "light" : "dark"} theme`}
      style={{
        width: "52px",
        height: "28px",
        borderRadius: "14px",
        background: isDark ? "rgba(245,158,11,0.12)" : "rgba(199,124,17,0.1)",
        border: `1px solid var(--amber-25)`,
        position: "relative",
        cursor: "pointer",
        transition: "all 0.25s ease",
        display: "flex",
        alignItems: "center",
        padding: "3px",
        flexShrink: 0,
        boxShadow: hov ? "0 0 12px rgba(245,158,11,0.15)" : "none",
      }}
    >
      {/* Track labels */}
      <Moon
        size={9}
        style={{
          position: "absolute",
          left: "6px",
          color: isDark ? "transparent" : "var(--t3)",
          transition: "color 0.2s",
          pointerEvents: "none",
        }}
      />
      <Sun
        size={9}
        style={{
          position: "absolute",
          right: "6px",
          color: isDark ? "var(--t3)" : "transparent",
          transition: "color 0.2s",
          pointerEvents: "none",
        }}
      />

      {/* Thumb */}
      <div
        style={{
          width: "20px",
          height: "20px",
          borderRadius: "50%",
          background: "linear-gradient(135deg, var(--amber) 0%, var(--amber-dark) 100%)",
          transition: "transform 0.28s cubic-bezier(0.34,1.56,0.64,1)",
          transform: isDark ? "translateX(0)" : "translateX(24px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 1px 6px rgba(0,0,0,0.35)",
          flexShrink: 0,
          zIndex: 1,
        }}
      >
        {isDark
          ? <Moon size={10} style={{ color: "#0a0a0b" }} />
          : <Sun size={10} style={{ color: "#0a0a0b" }} />
        }
      </div>
    </button>
  );
}
