'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { DEFAULT_TIMEZONE, TIMEZONE_OPTIONS, getUserTimezone, setUserTimezone } from '@/lib/userTimezone';

type NotifKey = 'price' | 'flow' | 'news';
const DEFAULT_NOTIFS: Record<NotifKey, boolean> = { price: true, flow: true, news: false };
const NOTIF_OPTIONS: { key: NotifKey; label: string; sub: string }[] = [
  { key: 'price', label: 'Price Alerts', sub: 'Notify me when price targets are hit' },
  { key: 'flow', label: 'Options Flow Alerts', sub: 'Notify me about large sweeps and blocks' },
  { key: 'news', label: 'News & Updates', sub: 'Platform announcements and new features' },
];

const DEFAULT_NAME = 'EFI Member';
const DEFAULT_QUOTE = 'The trend is your friend — until the bend at the end.';

const CSS = `
  .acct-card { background:#0a0a0a; border:1px solid rgba(255,255,255,0.08); border-radius:6px; }
  .acct-title { font-size:12px; font-weight:700; letter-spacing:0.18em; color:rgba(255,255,255,0.55); text-transform:uppercase; }
  .acct-field-label { font-size:11px; font-weight:700; letter-spacing:0.14em; color:rgba(255,255,255,0.5); text-transform:uppercase; margin-bottom:8px; display:block; }
  .acct-input { width:100%; background:#050505; border:1px solid rgba(255,255,255,0.12); color:#fff; font-family:inherit; font-size:14px; padding:10px 12px; border-radius:4px; outline:none; transition:border-color .15s, box-shadow .15s; }
  .acct-input:focus { border-color:#FF6600; box-shadow:0 0 0 3px rgba(255,102,0,0.12); }
  .acct-btn { font-family:inherit; font-size:12px; font-weight:700; letter-spacing:0.1em; padding:10px 18px; border-radius:4px; cursor:pointer; transition:all .15s; }
  .acct-btn-primary { background:#FF6600; border:1px solid #FF6600; color:#000; }
  .acct-btn-primary:hover { background:#ff7a1f; }
  .acct-btn-ghost { background:transparent; border:1px solid rgba(255,255,255,0.18); color:#fff; }
  .acct-btn-ghost:hover { border-color:#FF6600; color:#FF6600; }
  .acct-btn-danger { background:transparent; border:1px solid rgba(239,68,68,0.5); color:#f87171; }
  .acct-btn-danger:hover { background:rgba(239,68,68,0.12); }
  .acct-check { display:flex; align-items:center; gap:14px; padding:14px 0; cursor:pointer; border-bottom:1px solid rgba(255,255,255,0.06); }
  .acct-check:last-child { border-bottom:none; }
  .acct-check input { accent-color:#FF6600; width:18px; height:18px; cursor:pointer; }
  @media (max-width: 900px) { .acct-grid { grid-template-columns: 1fr !important; } .acct-pad { padding-left:16px !important; padding-right:16px !important; } }
`;

function Avatar({ src, name, size }: { src: string | null; name: string; size: number }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || 'EF';
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', border: '2px solid #FF6600', background: '#140800', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {src
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={src} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span style={{ fontSize: size * 0.36, fontWeight: 800, color: '#FF6600', fontFamily: "'Inter',sans-serif" }}>{initials}</span>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>{label}</span>
      <span style={{ fontSize: '14px', fontWeight: 600 }}>{children}</span>
    </div>
  );
}

export default function AccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const uploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const [hasPasswordAuth, setHasPasswordAuth] = useState(false);
  const [displayName, setDisplayName] = useState(DEFAULT_NAME);
  const [quote, setQuote] = useState(DEFAULT_QUOTE);
  const [editingQuote, setEditingQuote] = useState(false);
  const [quoteDraft, setQuoteDraft] = useState('');
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [notifs, setNotifs] = useState<Record<NotifKey, boolean>>(DEFAULT_NOTIFS);
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  // Preferences live in localStorage, so load them after hydration to keep SSR markup identical.
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  useEffect(() => {
    if (!open) return;
    const cookies = document.cookie.split(';').map(c => c.trim());
    const level = cookies.find(c => c.startsWith('efi-level='))?.split('=')[1];
    const auth = cookies.find(c => c.startsWith('efi-auth='))?.split('=')[1];
    setHasPasswordAuth(level === 'user' || level === 'admin' || auth === 'authenticated' || auth === 'admin');
    setConfirmSignOut(false);
  }, [open]);

  useEffect(() => {
    try {
      setNotifs({ ...DEFAULT_NOTIFS, ...JSON.parse(localStorage.getItem('efi_notifications') || '{}') });
    } catch { /* keep defaults */ }
    setDisplayName(localStorage.getItem('efi_display_name') || DEFAULT_NAME);
    setQuote(localStorage.getItem('efi_quote') || DEFAULT_QUOTE);
    setAvatarSrc(localStorage.getItem('efi_avatar_src'));
    setTimezone(getUserTimezone());
    setPrefsLoaded(true);
  }, []);

  useEffect(() => { if (prefsLoaded) localStorage.setItem('efi_display_name', displayName.trim() || DEFAULT_NAME); }, [displayName, prefsLoaded]);
  useEffect(() => { if (prefsLoaded) localStorage.setItem('efi_quote', quote); }, [quote, prefsLoaded]);
  useEffect(() => { if (prefsLoaded) localStorage.setItem('efi_notifications', JSON.stringify(notifs)); }, [notifs, prefsLoaded]);
  useEffect(() => {
    if (!prefsLoaded) return;
    try {
      if (avatarSrc) localStorage.setItem('efi_avatar_src', avatarSrc);
      else localStorage.removeItem('efi_avatar_src');
    } catch {
      // storage quota exceeded — skip persisting photo
    }
  }, [avatarSrc, prefsLoaded]);

  const handleTimezoneChange = (tz: string) => {
    setTimezone(tz);
    setUserTimezone(tz);
    window.location.reload();
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 256;
        const scale = Math.min(MAX / img.width, MAX / img.height, 1);
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        setAvatarSrc(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleLogout = () => {
    document.cookie = 'efi-auth=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    document.cookie = 'efi-level=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    router.push('/login');
  };

  const shownName = displayName.trim() || DEFAULT_NAME;

  return createPortal(
    <div
      id="acct-page-root"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ display: open ? 'flex' : 'none', position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(3px)', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: "'Inter',sans-serif", color: '#fff' }}
    >
      <style>{CSS}</style>

      <div role="dialog" aria-modal="true" aria-label="Account" style={{ width: '100%', maxWidth: '1040px', maxHeight: '100%', overflowY: 'auto', background: '#000', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', boxShadow: '0 24px 80px rgba(0,0,0,0.7)' }}>
      <header style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="acct-pad" style={{ padding: '20px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '11px', letterSpacing: '0.22em', color: '#FF6600', fontWeight: 700, marginBottom: '4px' }}>EFI TRADING INTELLIGENCE</div>
            <h1 style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.01em', margin: 0 }}>Account</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 600, color: hasPasswordAuth ? '#22c55e' : '#ef4444' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor' }} />
              {hasPasswordAuth ? 'Authenticated' : 'Not authenticated'}
            </span>
            <button className="acct-btn acct-btn-ghost" aria-label="Close" onClick={onClose} style={{ padding: '6px 12px', fontSize: '16px', lineHeight: 1 }}>✕</button>
          </div>
        </div>
      </header>

      <main className="acct-pad" style={{ padding: '24px 28px 28px' }}>
        <div className="acct-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'stretch' }}>

          {/* Profile summary */}
          <section className="acct-card" style={{ padding: '24px 28px', display: 'flex', alignItems: 'center', gap: '22px' }}>
            <Avatar src={avatarSrc} name={shownName} size={88} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '20px', fontWeight: 800, wordBreak: 'break-word' }}>{shownName}</div>
              <div style={{ display: 'inline-block', marginTop: '8px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.14em', color: '#FF6600', border: '1px solid rgba(255,102,0,0.4)', borderRadius: '999px', padding: '3px 12px' }}>
                PREMIUM ACCESS
              </div>
              <input ref={uploadRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />
              <div style={{ display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
                <button className="acct-btn acct-btn-ghost" style={{ padding: '7px 14px' }} onClick={() => uploadRef.current?.click()}>
                  {avatarSrc ? 'Change photo' : 'Upload photo'}
                </button>
                {avatarSrc && <button className="acct-btn acct-btn-ghost" style={{ padding: '7px 14px' }} onClick={() => setAvatarSrc(null)}>Remove</button>}
                {!confirmSignOut ? (
                  <button className="acct-btn acct-btn-danger" style={{ padding: '7px 14px' }} onClick={() => setConfirmSignOut(true)}>Sign out</button>
                ) : (
                  <>
                    <button className="acct-btn acct-btn-danger" style={{ padding: '7px 14px' }} onClick={handleLogout}>Confirm sign out</button>
                    <button className="acct-btn acct-btn-ghost" style={{ padding: '7px 14px' }} onClick={() => setConfirmSignOut(false)}>Cancel</button>
                  </>
                )}
              </div>
            </div>
          </section>

          <div style={{ display: 'contents' }}>

            {/* Quote */}
            <section className="acct-card" style={{ padding: '24px 28px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span className="acct-title">Trader Quote</span>
                {!editingQuote ? (
                  <button className="acct-btn acct-btn-ghost" style={{ padding: '6px 14px' }} onClick={() => { setQuoteDraft(quote); setEditingQuote(true); }}>Edit</button>
                ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="acct-btn acct-btn-primary" style={{ padding: '6px 14px' }} onClick={() => { setQuote(quoteDraft.trim() || DEFAULT_QUOTE); setEditingQuote(false); }}>Save</button>
                    <button className="acct-btn acct-btn-ghost" style={{ padding: '6px 14px' }} onClick={() => setEditingQuote(false)}>Cancel</button>
                  </div>
                )}
              </div>
              {editingQuote ? (
                <>
                  <textarea className="acct-input" rows={3} maxLength={140} value={quoteDraft} onChange={e => setQuoteDraft(e.target.value)} style={{ resize: 'none', lineHeight: 1.6 }} />
                  <div style={{ textAlign: 'right', fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: '6px' }}>{quoteDraft.length}/140</div>
                </>
              ) : (
                <blockquote style={{ margin: 0, padding: '4px 0 4px 18px', borderLeft: '3px solid #FF6600', fontSize: '17px', fontStyle: 'italic', lineHeight: 1.6 }}>
                  “{quote}”
                </blockquote>
              )}
            </section>

            {/* Account details */}
            <section className="acct-card" style={{ padding: '24px 28px' }}>
              <div className="acct-title" style={{ marginBottom: '20px' }}>Account Details</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '8px' }} className="acct-grid">
                <div>
                  <label className="acct-field-label" htmlFor="acct-name">Display name</label>
                  <input
                    id="acct-name"
                    className="acct-input"
                    value={displayName}
                    maxLength={30}
                    onChange={e => setDisplayName(e.target.value)}
                    onBlur={() => { if (!displayName.trim()) setDisplayName(DEFAULT_NAME); }}
                  />
                </div>
                <div>
                  <label className="acct-field-label" htmlFor="acct-tz">Timezone</label>
                  <select id="acct-tz" className="acct-input" value={timezone} onChange={e => handleTimezoneChange(e.target.value)}>
                    {TIMEZONE_OPTIONS.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                  </select>
                </div>
              </div>
              <Row label="Member type"><span style={{ color: '#3b82f6' }}>Premium Access</span></Row>
              <Row label="Account status"><span style={{ color: hasPasswordAuth ? '#22c55e' : '#ef4444' }}>{hasPasswordAuth ? 'Active' : 'Inactive'}</span></Row>
              <Row label="Access level"><span style={{ color: '#FF6600' }}>Full Terminal</span></Row>
            </section>

            {/* Notifications */}
            <section className="acct-card" style={{ padding: '24px 28px' }}>
              <div className="acct-title" style={{ marginBottom: '8px' }}>Notifications</div>
              {NOTIF_OPTIONS.map(({ key, label, sub }) => (
                <label key={key} className="acct-check">
                  <input type="checkbox" checked={notifs[key]} onChange={() => setNotifs(p => ({ ...p, [key]: !p[key] }))} />
                  <span>
                    <span style={{ display: 'block', fontSize: '14px', fontWeight: 600 }}>{label}</span>
                    <span style={{ display: 'block', fontSize: '12px', color: 'rgba(255,255,255,0.55)', marginTop: '2px' }}>{sub}</span>
                  </span>
                </label>
              ))}
            </section>
          </div>
        </div>
      </main>
      </div>
    </div>,
    document.body
  );
}
