'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, User, Shield, Smartphone, Monitor, Laptop, CheckCircle,
  AlertCircle, Trash2, Camera, Eye, EyeOff, LogOut, Clock,
  RefreshCw, MapPin,
} from 'lucide-react';
import { useSession } from '@/contexts/SessionContext';
import { makeInitialsSVG } from '@/components/AvatarBubble';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'profile' | 'security' | 'sessions';
type MFAStage = 'idle' | 'qr' | 'confirm' | 'done';

interface Profile {
  display_name: string;
  job_title: string;
  department: string;
  avatar_b64: string;
  username: string;
  role: string;
  mfa_enabled: boolean;
}

interface SessionEntry {
  session_id: string;
  user_agent: string;
  ip_address: string;
  created_at: string | null;
  last_seen_at: string | null;
}

interface SessionsData {
  sessions: SessionEntry[];
  current_session_id: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseUA(ua: string): { label: string; DeviceIcon: React.ElementType } {
  const mobile = /iPhone|Android.*Mobile|BlackBerry/i.test(ua);
  const tablet = /iPad|Android(?!.*Mobile)/i.test(ua);
  const os = /Windows/i.test(ua) ? 'Windows'
    : /Mac OS X/i.test(ua) ? 'macOS'
    : /Linux/i.test(ua) ? 'Linux'
    : /iOS/i.test(ua) ? 'iOS'
    : /Android/i.test(ua) ? 'Android' : 'Unknown OS';
  const browser = /Edg\//i.test(ua) ? 'Edge'
    : /OPR\//i.test(ua) ? 'Opera'
    : /Chrome\//i.test(ua) ? 'Chrome'
    : /Firefox\//i.test(ua) ? 'Firefox'
    : /Safari\//i.test(ua) ? 'Safari' : 'Browser';
  const DeviceIcon = tablet ? Laptop : mobile ? Smartphone : Monitor;
  return { label: `${browser} on ${os}`, DeviceIcon };
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'Unknown';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function passwordStrength(pwd: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  const labels = ['', 'Weak', 'Fair', 'Fair', 'Strong', 'Very strong'];
  const colors = ['', '#ef4444', '#f59e0b', '#f59e0b', '#22c55e', '#22c55e'];
  return { score, label: labels[score] || '', color: colors[score] || 'transparent' };
}

async function resizeAvatar(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 96; canvas.height = 96;
        const ctx = canvas.getContext('2d')!;
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2;
        const sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, 96, 96);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
}


// ─── Sub-components ───────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono" style={{
      fontSize: '10px', letterSpacing: '0.08em',
      color: 'var(--t3)', marginBottom: '6px', textTransform: 'uppercase',
    }}>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, readOnly, type = 'text' }: {
  value: string; onChange?: (v: string) => void;
  placeholder?: string; readOnly?: boolean; type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      readOnly={readOnly}
      onChange={e => onChange?.(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', padding: '9px 12px',
        background: readOnly ? 'var(--deep)' : 'var(--deep)',
        border: `1px solid ${readOnly ? 'var(--b1)' : 'var(--b2)'}`,
        borderRadius: '8px', color: readOnly ? 'var(--t3)' : 'var(--t1)',
        fontSize: '13px', outline: 'none', boxSizing: 'border-box',
        cursor: readOnly ? 'default' : 'text',
        transition: 'border-color 0.15s',
      }}
      onFocus={e => { if (!readOnly) e.currentTarget.style.borderColor = 'var(--amber-40)'; }}
      onBlur={e => { e.currentTarget.style.borderColor = readOnly ? 'var(--b1)' : 'var(--b2)'; }}
    />
  );
}

// ─── Profile Tab ──────────────────────────────────────────────────────────────

function ProfileTab({ profile, onProfileChange }: {
  profile: Profile;
  onProfileChange: (p: Profile) => void;
}) {
  const [form, setForm] = useState({
    display_name: profile.display_name,
    job_title: profile.job_title,
    department: profile.department,
    avatar_b64: profile.avatar_b64,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [hovAvatar, setHovAvatar] = useState(false);

  const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }));

  async function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('Image must be under 5 MB'); return; }
    const b64 = await resizeAvatar(file);
    set('avatar_b64', b64);
  }

  async function save() {
    setSaving(true); setError(''); setSaved(false);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      onProfileChange({ ...profile, ...form });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Failed to save profile.');
    } finally {
      setSaving(false);
    }
  }

  const avatarSrc = form.avatar_b64 || profile.avatar_b64;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Avatar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div
          style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}
          onMouseEnter={() => setHovAvatar(true)}
          onMouseLeave={() => setHovAvatar(false)}
          onClick={() => fileRef.current?.click()}
        >
          <div style={{
            width: '72px', height: '72px', borderRadius: '50%',
            overflow: 'hidden', border: '2px solid var(--b2)',
            transition: 'border-color 0.15s',
            ...(hovAvatar ? { borderColor: 'var(--amber-40)' } : {}),
          }}>
            <img
              src={avatarSrc || makeInitialsSVG(form.display_name || profile.display_name, profile.username, 144)}
              alt="avatar"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          {hovAvatar && (
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: 'rgba(0,0,0,0.55)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Camera size={18} style={{ color: '#fff' }} />
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarFile} />
        <div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--t1)', marginBottom: '3px' }}>
            {form.display_name || profile.username}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--t3)', marginBottom: '6px' }}>
            @{profile.username}
          </div>
          <span style={{
            padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 700,
            letterSpacing: '0.05em', textTransform: 'uppercase',
            background: profile.role === 'Admin' ? 'var(--amber-10)' : 'var(--green-10)',
            color: profile.role === 'Admin' ? 'var(--amber)' : 'var(--green)',
          }}>
            {profile.role}
          </span>
        </div>
      </div>

      {/* Fields */}
      <div>
        <Label>Display Name</Label>
        <Input value={form.display_name} onChange={v => set('display_name', v)} placeholder="Your full name" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <Label>Job Title</Label>
          <Input value={form.job_title} onChange={v => set('job_title', v)} placeholder="e.g. Geologist" />
        </div>
        <div>
          <Label>Department</Label>
          <Input value={form.department} onChange={v => set('department', v)} placeholder="e.g. Exploration" />
        </div>
      </div>

      <div>
        <Label>Username</Label>
        <Input value={profile.username} readOnly />
      </div>

      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '10px 12px', borderRadius: '8px',
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
          fontSize: '12px', color: '#f87171',
        }}>
          <AlertCircle size={13} /> {error}
        </div>
      )}

      <button
        onClick={save}
        disabled={saving}
        style={{
          padding: '10px 24px', borderRadius: '8px', cursor: saving ? 'wait' : 'pointer',
          background: saved ? 'rgba(34,197,94,0.85)' : 'rgba(245,158,11,0.85)',
          border: 'none', color: 'var(--void)',
          fontSize: '13px', fontWeight: 700,
          display: 'flex', alignItems: 'center', gap: '8px',
          alignSelf: 'flex-start',
          transition: 'background 0.2s',
        }}
      >
        {saved ? <><CheckCircle size={14} /> Saved</> : saving ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  );
}

// ─── Security Tab ─────────────────────────────────────────────────────────────

function SecurityTab({ mfaEnabled: initialMFAEnabled }: { mfaEnabled: boolean }) {
  const [mfaEnabled, setMfaEnabled] = useState(initialMFAEnabled);
  const [mfaStage, setMfaStage] = useState<MFAStage>('idle');
  const [setupData, setSetupData] = useState<{ secret: string; uri: string; qr: string } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaError, setMfaError] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);

  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const strength = passwordStrength(newPwd);

  async function changePassword() {
    if (newPwd !== confirmPwd) { setPwdMsg({ type: 'err', text: 'Passwords do not match.' }); return; }
    if (strength.score < 3) { setPwdMsg({ type: 'err', text: 'Password is too weak.' }); return; }
    setPwdSaving(true); setPwdMsg(null);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_password: newPwd }),
      });
      if (!res.ok) throw new Error();
      setPwdMsg({ type: 'ok', text: 'Password updated successfully.' });
      setNewPwd(''); setConfirmPwd('');
    } catch {
      setPwdMsg({ type: 'err', text: 'Failed to update password.' });
    } finally {
      setPwdSaving(false);
    }
  }

  async function startMFASetup() {
    setMfaLoading(true); setMfaError('');
    try {
      const res = await fetch('/api/auth/mfa/setup');
      if (!res.ok) throw new Error();
      setSetupData(await res.json());
      setMfaStage('qr');
    } catch { setMfaError('Failed to generate QR code.'); }
    finally { setMfaLoading(false); }
  }

  async function confirmMFA() {
    if (mfaCode.length < 6) return;
    setMfaLoading(true); setMfaError('');
    try {
      const res = await fetch('/api/auth/mfa/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: mfaCode }),
      });
      if (!res.ok) { setMfaError('Invalid code. Try again.'); setMfaCode(''); return; }
      setMfaStage('done'); setMfaEnabled(true);
    } catch { setMfaError('Verification failed.'); }
    finally { setMfaLoading(false); }
  }

  async function disableMFA() {
    if (!confirm('Disable two-factor authentication? Your account will be less secure.')) return;
    setMfaLoading(true);
    try {
      await fetch('/api/auth/mfa/disable', { method: 'DELETE' });
      setMfaEnabled(false); setMfaStage('idle'); setSetupData(null);
    } finally { setMfaLoading(false); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Change password */}
      <section>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--t1)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Shield size={14} style={{ color: 'var(--amber)' }} /> Change Password
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div>
            <Label>New Password</Label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPwd ? 'text' : 'password'}
                value={newPwd}
                onChange={e => setNewPwd(e.target.value)}
                placeholder="Min 8 chars, uppercase, number, symbol"
                style={{
                  width: '100%', padding: '9px 36px 9px 12px',
                  background: 'var(--deep)', border: '1px solid var(--b2)',
                  borderRadius: '8px', color: 'var(--t1)', fontSize: '13px',
                  outline: 'none', boxSizing: 'border-box',
                }}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--amber-40)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--b2)'}
              />
              <button
                onClick={() => setShowPwd(v => !v)}
                style={{
                  position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)',
                  display: 'flex', alignItems: 'center',
                }}
              >
                {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {newPwd && (
              <div style={{ marginTop: '8px' }}>
                <div style={{ display: 'flex', gap: '3px', marginBottom: '4px' }}>
                  {[1,2,3,4,5].map(i => (
                    <div key={i} style={{
                      flex: 1, height: '3px', borderRadius: '2px',
                      background: i <= strength.score ? strength.color : 'var(--b2)',
                      transition: 'background 0.2s',
                    }} />
                  ))}
                </div>
                <div style={{ fontSize: '11px', color: strength.color }}>{strength.label}</div>
              </div>
            )}
          </div>

          <div>
            <Label>Confirm Password</Label>
            <div style={{ position: 'relative' }}>
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPwd}
                onChange={e => setConfirmPwd(e.target.value)}
                placeholder="Re-enter password"
                style={{
                  width: '100%', padding: '9px 36px 9px 12px',
                  background: 'var(--deep)', border: `1px solid ${confirmPwd && confirmPwd !== newPwd ? 'rgba(239,68,68,0.5)' : 'var(--b2)'}`,
                  borderRadius: '8px', color: 'var(--t1)', fontSize: '13px',
                  outline: 'none', boxSizing: 'border-box',
                }}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--amber-40)'}
                onBlur={e => { e.currentTarget.style.borderColor = confirmPwd && confirmPwd !== newPwd ? 'rgba(239,68,68,0.5)' : 'var(--b2)'; }}
              />
              <button
                onClick={() => setShowConfirm(v => !v)}
                style={{
                  position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)',
                  display: 'flex', alignItems: 'center',
                }}
              >
                {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {pwdMsg && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '9px 12px', borderRadius: '7px', fontSize: '12px',
              background: pwdMsg.type === 'ok' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${pwdMsg.type === 'ok' ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
              color: pwdMsg.type === 'ok' ? '#22c55e' : '#f87171',
            }}>
              {pwdMsg.type === 'ok' ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
              {pwdMsg.text}
            </div>
          )}

          <button
            onClick={changePassword}
            disabled={pwdSaving || !newPwd || !confirmPwd}
            style={{
              padding: '9px 20px', borderRadius: '8px', cursor: pwdSaving || !newPwd || !confirmPwd ? 'not-allowed' : 'pointer',
              background: pwdSaving || !newPwd || !confirmPwd ? 'var(--b1)' : 'rgba(245,158,11,0.85)',
              border: 'none', color: pwdSaving || !newPwd || !confirmPwd ? 'var(--t3)' : 'var(--void)',
              fontSize: '13px', fontWeight: 600, alignSelf: 'flex-start',
            }}
          >
            {pwdSaving ? 'Updating…' : 'Update password'}
          </button>
        </div>
      </section>

      <div style={{ height: '1px', background: 'var(--b1)' }} />

      {/* MFA */}
      <section>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--t1)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Smartphone size={14} style={{ color: 'var(--cyan)' }} /> Two-Factor Authentication
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 14px', borderRadius: '10px',
          background: mfaEnabled ? 'rgba(34,197,94,0.06)' : 'rgba(245,158,11,0.06)',
          border: `1px solid ${mfaEnabled ? 'rgba(34,197,94,0.2)' : 'rgba(245,158,11,0.2)'}`,
          marginBottom: mfaStage !== 'idle' ? '16px' : 0,
        }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--t1)' }}>
              Authenticator App (TOTP)
            </div>
            <div className="font-mono" style={{ fontSize: '10px', color: 'var(--t3)', marginTop: '2px', letterSpacing: '0.06em' }}>
              {mfaEnabled ? 'ENABLED — 2FA ACTIVE' : 'DISABLED — RECOMMENDED TO ENABLE'}
            </div>
          </div>
          {mfaEnabled ? (
            <button onClick={disableMFA} disabled={mfaLoading} style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '6px 10px', background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px',
              color: '#f87171', fontSize: '11px', cursor: 'pointer',
            }}>
              <Trash2 size={11} /> Disable
            </button>
          ) : (
            mfaStage === 'idle' && (
              <button onClick={startMFASetup} disabled={mfaLoading} style={{
                padding: '6px 14px', background: 'rgba(245,158,11,0.85)',
                border: 'none', borderRadius: '6px', color: 'var(--void)',
                fontSize: '11px', fontWeight: 600, cursor: 'pointer',
              }}>
                {mfaLoading ? 'Loading…' : 'Enable 2FA'}
              </button>
            )
          )}
        </div>

        {mfaStage === 'qr' && setupData && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '13px', color: 'var(--t2)', marginBottom: '16px', lineHeight: 1.6 }}>
              Scan with <strong style={{ color: 'var(--t1)' }}>Google Authenticator</strong> or <strong style={{ color: 'var(--t1)' }}>Authy</strong>.
            </p>
            <div style={{ display: 'inline-block', padding: '12px', background: '#fff', borderRadius: '10px', marginBottom: '14px' }}>
              <img src={setupData.qr} alt="MFA QR" style={{ width: '168px', height: '168px', display: 'block' }} />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <div className="font-mono" style={{ fontSize: '10px', color: 'var(--t3)', marginBottom: '4px', letterSpacing: '0.08em' }}>MANUAL KEY</div>
              <div style={{ padding: '7px 12px', background: 'var(--raised)', borderRadius: '6px', border: '1px solid var(--b1)', fontSize: '13px', fontFamily: 'monospace', color: 'var(--amber)', letterSpacing: '0.12em' }}>
                {setupData.secret.match(/.{1,4}/g)?.join(' ')}
              </div>
            </div>
            <button onClick={() => setMfaStage('confirm')} style={{ width: '100%', padding: '10px', background: 'rgba(245,158,11,0.85)', border: 'none', borderRadius: '8px', color: 'var(--void)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
              I&apos;ve scanned it →
            </button>
          </div>
        )}

        {mfaStage === 'confirm' && (
          <div>
            <p style={{ fontSize: '13px', color: 'var(--t2)', marginBottom: '12px', lineHeight: 1.6 }}>
              Enter the 6-digit code from your authenticator app.
            </p>
            <input
              type="text" inputMode="numeric" maxLength={6}
              value={mfaCode} onChange={e => setMfaCode(e.target.value.replace(/\D/g, ''))}
              autoFocus placeholder="000000"
              style={{
                width: '100%', padding: '12px', background: 'var(--deep)',
                border: '1px solid var(--b2)', borderRadius: '8px',
                color: 'var(--t1)', fontSize: '24px', fontFamily: 'monospace',
                letterSpacing: '0.5em', textAlign: 'center', outline: 'none', boxSizing: 'border-box',
                marginBottom: '12px',
              }}
            />
            {mfaError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', borderRadius: '7px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', fontSize: '12px', color: '#f87171', marginBottom: '10px' }}>
                <AlertCircle size={13} /> {mfaError}
              </div>
            )}
            <button onClick={confirmMFA} disabled={mfaLoading || mfaCode.length < 6} style={{ width: '100%', padding: '10px', background: mfaCode.length < 6 ? 'rgba(245,158,11,0.4)' : 'rgba(245,158,11,0.85)', border: 'none', borderRadius: '8px', color: 'var(--void)', fontSize: '13px', fontWeight: 600, cursor: mfaCode.length < 6 ? 'not-allowed' : 'pointer' }}>
              {mfaLoading ? 'Verifying…' : 'Activate 2FA'}
            </button>
            <button onClick={() => { setMfaStage('qr'); setMfaError(''); setMfaCode(''); }} style={{ width: '100%', marginTop: '8px', padding: '8px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', fontSize: '12px' }}>
              ← Back to QR code
            </button>
          </div>
        )}

        {mfaStage === 'done' && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <CheckCircle size={40} style={{ color: '#22c55e', margin: '0 auto 10px' }} />
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--t1)', marginBottom: '6px' }}>2FA enabled</div>
            <p style={{ fontSize: '13px', color: 'var(--t2)', lineHeight: 1.6, maxWidth: '300px', margin: '0 auto' }}>
              Your account is now protected with TOTP. You&apos;ll need your authenticator app at every login.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Sessions Tab ─────────────────────────────────────────────────────────────

function SessionsTab() {
  const [data, setData] = useState<SessionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/sessions');
      if (res.ok) setData(await res.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function revoke(sessionId: string) {
    setRevoking(sessionId);
    try {
      await fetch(`/api/auth/sessions/${sessionId}`, { method: 'DELETE' });
      setData(d => d ? { ...d, sessions: d.sessions.filter(s => s.session_id !== sessionId) } : d);
    } finally { setRevoking(null); }
  }

  async function revokeAll() {
    if (!confirm('Sign out all other devices? Your current session will remain active.')) return;
    setRevokingAll(true);
    try {
      await fetch('/api/auth/sessions', { method: 'DELETE' });
      await load();
    } finally { setRevokingAll(false); }
  }

  const sessions = data?.sessions ?? [];
  const currentId = data?.current_session_id ?? null;
  const otherCount = sessions.filter(s => s.session_id !== currentId).length;

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px', color: 'var(--t3)' }}>
      <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite', marginRight: '10px' }} />
      Loading sessions…
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--t1)' }}>
            {sessions.length} active {sessions.length === 1 ? 'session' : 'sessions'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--t3)', marginTop: '2px' }}>
            Devices currently signed into your account
          </div>
        </div>
        {otherCount > 0 && (
          <button
            onClick={revokeAll}
            disabled={revokingAll}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '7px 12px', borderRadius: '7px', cursor: 'pointer',
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
              color: '#f87171', fontSize: '12px', fontWeight: 500,
            }}
          >
            <LogOut size={12} />
            {revokingAll ? 'Signing out…' : `Revoke ${otherCount} other`}
          </button>
        )}
      </div>

      {sessions.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '40px 20px',
          border: '1px dashed var(--b2)', borderRadius: '10px', color: 'var(--t3)',
          fontSize: '13px',
        }}>
          No active sessions found. This may happen if session tracking was not active at login.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {sessions.map(sess => {
            const { label, DeviceIcon } = parseUA(sess.user_agent);
            const isCurrent = sess.session_id === currentId;
            return (
              <div key={sess.session_id} style={{
                display: 'flex', alignItems: 'center', gap: '14px',
                padding: '12px 14px', borderRadius: '10px',
                background: isCurrent ? 'rgba(245,158,11,0.05)' : 'var(--raised)',
                border: `1px solid ${isCurrent ? 'rgba(245,158,11,0.2)' : 'var(--b1)'}`,
              }}>
                <div style={{
                  width: '38px', height: '38px', borderRadius: '9px', flexShrink: 0,
                  background: isCurrent ? 'var(--amber-10)' : 'var(--elevated)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: isCurrent ? 'var(--amber)' : 'var(--t2)',
                }}>
                  <DeviceIcon size={18} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--t1)' }}>
                      {label || 'Unknown device'}
                    </span>
                    {isCurrent && (
                      <span style={{
                        padding: '1px 7px', borderRadius: '4px',
                        background: 'var(--amber-10)', color: 'var(--amber)',
                        fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.05em',
                      }}>
                        CURRENT
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px', color: 'var(--t3)' }}>
                    {sess.ip_address && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <MapPin size={10} /> {sess.ip_address}
                      </span>
                    )}
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={10} /> {isCurrent ? 'Active now' : `Last seen ${timeAgo(sess.last_seen_at)}`}
                    </span>
                  </div>
                </div>

                {!isCurrent && (
                  <button
                    onClick={() => revoke(sess.session_id)}
                    disabled={revoking === sess.session_id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '5px',
                      padding: '6px 10px', borderRadius: '6px', cursor: 'pointer',
                      background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.15)',
                      color: '#f87171', fontSize: '11px', fontWeight: 500,
                      flexShrink: 0,
                    }}
                  >
                    <Trash2 size={11} />
                    {revoking === sess.session_id ? 'Revoking…' : 'Revoke'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export default function ProfilePanel({ onClose }: { onClose: () => void }) {
  const { session } = useSession();
  const [tab, setTab] = useState<Tab>('profile');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/profile')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setProfile(d); })
      .finally(() => setLoading(false));
  }, []);

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'profile',  label: 'Profile',  icon: User },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'sessions', label: 'Sessions', icon: Monitor },
  ];

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(5px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '680px', maxWidth: '96vw', maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--surface)', border: '1px solid var(--b2)',
          borderRadius: '16px', overflow: 'hidden',
          boxShadow: '0 32px 100px rgba(0,0,0,0.6), 0 4px 20px rgba(0,0,0,0.35)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--b1)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--raised)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '8px',
              background: 'linear-gradient(135deg, var(--amber) 0%, var(--amber-dark) 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <User size={14} style={{ color: '#fff' }} />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--t1)' }}>Account &amp; Security</div>
              <div style={{ fontSize: '11px', color: 'var(--t3)' }}>@{session?.username}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '28px', height: '28px', borderRadius: '7px',
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)',
              transition: 'all 0.12s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover-bg)'; e.currentTarget.style.color = 'var(--t1)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--t3)'; }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: '2px', padding: '10px 20px',
          borderBottom: '1px solid var(--b1)', flexShrink: 0,
          background: 'var(--surface)',
        }}>
          {tabs.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '7px',
                  padding: '7px 14px', borderRadius: '8px', cursor: 'pointer',
                  border: 'none',
                  background: active ? 'var(--raised)' : 'transparent',
                  color: active ? 'var(--t1)' : 'var(--t3)',
                  fontSize: '13px', fontWeight: active ? 600 : 500,
                  boxShadow: active ? '0 1px 2px rgba(0,0,0,0.15)' : 'none',
                  transition: 'all 0.12s ease',
                  position: 'relative',
                }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.color = 'var(--t1)'; e.currentTarget.style.background = 'var(--hover-bg)'; } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.color = 'var(--t3)'; e.currentTarget.style.background = 'transparent'; } }}
              >
                <Icon size={14} />
                {label}
                {active && (
                  <span style={{
                    position: 'absolute', bottom: '-11px', left: '50%',
                    transform: 'translateX(-50%)',
                    width: '24px', height: '2px', borderRadius: '1px',
                    background: 'var(--amber)',
                  }} />
                )}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 24px 28px' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px', color: 'var(--t3)' }}>
              <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite', marginRight: '10px' }} />
              Loading…
            </div>
          ) : (
            <>
              {tab === 'profile' && profile && (
                <ProfileTab profile={profile} onProfileChange={setProfile} />
              )}
              {tab === 'security' && (
                <SecurityTab mfaEnabled={profile?.mfa_enabled ?? false} />
              )}
              {tab === 'sessions' && (
                <SessionsTab />
              )}
            </>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
