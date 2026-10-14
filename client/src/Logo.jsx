import React from 'react';
/* ALIMS — "The Atlas Mark" (generated master artwork, circular-cropped).
   Lineage nodes form the A; the sun node crowns the apex (activation),
   the seal node marks verification, and ticked meridian ring = the atlas.
   Served from pre-resized exports so every surface stays crisp:
   nav/sidebar 128 · auth/hero 512 · favicon 64 (see public/logo/). */
export function LogoMark({ size = 42 }) {
  const src = size > 96 ? '/logo/logo-512.png' : size > 44 ? '/logo/logo-256.png' : '/logo/logo-128.png';
  return <img src={src} width={size} height={size} alt="ALIMS logo" style={{ borderRadius: '50%', display: 'block', flex: 'none', boxShadow: '2px 2px 0 rgba(19,17,9,.85)' }} />;
}
export default function Logo({ size = 42, dark = false, tagline = false }) {
  return (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
    <LogoMark size={size} />
    <span style={{ lineHeight: 1 }}>
      <span style={{ fontFamily: 'Fraunces, Georgia, serif', fontWeight: 650, fontSize: Math.round(size * 0.52), letterSpacing: '.07em', color: dark ? '#F4F0E1' : '#131109', display: 'block' }}>ALIMS</span>
      {tagline && <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: Math.max(8.5, size * 0.2), letterSpacing: '.22em', color: dark ? '#B9B096' : '#6B6350', display: 'block', marginTop: 4 }}>PRESERVE · CONNECT · ACTIVATE</span>}
    </span>
  </span>);
}
