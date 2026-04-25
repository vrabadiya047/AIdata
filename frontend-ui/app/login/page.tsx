'use client';

import { useState, FormEvent, useRef } from 'react';
import { Shield, Lock, Eye, EyeOff, AlertCircle, Smartphone } from 'lucide-react';

type Stage = 'credentials' | 'mfa' | 'change-password';

export default function LoginPage() {
  const [stage, setStage] = useState<Stage>('credentials');

  // credentials stage
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  // mfa stage
  const [mfaCode, setMfaCode] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const mfaInputRef = useRef<HTMLInputElement>(null);

  // change-password stage
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // ── Credentials submit ──────────────────────────────────────────────────────
  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) { setError('Invalid username or password.'); return; }
      const data = await res.json();
      if (data.mfa_required) {
        setMfaToken(data.mfa_token);
        setStage('mfa');
        setTimeout(() => mfaInputRef.current?.focus(), 80);
      } else if (data.requires_change) {
        setStage('change-password');
      } else {
        window.location.href = '/';
      }
    } catch {
      setError('Unable to reach server. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }

  // ── MFA submit ─────────────────────────────────────────────────────────────
  async function handleMFA(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: mfaCode.replace(/\s/g, ''), mfa_token: mfaToken }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? 'Invalid code. Please try again.');
        setMfaCode('');
        mfaInputRef.current?.focus();
        return;
      }
      const data = await res.json();
      if (data.requires_change) { setStage('change-password'); }
      else { window.location.href = '/'; }
    } catch {
      setError('Unable to reach server.');
    } finally {
      setLoading(false);
    }
  }

  // ── Change password submit ──────────────────────────────────────────────────
  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_password: newPassword }),
      });
      if (!res.ok) throw new Error();
      window.location.href = '/';
    } catch {
      setError('Failed to change password. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // ── Shared styles ───────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px',
    background: 'var(--raised)', border: '1px solid var(--b2)',
    borderRadius: '8px', color: 'var(--t1)', fontSize: '14px',
    outline: 'none', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '11px', color: 'var(--t3)',
    marginBottom: '6px', fontFamily: 'monospace', letterSpacing: '0.08em',
  };
  const submitStyle = (dis: boolean): React.CSSProperties => ({
    width: '100%', padding: '12px',
    background: dis ? 'rgba(245,158,11,0.4)' : 'rgba(245,158,11,0.85)',
    border: 'none', borderRadius: '9px',
    color: 'var(--void)', fontSize: '13px', fontWeight: 600,
    cursor: dis ? 'not-allowed' : 'pointer',
    letterSpacing: '0.04em', transition: 'all 0.2s ease',
    boxShadow: dis ? 'none' : '0 0 20px rgba(245,158,11,0.2)',
  });

  return (
    <div style={{
      minHeight: '100vh', width: '100%', background: 'var(--void)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Ambient glows */}
      <div style={{ position: 'absolute', top: '-200px', left: '50%', transform: 'translateX(-50%)', width: '600px', height: '600px', background: 'radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '-150px', right: '-150px', width: '400px', height: '400px', background: 'radial-gradient(circle, rgba(34,211,238,0.04) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ width: '100%', maxWidth: '420px', padding: '0 24px', position: 'relative', zIndex: 1 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '18px', margin: '0 auto 20px',
            background: 'linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(245,158,11,0.05) 100%)',
            border: '1px solid rgba(245,158,11,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 40px rgba(245,158,11,0.1)',
          }}>
            <Shield size={28} style={{ color: 'var(--amber)' }} />
          </div>
          <div className="font-display" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--amber)', textTransform: 'uppercase', marginBottom: '6px' }}>
            Sovereign
          </div>
          <div className="font-mono" style={{ fontSize: '10px', letterSpacing: '0.14em', color: 'rgba(245,158,11,0.45)' }}>
            INTELLIGENCE SYSTEM · SECURE ACCESS
          </div>
        </div>

        {/* Card */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--b2)', borderRadius: '16px', padding: '32px', boxShadow: '0 4px 40px rgba(0,0,0,0.4)' }}>

          {/* ── Stage: credentials ────────────────────────────────────────── */}
          {stage === 'credentials' && (
            <>
              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--t1)', marginBottom: '4px' }}>Sign in</div>
                <div className="font-mono" style={{ fontSize: '10px', color: 'var(--t3)', letterSpacing: '0.06em' }}>AUTHENTICATED SESSION REQUIRED</div>
              </div>
              <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>USERNAME</label>
                  <input type="text" value={username} onChange={e => setUsername(e.target.value)} required autoFocus autoComplete="username" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>PASSWORD</label>
                  <div style={{ position: 'relative' }}>
                    <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" style={{ ...inputStyle, paddingRight: '40px' }} />
                    <button type="button" onClick={() => setShowPass(!showPass)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', padding: 0 }}>
                      {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
                {error && <ErrorBanner msg={error} />}
                <button type="submit" disabled={loading} style={submitStyle(loading)}>
                  {loading ? 'AUTHENTICATING...' : 'AUTHENTICATE'}
                </button>
              </form>
            </>
          )}

          {/* ── Stage: MFA ────────────────────────────────────────────────── */}
          {stage === 'mfa' && (
            <>
              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <Smartphone size={16} style={{ color: 'var(--amber)' }} />
                  <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--t1)' }}>Two-Factor Authentication</div>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--t2)', marginTop: '6px', lineHeight: 1.5 }}>
                  Open your authenticator app and enter the 6-digit code for <strong style={{ color: 'var(--t1)' }}>{username}</strong>.
                </div>
              </div>
              <form onSubmit={handleMFA} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>AUTHENTICATOR CODE</label>
                  <input
                    ref={mfaInputRef}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9\s]{6,7}"
                    maxLength={7}
                    value={mfaCode}
                    onChange={e => setMfaCode(e.target.value.replace(/[^0-9]/g, ''))}
                    required
                    autoComplete="one-time-code"
                    placeholder="000000"
                    style={{
                      ...inputStyle,
                      fontSize: '24px', letterSpacing: '0.4em', textAlign: 'center',
                      fontFamily: 'monospace', fontWeight: 600,
                    }}
                  />
                </div>
                {error && <ErrorBanner msg={error} />}
                <button type="submit" disabled={loading || mfaCode.length < 6} style={submitStyle(loading || mfaCode.length < 6)}>
                  {loading ? 'VERIFYING...' : 'VERIFY CODE'}
                </button>
                <button type="button" onClick={() => { setStage('credentials'); setError(''); setMfaCode(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', fontSize: '12px', textAlign: 'center', padding: 0 }}>
                  ← Back to sign in
                </button>
              </form>
            </>
          )}

          {/* ── Stage: change password ────────────────────────────────────── */}
          {stage === 'change-password' && (
            <>
              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <Lock size={16} style={{ color: 'var(--amber)' }} />
                  <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--t1)' }}>Change Password</div>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--t2)', marginTop: '6px' }}>
                  Your account requires a password change before continuing.
                </div>
              </div>
              <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>NEW PASSWORD</label>
                  <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required autoFocus autoComplete="new-password" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>CONFIRM PASSWORD</label>
                  <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required autoComplete="new-password" style={inputStyle} />
                </div>
                {error && <ErrorBanner msg={error} />}
                <button type="submit" disabled={loading} style={submitStyle(loading)}>
                  {loading ? 'SAVING...' : 'SET NEW PASSWORD'}
                </button>
              </form>
            </>
          )}
        </div>

        <div className="font-mono" style={{ textAlign: 'center', marginTop: '24px', fontSize: '9px', color: 'var(--t3)', letterSpacing: '0.08em' }}>
          SOVEREIGN INTELLIGENCE SYSTEM · PRIVATE · LOCAL INFERENCE
        </div>
      </div>
    </div>
  );
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '10px 12px', borderRadius: '8px',
      background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
      fontSize: '13px', color: '#f87171',
    }}>
      <AlertCircle size={14} />
      {msg}
    </div>
  );
}
