'use client';

import { useState, FormEvent } from 'react';
import { Shield, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [requiresChange, setRequiresChange] = useState(false);

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

      if (!res.ok) {
        setError('Invalid username or password.');
        return;
      }

      const data = await res.json();
      if (data.requires_change) {
        setRequiresChange(true);
      } else {
        window.location.href = '/';
      }
    } catch {
      setError('Unable to reach server. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
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

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        background: 'var(--void)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Ambient glow */}
      <div style={{
        position: 'absolute', top: '-200px', left: '50%', transform: 'translateX(-50%)',
        width: '600px', height: '600px',
        background: 'radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '-150px', right: '-150px',
        width: '400px', height: '400px',
        background: 'radial-gradient(circle, rgba(34,211,238,0.04) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        width: '100%', maxWidth: '420px', padding: '0 24px',
        position: 'relative', zIndex: 1,
      }}>
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
          <div className="font-display" style={{
            fontSize: '22px', fontWeight: 800, letterSpacing: '0.08em',
            color: 'var(--amber)', textTransform: 'uppercase', marginBottom: '6px',
          }}>
            Sovereign
          </div>
          <div className="font-mono" style={{
            fontSize: '10px', letterSpacing: '0.14em',
            color: 'rgba(245,158,11,0.45)',
          }}>
            INTELLIGENCE SYSTEM · SECURE ACCESS
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--b2)',
          borderRadius: '16px',
          padding: '32px',
          boxShadow: '0 4px 40px rgba(0,0,0,0.4)',
        }}>
          {!requiresChange ? (
            <>
              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--t1)', marginBottom: '4px' }}>
                  Sign in
                </div>
                <div className="font-mono" style={{ fontSize: '10px', color: 'var(--t3)', letterSpacing: '0.06em' }}>
                  AUTHENTICATED SESSION REQUIRED
                </div>
              </div>

              <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--t3)', marginBottom: '6px', fontFamily: 'monospace', letterSpacing: '0.08em' }}>
                    USERNAME
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    autoFocus
                    autoComplete="username"
                    style={{
                      width: '100%', padding: '10px 14px',
                      background: 'var(--raised)', border: '1px solid var(--b2)',
                      borderRadius: '8px', color: 'var(--t1)', fontSize: '14px',
                      outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--t3)', marginBottom: '6px', fontFamily: 'monospace', letterSpacing: '0.08em' }}>
                    PASSWORD
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      style={{
                        width: '100%', padding: '10px 40px 10px 14px',
                        background: 'var(--raised)', border: '1px solid var(--b2)',
                        borderRadius: '8px', color: 'var(--t1)', fontSize: '14px',
                        outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      style={{
                        position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', padding: 0,
                      }}
                    >
                      {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '10px 12px', borderRadius: '8px',
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                    fontSize: '13px', color: '#f87171',
                  }}>
                    <AlertCircle size={14} />
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%', padding: '12px',
                    background: loading ? 'rgba(245,158,11,0.4)' : 'rgba(245,158,11,0.85)',
                    border: 'none', borderRadius: '9px',
                    color: 'var(--void)', fontSize: '13px', fontWeight: 600,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    letterSpacing: '0.04em',
                    transition: 'all 0.2s ease',
                    boxShadow: loading ? 'none' : '0 0 20px rgba(245,158,11,0.2)',
                  }}
                >
                  {loading ? 'AUTHENTICATING...' : 'AUTHENTICATE'}
                </button>
              </form>
            </>
          ) : (
            <>
              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <Lock size={16} style={{ color: 'var(--amber)' }} />
                  <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--t1)' }}>
                    Change Password
                  </div>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--t2)', marginTop: '6px' }}>
                  Your account requires a password change before continuing.
                </div>
              </div>

              <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--t3)', marginBottom: '6px', fontFamily: 'monospace', letterSpacing: '0.08em' }}>
                    NEW PASSWORD
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    autoFocus
                    autoComplete="new-password"
                    style={{
                      width: '100%', padding: '10px 14px',
                      background: 'var(--raised)', border: '1px solid var(--b2)',
                      borderRadius: '8px', color: 'var(--t1)', fontSize: '14px',
                      outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--t3)', marginBottom: '6px', fontFamily: 'monospace', letterSpacing: '0.08em' }}>
                    CONFIRM PASSWORD
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    style={{
                      width: '100%', padding: '10px 14px',
                      background: 'var(--raised)', border: '1px solid var(--b2)',
                      borderRadius: '8px', color: 'var(--t1)', fontSize: '14px',
                      outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                </div>

                {error && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '10px 12px', borderRadius: '8px',
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                    fontSize: '13px', color: '#f87171',
                  }}>
                    <AlertCircle size={14} />
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%', padding: '12px',
                    background: loading ? 'rgba(245,158,11,0.4)' : 'rgba(245,158,11,0.85)',
                    border: 'none', borderRadius: '9px',
                    color: 'var(--void)', fontSize: '13px', fontWeight: 600,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    letterSpacing: '0.04em',
                  }}
                >
                  {loading ? 'SAVING...' : 'SET NEW PASSWORD'}
                </button>
              </form>
            </>
          )}
        </div>

        <div className="font-mono" style={{
          textAlign: 'center', marginTop: '24px',
          fontSize: '9px', color: 'var(--t3)', letterSpacing: '0.08em',
        }}>
          SOVEREIGN INTELLIGENCE SYSTEM · PRIVATE · LOCAL INFERENCE
        </div>
      </div>
    </div>
  );
}
