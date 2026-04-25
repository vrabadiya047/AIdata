"use client";

import { useState, useEffect } from "react";
import { X, Shield, Smartphone, CheckCircle, AlertCircle, Trash2 } from "lucide-react";

type SetupStage = "idle" | "qr" | "confirm" | "done";

interface MFASetupData { secret: string; uri: string; qr: string; }

export default function SecurityPanel({ onClose }: { onClose: () => void }) {
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);
  const [stage, setStage] = useState<SetupStage>("idle");
  const [setupData, setSetupData] = useState<MFASetupData | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadStatus(); }, []);

  async function loadStatus() {
    const res = await fetch("/api/auth/me");
    if (res.ok) {
      const d = await res.json();
      setMfaEnabled(!!d.mfa_enabled);
    }
  }

  async function startSetup() {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth/mfa/setup");
      if (!res.ok) throw new Error();
      setSetupData(await res.json());
      setStage("qr");
    } catch {
      setError("Failed to generate QR code.");
    } finally {
      setLoading(false);
    }
  }

  async function confirmCode() {
    if (code.length < 6) return;
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth/mfa/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        setError("Invalid code. Check your authenticator app and try again.");
        setCode("");
        return;
      }
      setStage("done");
      setMfaEnabled(true);
    } catch {
      setError("Verification failed.");
    } finally {
      setLoading(false);
    }
  }

  async function disableMFA() {
    if (!confirm("Disable two-factor authentication? Your account will be less secure.")) return;
    setLoading(true);
    try {
      await fetch("/api/auth/mfa/disable", { method: "DELETE" });
      setMfaEnabled(false);
      setStage("idle");
      setSetupData(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "480px", maxWidth: "95vw",
        background: "var(--surface)", border: "1px solid var(--b1)",
        borderRadius: "14px", overflow: "hidden",
        boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--b1)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Shield size={15} style={{ color: "var(--amber)" }} />
            <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--t1)" }}>Account Security</span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t3)", padding: "4px" }}>
            <X size={15} />
          </button>
        </div>

        <div style={{ padding: "24px" }}>
          {/* MFA status card */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 16px", borderRadius: "10px",
            background: mfaEnabled ? "rgba(34,197,94,0.06)" : "rgba(245,158,11,0.06)",
            border: `1px solid ${mfaEnabled ? "rgba(34,197,94,0.2)" : "rgba(245,158,11,0.2)"}`,
            marginBottom: "20px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <Smartphone size={18} style={{ color: mfaEnabled ? "#22c55e" : "var(--amber)" }} />
              <div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--t1)" }}>
                  Authenticator App (TOTP)
                </div>
                <div className="font-mono" style={{ fontSize: "10px", color: "var(--t3)", letterSpacing: "0.06em", marginTop: "2px" }}>
                  {mfaEnabled ? "ENABLED — 2FA ACTIVE" : "DISABLED — RECOMMENDED TO ENABLE"}
                </div>
              </div>
            </div>
            {mfaEnabled ? (
              <button onClick={disableMFA} disabled={loading} style={{ display: "flex", alignItems: "center", gap: "5px", padding: "6px 10px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "6px", color: "#f87171", fontSize: "11px", cursor: "pointer" }}>
                <Trash2 size={11} /> Disable
              </button>
            ) : (
              stage === "idle" && (
                <button onClick={startSetup} disabled={loading} style={{ padding: "6px 14px", background: "rgba(245,158,11,0.85)", border: "none", borderRadius: "6px", color: "var(--void)", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>
                  {loading ? "Loading…" : "Enable"}
                </button>
              )
            )}
          </div>

          {/* ── QR code stage ──────────────────────────────────────────────── */}
          {stage === "qr" && setupData && (
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: "13px", color: "var(--t2)", marginBottom: "16px", lineHeight: 1.6 }}>
                Scan this QR code with <strong style={{ color: "var(--t1)" }}>Google Authenticator</strong>, <strong style={{ color: "var(--t1)" }}>Authy</strong>, or any TOTP app.
              </p>
              <div style={{ display: "inline-block", padding: "12px", background: "#fff", borderRadius: "10px", marginBottom: "16px" }}>
                <img src={setupData.qr} alt="MFA QR code" style={{ width: "180px", height: "180px", display: "block" }} />
              </div>
              <div style={{ marginBottom: "16px" }}>
                <div className="font-mono" style={{ fontSize: "10px", color: "var(--t3)", marginBottom: "4px", letterSpacing: "0.08em" }}>MANUAL ENTRY KEY</div>
                <div style={{ padding: "8px 12px", background: "var(--raised)", borderRadius: "6px", border: "1px solid var(--b1)", fontSize: "13px", fontFamily: "monospace", color: "var(--amber)", letterSpacing: "0.12em" }}>
                  {setupData.secret.match(/.{1,4}/g)?.join(" ")}
                </div>
              </div>
              <button onClick={() => setStage("confirm")} style={{ width: "100%", padding: "11px", background: "rgba(245,158,11,0.85)", border: "none", borderRadius: "8px", color: "var(--void)", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                I&apos;ve scanned it →
              </button>
            </div>
          )}

          {/* ── Confirm code stage ─────────────────────────────────────────── */}
          {stage === "confirm" && (
            <div>
              <p style={{ fontSize: "13px", color: "var(--t2)", marginBottom: "16px", lineHeight: 1.6 }}>
                Enter the 6-digit code from your authenticator app to activate 2FA.
              </p>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "11px", color: "var(--t3)", marginBottom: "6px", fontFamily: "monospace", letterSpacing: "0.08em" }}>VERIFICATION CODE</label>
                <input
                  type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
                  value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
                  autoFocus placeholder="000000"
                  style={{
                    width: "100%", padding: "12px", background: "var(--raised)", border: "1px solid var(--b2)",
                    borderRadius: "8px", color: "var(--t1)", fontSize: "22px", fontFamily: "monospace",
                    letterSpacing: "0.4em", textAlign: "center", outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>
              {error && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 12px", borderRadius: "8px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", fontSize: "13px", color: "#f87171", marginBottom: "14px" }}>
                  <AlertCircle size={13} /> {error}
                </div>
              )}
              <button onClick={confirmCode} disabled={loading || code.length < 6} style={{ width: "100%", padding: "11px", background: code.length < 6 ? "rgba(245,158,11,0.4)" : "rgba(245,158,11,0.85)", border: "none", borderRadius: "8px", color: "var(--void)", fontSize: "13px", fontWeight: 600, cursor: code.length < 6 ? "not-allowed" : "pointer" }}>
                {loading ? "Verifying…" : "Activate 2FA"}
              </button>
              <button onClick={() => { setStage("qr"); setError(""); setCode(""); }} style={{ width: "100%", marginTop: "8px", padding: "8px", background: "none", border: "none", cursor: "pointer", color: "var(--t3)", fontSize: "12px" }}>
                ← Back to QR code
              </button>
            </div>
          )}

          {/* ── Done stage ─────────────────────────────────────────────────── */}
          {stage === "done" && (
            <div style={{ textAlign: "center", padding: "8px 0" }}>
              <CheckCircle size={40} style={{ color: "#22c55e", margin: "0 auto 12px" }} />
              <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--t1)", marginBottom: "6px" }}>
                Two-factor authentication enabled
              </div>
              <p style={{ fontSize: "13px", color: "var(--t2)", lineHeight: 1.6, maxWidth: "320px", margin: "0 auto 20px" }}>
                Your account is now protected with TOTP. You&apos;ll need your authenticator app at every login.
              </p>
              <button onClick={onClose} style={{ padding: "10px 28px", background: "rgba(245,158,11,0.85)", border: "none", borderRadius: "8px", color: "var(--void)", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
