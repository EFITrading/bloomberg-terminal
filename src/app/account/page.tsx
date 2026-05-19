'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

const TABS = ['PROFILE', 'MEMBERSHIP', 'SOCIAL', 'SETTINGS'] as const;
type Tab = typeof TABS[number];

const FRIENDS = [
  { id: 1, name: 'TraderX_99', status: 'online', lastMsg: 'SPY breaking 520 soon 🔥', time: '2m', unread: 3 },
  { id: 2, name: 'OptionsWolf', status: 'online', lastMsg: 'Loaded calls on NVDA', time: '15m', unread: 1 },
  { id: 3, name: 'MarketMaker', status: 'away', lastMsg: 'That GEX analysis was 🔥', time: '1h', unread: 0 },
  { id: 4, name: 'AlgoKing', status: 'offline', lastMsg: 'Check the RRG signals', time: '3h', unread: 0 },
  { id: 5, name: 'FlowHunter', status: 'online', lastMsg: 'Big call sweep on AAPL', time: '5h', unread: 0 },
];

const DEMO_MSGS: Record<number, { from: string; text: string; time: string; mine: boolean }[]> = {
  1: [
    { from: 'TraderX_99', text: 'SPY breaking 520 soon 🔥', time: '10:32', mine: false },
    { from: 'me', text: 'Agree, GEX flip at 519 confirmed', time: '10:33', mine: true },
    { from: 'TraderX_99', text: 'You see that options flow?', time: '10:35', mine: false },
    { from: 'me', text: 'Yeah massive call sweeps', time: '10:35', mine: true },
    { from: 'TraderX_99', text: 'This is gonna rip 🚀', time: '10:36', mine: false },
  ],
  2: [
    { from: 'OptionsWolf', text: 'Loaded calls on NVDA 600c', time: '09:10', mine: false },
    { from: 'me', text: 'Big move, what expiry?', time: '09:11', mine: true },
    { from: 'OptionsWolf', text: 'June 20, high gamma', time: '09:12', mine: false },
  ],
};

const STATUS_COLOR: Record<string, string> = { online: '#22c55e', away: '#f59e0b', offline: '#6b7280' };

// ── Avatar style definitions — all circles, frame effects only ───────────
const AVATAR_STYLES = [
  { id: 'classic', name: 'EFI Classic', label: 'EFI', isEmoji: false, avatarBg: 'linear-gradient(160deg,#1a0800,#3d1500,#1a0800)', frame: 'solid', frameGrad: '#FF6600', glowColor: '#FF6600', animDur: '2s' },
  { id: 'blizzard', name: 'Blizzard', label: '❄', isEmoji: false, avatarBg: 'radial-gradient(circle at 50% 40%,#0a2a4a,#001133,#000816)', frame: 'ice', frameGrad: '#88d8ff', glowColor: '#88d8ff', animDur: '9s' },
  { id: 'wildfire', name: 'Wildfire', label: '🔥', isEmoji: true, avatarBg: 'linear-gradient(180deg,#ff7700,#cc2200,#200000)', frame: 'dual', frameGrad: 'conic-gradient(from 0deg,#ff5500,#ffaa00,#ff5500)', frameGrad2: 'conic-gradient(from 90deg,#ff2200,#ffdd00,#ff2200)', glowColor: '#ff5500', animDur: '1.8s' },
  { id: 'plasma', name: 'Plasma', label: '✦', isEmoji: false, avatarBg: 'radial-gradient(circle at 50% 40%,#7c3aed,#3b0764,#0d0018)', frame: 'conic', frameGrad: 'conic-gradient(from 0deg,#a855f7,#00ffff,#ff00ff,#00ffff,#a855f7)', glowColor: '#a855f7', animDur: '0.9s' },
  { id: 'storm', name: 'Storm', label: '⚡', isEmoji: false, avatarBg: 'radial-gradient(circle at 50% 40%,#1e40af,#0a1020,#000010)', frame: 'electric', frameGrad: '#00e5ff', glowColor: '#00e5ff', animDur: '0.12s' },
  { id: 'tsunami', name: 'Tsunami', label: '〜', isEmoji: false, avatarBg: 'linear-gradient(180deg,#00ccff,#0055cc,#001133)', frame: 'ripple', frameGrad: '#0099ff', glowColor: '#0099ff', animDur: '2s' },
  { id: 'abyss', name: 'Abyss', label: '◉', isEmoji: false, avatarBg: 'radial-gradient(circle at 40% 30%,#1e40af,#1e3a8a,#0a1020)', frame: 'conic', frameGrad: 'conic-gradient(from 0deg,#3b82f6,#0a1020,#60a5fa,#0a1020,#3b82f6)', glowColor: '#3b82f6', animDur: '5s' },
  { id: 'smoke', name: 'Smoke', label: '◌', isEmoji: false, avatarBg: 'radial-gradient(circle,#1a1a1a,#0a0a0a,#000)', frame: 'smoke', frameGrad: '#888888', glowColor: '#777777', animDur: '4s' },
  { id: 'neon', name: 'Neon', label: '◈', isEmoji: false, avatarBg: 'linear-gradient(160deg,#001a00,#004400,#001a00)', frame: 'neon', frameGrad: '#00ff88', glowColor: '#00ff88', animDur: '3s' },
  { id: 'galaxy', name: 'Galaxy', label: '✦', isEmoji: false, avatarBg: 'radial-gradient(circle,#0d0025,#1a0040,#05000f)', frame: 'conic', frameGrad: 'conic-gradient(from 0deg,#9333ea,#ec4899,#6366f1,#ec4899,#9333ea)', glowColor: '#9333ea', animDur: '7s' },
] as const;
type AvatarStyleId = typeof AVATAR_STYLES[number]['id'];

function AvatarStylePreview({ styleId, size = 68, selected, imageSrc }: { styleId: AvatarStyleId; size?: number; selected?: boolean; imageSrc?: string | null }) {
  const s = AVATAR_STYLES.find(a => a.id === styleId) ?? AVATAR_STYLES[0];
  const glowSz = selected ? 9 : 4;

  const Deco = () => {
    switch (styleId) {
      case 'classic': return (<>
        <circle cx="50" cy="50" r="51" fill="none" stroke="#FF6600" strokeWidth="2.5" />
        <polygon points="50,-8 53.5,-1 50,5 46.5,-1" fill="#FF6600" />
        <polygon points="50,95 53.5,102 50,108 46.5,102" fill="#FF6600" />
        <polygon points="-8,50 -1,53.5 5,50 -1,46.5" fill="#FF6600" />
        <polygon points="95,50 102,53.5 108,50 102,46.5" fill="#FF6600" />
      </>);

      case 'blizzard': return (<>
        <g style={{ animation: 'acct-spin 9s linear infinite', transformOrigin: '50px 50px' }}>
          {[0, 60, 120, 180, 240, 300].map((angle, i) => {
            const rad = (angle * Math.PI) / 180;
            const r1 = 50, r2 = 70 + (i % 2 === 0 ? 8 : 0);
            const w = 0.13;
            const x1 = 50 + r1 * Math.cos(rad), y1 = 50 + r1 * Math.sin(rad);
            const x2 = 50 + r2 * Math.cos(rad), y2 = 50 + r2 * Math.sin(rad);
            const lx = 50 + r1 * Math.cos(rad - w), ly = 50 + r1 * Math.sin(rad - w);
            const rx = 50 + r1 * Math.cos(rad + w), ry = 50 + r1 * Math.sin(rad + w);
            return <polygon key={i}
              points={`${lx},${ly} ${x2},${y2} ${rx},${ry}`}
              fill={i % 2 === 0 ? '#cceeff' : '#ffffff'}
              opacity={i % 2 === 0 ? 0.92 : 0.65}
              style={{ animation: `acct-twinkle ${1.8 + i * 0.35}s ease-in-out infinite`, animationDelay: `${i * 0.3}s` }} />;
          })}
        </g>
        <g style={{ animation: 'acct-spin-r 5s linear infinite', transformOrigin: '50px 50px' }}>
          {[30, 90, 150, 210, 270, 330].map((angle, i) => {
            const rad = (angle * Math.PI) / 180;
            const r = 57, x = 50 + r * Math.cos(rad), y = 50 + r * Math.sin(rad);
            return <polygon key={i}
              points={`${x},${y - 3.5} ${x + 1.5},${y - 1.5} ${x + 3.5},${y} ${x + 1.5},${y + 1.5} ${x},${y + 3.5} ${x - 1.5},${y + 1.5} ${x - 3.5},${y} ${x - 1.5},${y - 1.5}`}
              fill="#88d8ff" opacity={0.75}
              style={{ animation: `acct-twinkle ${1.2 + i * 0.22}s ease-in-out infinite`, animationDelay: `${i * 0.18}s` }} />;
          })}
        </g>
        <circle cx="50" cy="50" r="52" fill="none" stroke="#88d8ff" strokeWidth="1.5"
          strokeDasharray="5 7" style={{ animation: 'acct-spin 4s linear infinite', transformOrigin: '50px 50px' }} />
      </>);

      case 'wildfire': return (<>
        {[-52, -38, -22, -8, 8, 22, 38, 52].map((angle, i) => {
          const rad = ((angle - 90) * Math.PI) / 180;
          const r2 = 65 + (i === 3 || i === 4 ? 6 : 0);
          const x1 = 50 + 50 * Math.cos(rad), y1 = 50 + 50 * Math.sin(rad);
          const x2 = 50 + r2 * Math.cos(rad), y2 = 50 + r2 * Math.sin(rad);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={i % 2 === 0 ? '#ff5500' : '#ffbb00'} strokeWidth={i === 3 || i === 4 ? 3.5 : 2.5} strokeLinecap="round"
            style={{ animation: `acct-flicker ${0.33 + i * 0.08}s ease-in-out infinite`, animationDelay: `${i * 0.05}s`, transformOrigin: `${x1}px ${y1}px` }} />;
        })}
        <circle cx="50" cy="50" r="51" fill="none" stroke="#ff5500" strokeWidth="2" />
      </>);

      case 'plasma': return (<>
        <defs>
          <linearGradient id="dg_pl" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#a855f7" stopOpacity="0" />
            <stop offset="50%" stopColor="#00ffff" />
            <stop offset="100%" stopColor="#ff00ff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g style={{ animation: 'acct-spin 0.9s linear infinite', transformOrigin: '50px 50px' }}>
          <path d="M50,0 A50,50 0 0 1 100,50" fill="none" stroke="url(#dg_pl)" strokeWidth="4.5" strokeLinecap="round" />
          <path d="M100,50 A50,50 0 0 1 50,100" fill="none" stroke="#ff00ff" strokeWidth="2.5" strokeLinecap="round" opacity="0.45" />
        </g>
        <g style={{ animation: 'acct-spin-r 1.6s linear infinite', transformOrigin: '50px 50px' }}>
          <path d="M50,0 A50,50 0 0 0 0,50" fill="none" stroke="#00ffff" strokeWidth="3" strokeLinecap="round" strokeDasharray="28 72" />
        </g>
        <circle cx="50" cy="50" r="52" fill="none" stroke="#a855f7" strokeWidth="1.5" />
      </>);

      case 'storm': return (<>
        <defs>
          <filter id="dg_ef"><feGaussianBlur stdDeviation="0.8" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        {([[-14, -14], [114, -14], [-14, 114], [114, 114]] as [number, number][]).map(([bx, by], i) => {
          const sx = bx + (bx < 50 ? 22 : -22), sy = by + (by < 50 ? 22 : -22);
          const mx = bx + (bx < 50 ? 11 : -11), my = by + (by < 50 ? 5 : -5);
          const ex = mx + (bx < 50 ? 7 : -7), ey = my + (by < 50 ? 14 : -14);
          return <polyline key={i} points={`${sx},${sy} ${mx},${my} ${ex},${ey}`}
            fill="none" stroke="#00e5ff" strokeWidth="2.5" strokeLinecap="round"
            filter="url(#dg_ef)"
            style={{ animation: 'acct-electric 0.12s step-end infinite', animationDelay: `${i * 0.03}s` }} />;
        })}
        <g style={{ animation: 'acct-spin 0.27s linear infinite', transformOrigin: '50px 50px' }}>
          <path d="M50,0 A50,50 0 0 1 100,50" fill="none" stroke="#00e5ff" strokeWidth="4" strokeLinecap="round" strokeDasharray="14 86" />
          <path d="M0,50 A50,50 0 0 1 50,0" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeDasharray="7 93" opacity="0.6" />
        </g>
        <circle cx="50" cy="50" r="52" fill="none" stroke="#00e5ff" strokeWidth="1.5" />
      </>);

      case 'tsunami': return (<>
        <defs>
          <linearGradient id="dg_ts" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#0099ff" stopOpacity="0" />
            <stop offset="40%" stopColor="#00ccff" stopOpacity="0.9" />
            <stop offset="60%" stopColor="#0066cc" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#0099ff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M6,89 Q20,75 35,83 Q50,91 65,83 Q80,75 94,89"
          fill="none" stroke="url(#dg_ts)" strokeWidth="3.5" strokeLinecap="round"
          style={{ animation: 'acct-wave 2s ease-in-out infinite' }} />
        <path d="M0,102 Q18,87 36,95 Q50,101 64,95 Q82,87 100,102"
          fill="none" stroke="#0055aa" strokeWidth="2.5" strokeLinecap="round" opacity="0.55"
          style={{ animation: 'acct-wave 2.6s ease-in-out infinite', animationDelay: '0.45s' }} />
        <circle cx="50" cy="50" r="51" fill="none" stroke="#0099ff" strokeWidth="2" />
      </>);

      case 'abyss': return (<>
        <g style={{ animation: 'acct-spin 5s linear infinite', transformOrigin: '50px 50px' }}>
          <ellipse cx="50" cy="3" rx="5" ry="9" fill="#60a5fa" opacity="0.85" />
          <ellipse cx="97" cy="50" rx="9" ry="5" fill="#3b82f6" opacity="0.7" />
          <ellipse cx="50" cy="97" rx="5" ry="9" fill="#1e40af" opacity="0.9" />
          <ellipse cx="3" cy="50" rx="9" ry="5" fill="#60a5fa" opacity="0.65" />
        </g>
        <g style={{ animation: 'acct-spin-r 8.5s linear infinite', transformOrigin: '50px 50px' }}>
          <ellipse cx="80" cy="13" rx="3.5" ry="6.5" fill="#93c5fd" opacity="0.5" />
          <ellipse cx="87" cy="80" rx="6.5" ry="3.5" fill="#1d4ed8" opacity="0.6" />
          <ellipse cx="20" cy="87" rx="3.5" ry="6.5" fill="#3b82f6" opacity="0.55" />
          <ellipse cx="13" cy="20" rx="6.5" ry="3.5" fill="#60a5fa" opacity="0.45" />
        </g>
        <circle cx="50" cy="50" r="52" fill="none" stroke="#3b82f6" strokeWidth="1.5" />
      </>);

      case 'smoke': return (<>
        {[{ x: 38, del: 0, dur: 3.2 }, { x: 46, del: 0.55, dur: 2.9 }, { x: 54, del: 0.9, dur: 3.5 }, { x: 62, del: 0.25, dur: 3 }].map(({ x, del, dur }, i) => (
          <path key={i}
            d={`M${x},2 C${x - 6 + i * 2},${-9} ${x + 5 - i * 2},${-19} ${x - 3 + i},${-30}`}
            fill="none"
            stroke={`rgba(185,185,185,${0.65 - i * 0.1})`}
            strokeWidth={3.5 - i * 0.45}
            strokeLinecap="round"
            style={{ animation: `acct-smoke ${dur}s ease-out infinite`, animationDelay: `${del}s`, transformOrigin: `${x}px 2px` }} />
        ))}
        <circle cx="50" cy="50" r="52" fill="none" stroke="#666" strokeWidth="2" />
        <circle cx="50" cy="50" r="58" fill="none" stroke="rgba(140,140,140,0.28)" strokeWidth="1.5"
          style={{ animation: 'acct-spin 7s linear infinite', transformOrigin: '50px 50px' }} />
      </>);

      case 'neon': return (<>
        {([[-4, -4, 1, 1], [-4, 104, 1, -1], [104, -4, -1, 1], [104, 104, -1, -1]] as [number, number, number, number][]).map(([cx, cy, dx, dy], i) => (
          <polyline key={i}
            points={`${cx + dx * 22},${cy} ${cx},${cy} ${cx},${cy + dy * 22}`}
            fill="none" stroke="#00ff88" strokeWidth="4" strokeLinecap="round"
            style={{ animation: 'acct-hue 3s linear infinite', animationDelay: `${i * 0.75}s` }} />
        ))}
        <circle cx="50" cy="50" r="52" fill="none" stroke="#00ff88" strokeWidth="2"
          style={{ animation: 'acct-hue 3s linear infinite' }} />
      </>);

      case 'galaxy': return (<>
        <defs>
          <filter id="dg_gs"><feGaussianBlur stdDeviation="0.7" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <g style={{ animation: 'acct-spin 7s linear infinite', transformOrigin: '50px 50px' }}>
          {([[50, -11, '#9333ea', 5], [72, -5, '#ec4899', 3.5], [89, 22, '#6366f1', 4.5], [85, 65, '#9333ea', 3.5],
          [62, 90, '#ec4899', 5], [31, 85, '#9333ea', 3.5], [11, 58, '#6366f1', 4.5], [13, 15, '#ec4899', 3.5],
          ] as [number, number, string, number][]).map(([x, y, c, r], i) => (
            <g key={i} filter="url(#dg_gs)" style={{ animation: `acct-twinkle ${1.4 + i * 0.45}s ease-in-out infinite`, animationDelay: `${i * 0.22}s` }}>
              <polygon points={`${x},${y - r} ${x + r * 0.4},${y - r * 0.4} ${x + r},${y} ${x + r * 0.4},${y + r * 0.4} ${x},${y + r} ${x - r * 0.4},${y + r * 0.4} ${x - r},${y} ${x - r * 0.4},${y - r * 0.4}`} fill={c} />
            </g>
          ))}
        </g>
        <circle cx="50" cy="50" r="52" fill="none" stroke="#9333ea" strokeWidth="1.5"
          style={{ animation: 'acct-spin-r 14s linear infinite', transformOrigin: '50px 50px', strokeDasharray: '18 10 5 10' }} />
      </>);

      default: return null;
    }
  };

  return (
    <div style={{ width: size, height: size, position: 'relative', overflow: 'visible', flexShrink: 0, filter: `drop-shadow(0 0 ${glowSz}px ${s.glowColor})` }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: imageSrc ? 'transparent' : s.avatarBg, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
        {imageSrc
          ? <img src={imageSrc} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 35% 25%,rgba(255,255,255,0.14),transparent 60%)' }} />
            <span style={{ fontSize: size * (s.isEmoji ? 0.38 : 0.3), lineHeight: 1, position: 'relative', zIndex: 1, fontWeight: s.isEmoji ? 400 : 900, color: '#fff', fontFamily: "'JetBrains Mono',monospace" }}>{s.label}</span>
          </>
        }
      </div>
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none', zIndex: 2 }} viewBox="0 0 100 100">
        <Deco />
      </svg>
      <div style={{ position: 'absolute', bottom: 2, right: 2, width: Math.max(7, size * 0.13), height: Math.max(7, size * 0.13), borderRadius: '50%', background: '#22c55e', border: '2px solid #000', zIndex: 3 }} />
    </div>
  );
}

function AnimatedAvatar({ size = 120, styleId = 'classic' as AvatarStyleId, imageSrc }: { size?: number; styleId?: AvatarStyleId; imageSrc?: string | null }) {
  return <AvatarStylePreview styleId={styleId} size={size} selected imageSrc={imageSrc} />;
}

export default function AccountPage() {
  const router = useRouter();
  const [hasPasswordAuth, setHasPasswordAuth] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('PROFILE');
  const [quote, setQuote] = useState('The trend is your friend — until the bend at the end.');
  const [editingQuote, setEditingQuote] = useState(false);
  const [quoteDraft, setQuoteDraft] = useState('');
  const [activeChat, setActiveChat] = useState<number | null>(1);
  const [msgInput, setMsgInput] = useState('');
  const [messages, setMessages] = useState(DEMO_MSGS);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedAvatar, setSelectedAvatar] = useState<AvatarStyleId>(() =>
    (typeof window !== 'undefined' ? (localStorage.getItem('efi_avatar_style') as AvatarStyleId | null) : null) ?? 'classic'
  );
  const [avatarSrc, setAvatarSrc] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('efi_avatar_src') : null
  );
  const uploadRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { localStorage.setItem('efi_avatar_style', selectedAvatar); }, [selectedAvatar]);
  useEffect(() => {
    try {
      if (avatarSrc) localStorage.setItem('efi_avatar_src', avatarSrc);
      else localStorage.removeItem('efi_avatar_src');
    } catch {
      // localStorage quota exceeded — skip persisting avatar
    }
  }, [avatarSrc]);

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 128;
        const scale = Math.min(MAX / img.width, MAX / img.height, 1);
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        setAvatarSrc(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    const cookies = document.cookie.split(';');
    const authCookie = cookies.find(c => c.trim().startsWith('efi-auth='));
    setHasPasswordAuth(!!authCookie && authCookie.split('=')[1]?.trim() === 'authenticated');
    const t = setInterval(() => setCurrentTime(new Date()), 1000);

    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat, messages]);

  const handleLogout = () => {
    document.cookie = 'efi-auth=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    router.push('/login');
  };

  const handleSendMsg = (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgInput.trim() || activeChat === null) return;
    setMessages(prev => ({
      ...prev,
      [activeChat]: [...(prev[activeChat] || []), { from: 'me', text: msgInput.trim(), time: currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }), mine: true }],
    }));
    setMsgInput('');
  };

  const S = {
    page: { minHeight: '100vh', background: '#000', color: '#fff', fontFamily: "'JetBrains Mono','Space Mono',monospace", paddingTop: '0' } as React.CSSProperties,
    card: { background: '#060606', border: '1px solid rgba(255,102,0,0.18)', position: 'relative' as const },
    label: { fontSize: '13px', color: 'rgba(255,102,0,0.9)', letterSpacing: '0.2em', fontWeight: 700, textTransform: 'uppercase' as const, marginBottom: '5px' },
    value: { fontSize: '18px', color: '#fff', fontWeight: 600 },
    sectionHead: { fontSize: '14px', color: '#fff', letterSpacing: '0.2em', fontWeight: 700, textTransform: 'uppercase' as const, padding: '13px 0 8px', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: '15px' },
  };

  const activeTabStyle = (t: Tab): React.CSSProperties => ({
    padding: '13px 25px',
    fontSize: '14px',
    fontWeight: 700,
    letterSpacing: '0.18em',
    cursor: 'pointer',
    border: 'none',
    background: activeTab === t ? '#FF6600' : 'transparent',
    color: activeTab === t ? '#000' : 'rgba(255,255,255,0.85)',
    borderBottom: activeTab === t ? '2px solid #FF6600' : '2px solid transparent',
    transition: 'all 0.15s',
    fontFamily: 'inherit',
  });

  return (
    <div id="acct-page-root" style={S.page}>
      <style>{`
        /* Cancel the layout's 60px padding-top on <main> for this page only */
        main.main-content:has(#acct-page-root) { padding-top: 0 !important; }
        @keyframes acct-spin     { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes acct-spin-r   { from{transform:rotate(0deg)} to{transform:rotate(-360deg)} }
        @keyframes acct-breathe  { 0%,100%{opacity:0.8} 50%{opacity:1} }
        @keyframes acct-flicker  { 0%,100%{opacity:1;transform:scaleY(1)} 35%{opacity:0.72;transform:scaleY(1.14)} 65%{opacity:0.88;transform:scaleY(0.91)} }
        @keyframes acct-electric { 0%,100%{opacity:1} 50%{opacity:0.07} }
        @keyframes acct-wave     { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }
        @keyframes acct-smoke    { 0%{opacity:0.82;transform:translateY(0) scaleX(1)} 100%{opacity:0;transform:translateY(-24px) scaleX(1.7)} }
        @keyframes acct-twinkle  { 0%,100%{opacity:0.95;transform:scale(1)} 50%{opacity:0.2;transform:scale(0.45)} }
        @keyframes acct-hue      { 0%{filter:hue-rotate(0deg)} 100%{filter:hue-rotate(360deg)} }
        @keyframes acct-ripple   { 0%{transform:scale(1);opacity:0.8} 100%{transform:scale(2.2);opacity:0} }
        @keyframes acct-pulse    { 0%,100%{opacity:1;box-shadow:0 0 6px currentColor} 50%{opacity:0.5;box-shadow:none} }
        @keyframes acct-fadein   { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        .acct-tab-content { animation: acct-fadein 0.25s ease both; }
        .acct-row-hover:hover { background: rgba(255,102,0,0.04) !important; }
        .acct-btn-primary { background:#FF6600; border:1px solid #FF6600; color:#000; cursor:pointer; font-weight:800; font-family:inherit; letter-spacing:0.15em; transition:all 0.15s; }
        .acct-btn-primary:hover { background:#FF7A1A; box-shadow:0 0 20px rgba(255,102,0,0.35); }
        .acct-btn-ghost { background:transparent; border:1px solid rgba(255,255,255,0.15); color:#fff; cursor:pointer; font-weight:700; font-family:inherit; letter-spacing:0.12em; transition:all 0.15s; }
        .acct-btn-ghost:hover { border-color:rgba(255,102,0,0.4); color:#FF6600; }
        .acct-btn-danger { background:rgba(220,38,38,0.1); border:1px solid rgba(220,38,38,0.35); color:#f87171; cursor:pointer; font-weight:700; font-family:inherit; letter-spacing:0.12em; transition:all 0.15s; }
        .acct-btn-danger:hover { background:rgba(220,38,38,0.2); border-color:rgba(220,38,38,0.6); }
        .acct-input { background:#0a0a0a; border:1px solid rgba(255,255,255,0.1); color:#fff; font-family:inherit; font-size:13px; outline:none; transition:border-color 0.15s; }
        .acct-input:focus { border-color:rgba(255,102,0,0.5); box-shadow:0 0 0 1px rgba(255,102,0,0.12); }
        .acct-msg-input:focus { border-color:rgba(255,102,0,0.4); }
        .acct-scrollbar::-webkit-scrollbar { width:4px; }
        .acct-scrollbar::-webkit-scrollbar-track { background:transparent; }
        .acct-scrollbar::-webkit-scrollbar-thumb { background:rgba(255,102,0,0.2); border-radius:2px; }
      `}</style>

      {/* ── PAGE HEADER ── */}
      <div style={{ borderBottom: '1px solid rgba(255,102,0,0.12)', padding: '18px 40px 0', marginBottom: '0' }}>
        <div style={{ maxWidth: '1375px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '20px' }}>
          <div>
            <div style={{ fontSize: '13px', color: 'rgba(255,102,0,0.85)', letterSpacing: '0.25em', fontWeight: 700, marginBottom: '5px' }}>EFI TRADING INTELLIGENCE</div>
            <h1 style={{ fontSize: 'clamp(28px,3.5vw,38px)', fontWeight: 900, color: '#fff', letterSpacing: '-0.01em', fontFamily: "'Inter',sans-serif", lineHeight: 1 }}>
              ACCOUNT <span style={{ color: '#FF6600' }}>DASHBOARD</span>
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '13px', color: '#fff', letterSpacing: '0.15em' }}>SESSION</div>
              <div style={{ fontSize: '15px', color: hasPasswordAuth ? '#22c55e' : '#ef4444', fontWeight: 700, letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: hasPasswordAuth ? '#22c55e' : '#ef4444', display: 'inline-block', animation: 'acct-pulse 2s step-end infinite' }} />
                {hasPasswordAuth ? 'AUTHENTICATED' : 'UNAUTHENTICATED'}
              </div>
            </div>
            <button className="acct-btn-ghost" onClick={() => router.push('/market-overview')} style={{ padding: '10px 20px', fontSize: '13px' }}>
              ← TERMINAL
            </button>
          </div>
        </div>

        {/* ── TAB NAV ── */}
        <div style={{ display: 'flex', gap: '2px', maxWidth: '1375px', margin: '0 auto' }}>
          {TABS.map(t => (
            <button key={t} style={activeTabStyle(t)} onClick={() => setActiveTab(t)}>
              {t === 'PROFILE' && '⬡ '}
              {t === 'MEMBERSHIP' && '◈ '}
              {t === 'SOCIAL' && '◉ '}
              {t === 'SETTINGS' && '⚙ '}
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* ── CONTENT AREA ── */}
      <div style={{ maxWidth: '1375px', margin: '0 auto', padding: '35px 40px 75px' }} className="acct-tab-content" key={activeTab}>

        {/* ════════════════════════════════ PROFILE TAB ════════════════════════════════ */}
        {activeTab === 'PROFILE' && (
          <div style={{ display: 'grid', gridTemplateColumns: '560px 1fr', gap: '25px' }}>

            {/* Left — Identity card */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Avatar + name card */}
              <div style={{ ...S.card, padding: '35px 30px' }}>
                <div style={{ position: 'absolute', top: 0, left: '15%', right: '15%', height: '2px', background: 'linear-gradient(90deg,transparent,#FF6600,transparent)' }} />
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
                  <AnimatedAvatar size={120} styleId={selectedAvatar} imageSrc={avatarSrc} />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '25px', fontWeight: 900, color: '#fff', fontFamily: "'Inter',sans-serif", letterSpacing: '-0.01em' }}>EFI Member</div>
                    <div style={{ fontSize: '14px', color: '#FF6600', letterSpacing: '0.2em', fontWeight: 700, marginTop: '3px' }}>PREMIUM ACCESS</div>
                  </div>
                  {/* Discord-style avatar style selector */}
                  <div style={{ width: '100%' }}>
                    <div style={S.sectionHead}>AVATAR STYLE</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '12px' }}>
                      {AVATAR_STYLES.map(av => (
                        <div
                          key={av.id}
                          onClick={() => setSelectedAvatar(av.id as AvatarStyleId)}
                          style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '7px',
                            padding: '13px 8px 10px',
                            background: selectedAvatar === av.id ? 'rgba(255,102,0,0.1)' : 'rgba(255,255,255,0.02)',
                            border: `2px solid ${selectedAvatar === av.id ? '#FF6600' : 'rgba(255,255,255,0.07)'}`,
                            cursor: 'pointer', transition: 'all 0.15s',
                          }}
                        >
                          <AvatarStylePreview styleId={av.id as AvatarStyleId} size={68} selected={selectedAvatar === av.id} imageSrc={avatarSrc} />
                          <div style={{ fontSize: '10px', color: selectedAvatar === av.id ? '#FF6600' : '#fff', fontWeight: 700, letterSpacing: '0.04em', textAlign: 'center', lineHeight: 1.2 }}>{av.name}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <input
                    ref={uploadRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleAvatarUpload}
                  />
                  <button className="acct-btn-ghost" style={{ width: '100%', padding: '11px', fontSize: '13px' }} onClick={() => uploadRef.current?.click()}>
                    {avatarSrc ? '✓ CHANGE PHOTO' : 'UPLOAD AVATAR'}
                  </button>
                </div>
              </div>


            </div>

            {/* Right — Quote + details */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Trader Quote */}
              <div style={{ ...S.card, padding: '30px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                  <div style={{ fontSize: '14px', color: 'rgba(255,102,0,0.9)', letterSpacing: '0.2em', fontWeight: 700 }}>TRADER QUOTE</div>
                  {!editingQuote ? (
                    <button className="acct-btn-ghost" style={{ padding: '7px 15px', fontSize: '13px' }} onClick={() => { setQuoteDraft(quote); setEditingQuote(true); }}>EDIT</button>
                  ) : (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="acct-btn-primary" style={{ padding: '7px 15px', fontSize: '13px' }} onClick={() => { setQuote(quoteDraft); setEditingQuote(false); }}>SAVE</button>
                      <button className="acct-btn-ghost" style={{ padding: '7px 15px', fontSize: '13px' }} onClick={() => setEditingQuote(false)}>CANCEL</button>
                    </div>
                  )}
                </div>
                {editingQuote ? (
                  <textarea
                    className="acct-input"
                    value={quoteDraft}
                    onChange={e => setQuoteDraft(e.target.value)}
                    rows={3}
                    maxLength={140}
                    style={{ width: '100%', padding: '15px', resize: 'none', fontSize: '17px', lineHeight: 1.6, borderRadius: '2px' }}
                  />
                ) : (
                  <div style={{ position: 'relative', padding: '20px 25px', background: 'rgba(255,102,0,0.04)', borderLeft: '3px solid #FF6600' }}>
                    <span style={{ fontSize: '19px', color: '#fff', fontStyle: 'italic', lineHeight: 1.6, fontFamily: "'Inter',sans-serif" }}>
                      "{quote}"
                    </span>
                  </div>
                )}
                {editingQuote && (
                  <div style={{ textAlign: 'right', fontSize: '13px', color: '#fff', marginTop: '8px' }}>{quoteDraft.length}/140</div>
                )}
              </div>

              {/* Profile details */}
              <div style={{ ...S.card, padding: '30px' }}>
                <div style={S.sectionHead}>PROFILE DETAILS</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  {[
                    { label: 'DISPLAY NAME', value: 'EFI Member', editable: true },
                    { label: 'MEMBER TYPE', value: 'Premium Access', color: '#3b82f6' },
                    { label: 'ACCOUNT STATUS', value: hasPasswordAuth ? 'Active' : 'Inactive', color: hasPasswordAuth ? '#22c55e' : '#ef4444' },
                    { label: 'TIMEZONE', value: 'EST / UTC-5', editable: true },
                    { label: 'NOTIFICATION', value: 'Enabled', color: '#22c55e' },
                    { label: 'ACCESS LEVEL', value: 'Full Terminal', color: '#FF6600' },
                  ].map(({ label, value, color, editable }) => (
                    <div key={label} style={{ padding: '15px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={S.label}>{label}</div>
                      <div style={{ ...S.value, color: color || '#fff', display: 'flex', alignItems: 'center', gap: '7px' }}>
                        {color && <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />}
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick actions */}
              <div style={{ ...S.card, padding: '30px' }}>
                <div style={S.sectionHead}>QUICK ACTIONS</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '13px' }}>
                  <button className="acct-btn-ghost" style={{ padding: '14px', fontSize: '13px' }} onClick={() => setActiveTab('MEMBERSHIP')}>◈ MANAGE PLAN</button>
                  <button className="acct-btn-ghost" style={{ padding: '14px', fontSize: '13px' }} onClick={() => setActiveTab('SOCIAL')}>◉ FRIENDS &amp; DMs</button>
                  <button className="acct-btn-ghost" style={{ padding: '14px', fontSize: '13px' }} onClick={() => setActiveTab('SETTINGS')}>⚙ SETTINGS</button>
                  <button className="acct-btn-ghost" style={{ padding: '14px', fontSize: '13px' }} onClick={() => router.push('/market-overview')}>← TERMINAL</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════ MEMBERSHIP TAB ════════════════════════════════ */}
        {activeTab === 'MEMBERSHIP' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

            {/* Current Plan */}
            <div style={{ ...S.card, padding: '35px', gridColumn: '1 / -1', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: '10%', right: '10%', height: '2px', background: 'linear-gradient(90deg,transparent,#FF6600,transparent)' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at top right, rgba(255,102,0,0.06), transparent 60%)', pointerEvents: 'none' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <div style={{ fontSize: '13px', color: 'rgba(255,102,0,0.9)', letterSpacing: '0.2em', fontWeight: 700, marginBottom: '8px' }}>CURRENT PLAN</div>
                  <div style={{ fontSize: '35px', fontWeight: 900, color: '#fff', fontFamily: "'Inter',sans-serif", letterSpacing: '-0.02em' }}>
                    PREMIUM <span style={{ color: '#FF6600' }}>ACCESS</span>
                  </div>
                  <div style={{ fontSize: '15px', color: '#fff', marginTop: '5px', letterSpacing: '0.08em' }}>Full terminal access · All analytics · Priority data feeds</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '13px', color: '#fff', letterSpacing: '0.15em', marginBottom: '5px' }}>NEXT BILLING</div>
                  <div style={{ fontSize: '28px', fontWeight: 800, color: '#fff', fontFamily: "'Inter',sans-serif" }}>Jun 19, 2026</div>
                  <div style={{ fontSize: '25px', fontWeight: 900, color: '#FF6600', fontFamily: "'Inter',sans-serif", marginTop: '3px' }}>$49.99<span style={{ fontSize: '15px', color: '#fff', fontWeight: 400 }}>/mo</span></div>
                </div>
              </div>
              <div style={{ marginTop: '20px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {['Full Terminal Access', 'Real-Time Options Flow', 'GEX Analysis', 'AI Trade Scoring', 'RRG Screener', 'VIX/SPX Suite', 'Dealer Workbench', 'Priority Support'].map(f => (
                  <span key={f} style={{ padding: '5px 13px', background: 'rgba(255,102,0,0.08)', border: '1px solid rgba(255,102,0,0.2)', fontSize: '13px', color: '#fff', letterSpacing: '0.1em' }}>{f}</span>
                ))}
              </div>
            </div>

            {/* Payment Method */}
            <div style={{ ...S.card, padding: '30px' }}>
              <div style={S.sectionHead}>PAYMENT METHOD</div>
              <div style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: 40, height: 26, background: 'linear-gradient(135deg,#1a1a3e,#2d2d6e)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', color: '#fff', fontWeight: 800, letterSpacing: '0.05em' }}>VISA</div>
                  <div>
                    <div style={{ fontSize: '16px', color: '#fff', fontWeight: 600 }}>•••• •••• •••• 4242</div>
                    <div style={{ fontSize: '13px', color: '#fff', marginTop: '3px' }}>Expires 12/27</div>
                  </div>
                  <div style={{ marginLeft: 'auto', fontSize: '10px', color: '#22c55e', fontWeight: 700, letterSpacing: '0.1em' }}>● DEFAULT</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button className="acct-btn-primary" style={{ padding: '14px 20px', fontSize: '14px' }}>UPDATE PAYMENT METHOD</button>
                <button className="acct-btn-ghost" style={{ padding: '14px 20px', fontSize: '14px' }}>+ ADD NEW CARD</button>
              </div>
            </div>

            {/* Billing History */}
            <div style={{ ...S.card, padding: '30px' }}>
              <div style={S.sectionHead}>BILLING HISTORY</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                {[
                  { date: 'May 19, 2026', amount: '$49.99', status: 'PAID' },
                  { date: 'Apr 19, 2026', amount: '$49.99', status: 'PAID' },
                  { date: 'Mar 19, 2026', amount: '$49.99', status: 'PAID' },
                  { date: 'Feb 19, 2026', amount: '$49.99', status: 'PAID' },
                ].map(({ date, amount, status }) => (
                  <div key={date} className="acct-row-hover" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ fontSize: '15px', color: '#fff' }}>{date}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '13px', color: '#fff', fontWeight: 700 }}>{amount}</span>
                      <span style={{ fontSize: '9px', padding: '2px 7px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: '#22c55e', fontWeight: 700, letterSpacing: '0.1em' }}>{status}</span>
                    </div>
                  </div>
                ))}
              </div>
              <button className="acct-btn-ghost" style={{ width: '100%', padding: '11px', fontSize: '13px', marginTop: '15px' }}>VIEW ALL INVOICES</button>
            </div>

            {/* Plan Options */}
            <div style={{ ...S.card, padding: '30px' }}>
              <div style={S.sectionHead}>CHANGE PLAN</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  { name: 'BASIC', price: '$19.99', desc: 'Core terminal access', current: false },
                  { name: 'PREMIUM', price: '$49.99', desc: 'Full suite + AI tools', current: true },
                  { name: 'INSTITUTIONAL', price: '$199.99', desc: 'Multi-seat + API access', current: false },
                ].map(({ name, price, desc, current }) => (
                  <div key={name} style={{ padding: '14px 16px', background: current ? 'rgba(255,102,0,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${current ? 'rgba(255,102,0,0.35)' : 'rgba(255,255,255,0.07)'}`, cursor: current ? 'default' : 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: current ? '#FF6600' : '#fff', letterSpacing: '0.1em' }}>{name}</div>
                      <div style={{ fontSize: '13px', color: '#fff', marginTop: '3px' }}>{desc}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: current ? '#FF6600' : '#fff' }}>{price}<span style={{ fontSize: '11px', fontWeight: 400, color: '#fff' }}>/mo</span></div>
                      {current ? <div style={{ fontSize: '11px', color: '#FF6600', letterSpacing: '0.15em', fontWeight: 700, marginTop: '3px' }}>CURRENT</div> : <div style={{ fontSize: '11px', color: '#fff', letterSpacing: '0.1em', marginTop: '3px' }}>SELECT</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Danger zone */}
            <div style={{ ...S.card, padding: '30px', border: '1px solid rgba(220,38,38,0.2)' }}>
              <div style={{ ...S.sectionHead, color: '#f87171', borderBottomColor: 'rgba(239,68,68,0.1)' }}>DANGER ZONE</div>
              {!showCancelConfirm ? (
                <div>
                  <p style={{ fontSize: '15px', color: '#fff', marginBottom: '20px', lineHeight: 1.6 }}>Cancelling your subscription will remove access to all terminal features at the end of your current billing period.</p>
                  <button className="acct-btn-danger" style={{ width: '100%', padding: '15px', fontSize: '14px' }} onClick={() => setShowCancelConfirm(true)}>
                    CANCEL SUBSCRIPTION
                  </button>
                </div>
              ) : (
                <div style={{ padding: '20px', background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)' }}>
                  <p style={{ fontSize: '15px', color: '#fca5a5', marginBottom: '18px', fontWeight: 600 }}>Are you sure? You will lose access on Jun 19, 2026.</p>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="acct-btn-danger" style={{ flex: 1, padding: '13px', fontSize: '14px' }}>CONFIRM CANCEL</button>
                    <button className="acct-btn-ghost" style={{ flex: 1, padding: '13px', fontSize: '14px' }} onClick={() => setShowCancelConfirm(false)}>KEEP PLAN</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════════ SOCIAL TAB ════════════════════════════════ */}
        {activeTab === 'SOCIAL' && (
          <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '20px', height: 'calc(80vh - 240px)', minHeight: '480px' }}>

            {/* Friends list */}
            <div style={{ ...S.card, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px 11px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: '14px', color: 'rgba(255,102,0,0.9)', letterSpacing: '0.2em', fontWeight: 700, marginBottom: '13px' }}>TRADERS — {FRIENDS.filter(f => f.status === 'online').length} ONLINE</div>
                <input className="acct-input" placeholder="Search..." style={{ width: '100%', padding: '10px 15px', fontSize: '14px', borderRadius: '2px' }} />
              </div>
              <div className="acct-scrollbar" style={{ overflowY: 'auto', flex: 1 }}>
                {FRIENDS.map(friend => (
                  <div
                    key={friend.id}
                    onClick={() => setActiveChat(friend.id)}
                    style={{
                      padding: '11px 20px', cursor: 'pointer', transition: 'background 0.1s',
                      background: activeChat === friend.id ? 'rgba(255,102,0,0.08)' : 'transparent',
                      borderLeft: activeChat === friend.id ? '2px solid #FF6600' : '2px solid transparent',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      display: 'flex', alignItems: 'center', gap: '10px',
                    }}
                  >
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,102,0,0.1)', border: '1px solid rgba(255,102,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 800, color: '#FF6600' }}>
                        {friend.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ position: 'absolute', bottom: 0, right: 0, width: 9, height: 9, borderRadius: '50%', background: STATUS_COLOR[friend.status], border: '2px solid #060606', boxShadow: `0 0 4px ${STATUS_COLOR[friend.status]}` }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '15px', fontWeight: 700, color: '#fff', letterSpacing: '0.04em' }}>{friend.name}</span>
                        <span style={{ fontSize: '11px', color: '#fff' }}>{friend.time}</span>
                      </div>
                      <div style={{ fontSize: '13px', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '3px' }}>{friend.lastMsg}</div>
                    </div>
                    {friend.unread > 0 && (
                      <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#FF6600', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 800, color: '#000', flexShrink: 0 }}>{friend.unread}</div>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ padding: '11px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <button className="acct-btn-ghost" style={{ width: '100%', padding: '10px', fontSize: '13px' }}>+ ADD TRADER</button>
              </div>
            </div>

            {/* DM Chat */}
            <div style={{ ...S.card, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {activeChat !== null ? (
                <>
                  {/* Chat header */}
                  <div style={{ padding: '13px 25px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div style={{ position: 'relative' }}>
                      <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,102,0,0.1)', border: '1px solid rgba(255,102,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 800, color: '#FF6600' }}>
                        {FRIENDS.find(f => f.id === activeChat)?.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: '50%', background: STATUS_COLOR[FRIENDS.find(f => f.id === activeChat)?.status || 'offline'], border: '2px solid #060606' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff', letterSpacing: '0.05em' }}>{FRIENDS.find(f => f.id === activeChat)?.name}</div>
                      <div style={{ fontSize: '13px', color: STATUS_COLOR[FRIENDS.find(f => f.id === activeChat)?.status || 'offline'], letterSpacing: '0.1em', fontWeight: 600, textTransform: 'uppercase' }}>
                        {FRIENDS.find(f => f.id === activeChat)?.status}
                      </div>
                    </div>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                      <button className="acct-btn-ghost" style={{ padding: '8px 15px', fontSize: '13px' }}>PROFILE</button>
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="acct-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                    {(messages[activeChat] || []).map((msg, i) => (
                      <div key={i} style={{ display: 'flex', flexDirection: msg.mine ? 'row-reverse' : 'row', gap: '10px', alignItems: 'flex-end' }}>
                        {!msg.mine && (
                          <div style={{ width: 33, height: 33, borderRadius: '50%', background: 'rgba(255,102,0,0.1)', border: '1px solid rgba(255,102,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800, color: '#FF6600', flexShrink: 0 }}>
                            {msg.from.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div style={{ maxWidth: '65%' }}>
                          <div style={{
                            padding: '10px 15px',
                            background: msg.mine ? '#FF6600' : 'rgba(255,255,255,0.06)',
                            border: `1px solid ${msg.mine ? '#FF6600' : 'rgba(255,255,255,0.08)'}`,
                            borderRadius: msg.mine ? '8px 8px 2px 8px' : '8px 8px 8px 2px',
                            fontSize: '16px',
                            color: msg.mine ? '#000' : '#fff',
                            fontFamily: "'Inter',sans-serif",
                            fontWeight: msg.mine ? 600 : 400,
                            lineHeight: 1.5,
                          }}>{msg.text}</div>
                          <div style={{ fontSize: '11px', color: '#fff', marginTop: '4px', textAlign: msg.mine ? 'right' : 'left', letterSpacing: '0.08em' }}>{msg.time}</div>
                        </div>
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Message input */}
                  <form onSubmit={handleSendMsg} style={{ padding: '13px 25px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: '10px' }}>
                    <input
                      className="acct-input acct-msg-input"
                      value={msgInput}
                      onChange={e => setMsgInput(e.target.value)}
                      placeholder="Message..."
                      style={{ flex: 1, padding: '10px 15px', fontSize: '15px', borderRadius: '2px', fontFamily: "'Inter',sans-serif" }}
                    />
                    <button type="submit" className="acct-btn-primary" style={{ padding: '10px 22px', fontSize: '13px', flexShrink: 0 }}>
                      SEND →
                    </button>
                  </form>
                </>
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontSize: '24px', opacity: 0.2 }}>◉</div>
                  <p style={{ fontSize: '15px', color: '#fff', letterSpacing: '0.15em' }}>SELECT A TRADER TO MESSAGE</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════════ SETTINGS TAB ════════════════════════════════ */}
        {activeTab === 'SETTINGS' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

            {/* Security */}
            <div style={{ ...S.card, padding: '30px' }}>
              <div style={S.sectionHead}>SECURITY</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[
                  { label: 'Change Access Code', desc: 'Update your terminal password', action: 'UPDATE' },
                  { label: 'Two-Factor Auth', desc: 'Add TOTP authenticator app', action: 'ENABLE' },
                  { label: 'Active Sessions', desc: '1 active session (current)', action: 'VIEW' },
                  { label: 'Login History', desc: 'View recent access attempts', action: 'VIEW' },
                ].map(({ label, desc, action }) => (
                  <div key={label} className="acct-row-hover" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.01)' }}>
                    <div>
                      <div style={{ fontSize: '15px', color: '#fff', fontWeight: 600 }}>{label}</div>
                      <div style={{ fontSize: '13px', color: '#fff', marginTop: '3px' }}>{desc}</div>
                    </div>
                    <button className="acct-btn-ghost" style={{ padding: '8px 15px', fontSize: '13px', flexShrink: 0 }}>{action}</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Notifications */}
            <div style={{ ...S.card, padding: '30px' }}>
              <div style={S.sectionHead}>NOTIFICATIONS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                {[
                  { label: 'Price Alerts', sub: 'Get notified on price targets', on: true },
                  { label: 'Options Flow Alerts', sub: 'Large sweep notifications', on: true },
                  { label: 'Market Open/Close', sub: 'Session reminders', on: false },
                  { label: 'DM Messages', sub: 'Trader direct messages', on: true },
                  { label: 'News & Updates', sub: 'Platform updates & features', on: false },
                ].map(({ label, sub, on }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div>
                      <div style={{ fontSize: '15px', color: '#fff', fontWeight: 600 }}>{label}</div>
                      <div style={{ fontSize: '13px', color: '#fff', marginTop: '2px' }}>{sub}</div>
                    </div>
                    <div style={{
                      width: 38, height: 20, borderRadius: '10px',
                      background: on ? '#FF6600' : 'rgba(255,255,255,0.1)',
                      border: `1px solid ${on ? '#FF6600' : 'rgba(255,255,255,0.15)'}`,
                      cursor: 'pointer', position: 'relative', transition: 'all 0.2s', flexShrink: 0,
                    }}>
                      <div style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Appearance */}
            <div style={{ ...S.card, padding: '30px' }}>
              <div style={S.sectionHead}>APPEARANCE</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <div style={S.label}>ACCENT COLOR</div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    {['#FF6600', '#3b82f6', '#22c55e', '#a855f7', '#ec4899'].map(color => (
                      <div key={color} style={{ width: 35, height: 35, borderRadius: '50%', background: color, cursor: 'pointer', border: color === '#FF6600' ? '2px solid #fff' : '2px solid transparent', transition: 'all 0.15s' }} />
                    ))}
                  </div>
                </div>
                <div>
                  <div style={S.label}>FONT SIZE</div>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                    {['SM', 'MD', 'LG'].map((s, i) => (
                      <button key={s} className={i === 1 ? 'acct-btn-primary' : 'acct-btn-ghost'} style={{ flex: 1, padding: '9px', fontSize: '13px' }}>{s}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={S.label}>CHART STYLE</div>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                    {['CANDLE', 'LINE', 'BAR'].map((s, i) => (
                      <button key={s} className={i === 0 ? 'acct-btn-primary' : 'acct-btn-ghost'} style={{ flex: 1, padding: '9px', fontSize: '13px' }}>{s}</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Account actions */}
            <div style={{ ...S.card, padding: '30px' }}>
              <div style={S.sectionHead}>ACCOUNT ACTIONS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '13px' }}>
                <button className="acct-btn-ghost" style={{ padding: '15px 20px', fontSize: '14px', textAlign: 'left' }}>
                  ↓ EXPORT ACCOUNT DATA
                </button>
                <button className="acct-btn-ghost" style={{ padding: '15px 20px', fontSize: '14px', textAlign: 'left' }}>
                  ↺ RESET PREFERENCES
                </button>
                {!showLogoutConfirm ? (
                  <button className="acct-btn-danger" style={{ padding: '15px 20px', fontSize: '14px' }} onClick={() => setShowLogoutConfirm(true)}>
                    SIGN OUT OF TERMINAL
                  </button>
                ) : (
                  <div style={{ padding: '14px', background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)' }}>
                    <p style={{ fontSize: '14px', color: '#fca5a5', marginBottom: '13px', fontWeight: 600 }}>Confirm sign out?</p>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button className="acct-btn-danger" style={{ flex: 1, padding: '11px', fontSize: '13px' }} onClick={handleLogout}>SIGN OUT</button>
                      <button className="acct-btn-ghost" style={{ flex: 1, padding: '11px', fontSize: '13px' }} onClick={() => setShowLogoutConfirm(false)}>CANCEL</button>
                    </div>
                  </div>
                )}
                <div style={{ padding: '12px', background: 'rgba(220,38,38,0.04)', border: '1px solid rgba(220,38,38,0.1)', marginTop: '4px' }}>
                  <div style={{ fontSize: '13px', color: '#f87171', letterSpacing: '0.15em', fontWeight: 700, marginBottom: '8px' }}>DANGER ZONE</div>
                  <button className="acct-btn-danger" style={{ width: '100%', padding: '13px', fontSize: '13px', opacity: 0.7 }}>DELETE ACCOUNT</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── FOOTER ── */}
      <div style={{ borderTop: '1px solid rgba(255,102,0,0.08)', padding: '15px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', color: '#fff', letterSpacing: '0.15em' }}>© 2025 EFI TRADING INTELLIGENCE</span>
        <span style={{ fontSize: '13px', color: 'rgba(255,102,0,0.8)', letterSpacing: '0.15em' }}>TERMINAL v2.0</span>
      </div>
    </div>
  );
}
