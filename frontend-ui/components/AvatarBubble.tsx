'use client';

/**
 * Local, sovereign avatar rendering.
 *
 * Priority:
 *   1. Base64 photo uploaded by the user (stored in PostgreSQL, never sent to a CDN)
 *   2. Deterministic initials SVG generated entirely client-side — no network call,
 *      no Gravatar, no cloud service of any kind
 *
 * The SVG colour is derived from a djb2 hash of the username so each user always
 * gets the same hue across the whole UI.
 */

import { useMemo } from 'react';

const PALETTE: [string, string][] = [
  ['#F59E0B', '#B45309'], // amber (default)
  ['#22D3EE', '#0891b2'], // cyan
  ['#10B981', '#065f46'], // green
  ['#818cf8', '#4338ca'], // indigo
  ['#f472b6', '#be185d'], // pink
  ['#fb923c', '#c2410c'], // orange
];

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return Math.abs(h);
}

function getInitials(displayName: string, username: string): string {
  const name = (displayName || username || '?').trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/** Build a self-contained SVG data-URI avatar — works offline, no CDN. */
export function makeInitialsSVG(
  displayName: string,
  username: string,
  size = 96,
): string {
  const text = getInitials(displayName, username);
  const [c1, c2] = PALETTE[djb2(username) % PALETTE.length];
  const fontSize = size * 0.36;
  const r = size / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <circle cx="${r}" cy="${r}" r="${r}" fill="url(#g)"/>
  <text x="${r}" y="${r + fontSize * 0.36}" text-anchor="middle"
    font-family="system-ui,-apple-system,sans-serif"
    font-size="${fontSize}" font-weight="700" fill="rgba(255,255,255,0.95)"
    letter-spacing="-0.5">${text}</text>
</svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

interface AvatarBubbleProps {
  username: string;
  displayName?: string;
  avatarB64?: string;
  size?: number;
  style?: React.CSSProperties;
}

export default function AvatarBubble({
  username,
  displayName = '',
  avatarB64 = '',
  size = 32,
  style,
}: AvatarBubbleProps) {
  const src = useMemo(
    () => avatarB64 || makeInitialsSVG(displayName, username, size * 2),
    [avatarB64, displayName, username, size],
  );

  return (
    <img
      src={src}
      alt={displayName || username}
      width={size}
      height={size}
      style={{
        borderRadius: '50%',
        objectFit: 'cover',
        display: 'block',
        flexShrink: 0,
        ...style,
      }}
    />
  );
}
