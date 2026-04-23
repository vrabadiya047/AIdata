"use client";

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: React.ReactNode;
  name?: string;
  inline?: boolean;
}

interface State {
  hasError: boolean;
  message: string;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || "Unknown error" };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary: ${this.props.name ?? "unknown"}]`, error, info.componentStack);
  }

  reset = () => this.setState({ hasError: false, message: "" });

  render() {
    if (!this.state.hasError) return this.props.children;

    const { name = "Component", inline = false } = this.props;

    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", textAlign: "center",
        padding: inline ? "16px" : "40px",
        margin: inline ? "8px" : "16px",
        background: "rgba(239,68,68,0.05)",
        border: "1px solid rgba(239,68,68,0.18)",
        borderRadius: "12px",
        flex: inline ? undefined : 1,
      }}>
        <AlertTriangle size={inline ? 18 : 24} style={{ color: "#ef4444", marginBottom: "10px" }} />
        <div style={{ fontSize: inline ? "13px" : "14px", fontWeight: 600, color: "var(--t1)", marginBottom: "5px" }}>
          {name} crashed
        </div>
        <div style={{
          fontSize: "11px", color: "var(--t3)",
          marginBottom: "14px", maxWidth: "320px", lineHeight: 1.5,
        }}>
          {this.state.message}
        </div>
        <button
          onClick={this.reset}
          style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "7px 16px", borderRadius: "8px", cursor: "pointer",
            background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)",
            color: "#ef4444", fontSize: "12px", fontWeight: 500,
          }}
        >
          <RefreshCw size={12} />
          Try again
        </button>
      </div>
    );
  }
}
