import React from 'react';
/* Professional stroke icon system (24px grid, 1.8 stroke, round caps).
   No emoji anywhere in product UI — only these icons + typographic marks. */
const P = {
  'layout-grid': <><rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/></>,
  'folder': <><path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8A2 2 0 0 1 21 9.5v8A2 2 0 0 1 19 19.5H5a2 2 0 0 1-2-2z"/></>,
  'search': <><circle cx="11" cy="11" r="7"/><path d="m20.5 20.5-4.8-4.8"/></>,
  'network': <><circle cx="12" cy="5" r="2.6"/><circle cx="5" cy="19" r="2.6"/><circle cx="19" cy="19" r="2.6"/><path d="M10.6 7.2 6.4 16.6M13.4 7.2l4.2 9.4M7.6 19h8.8"/></>,
  'users': <><circle cx="9" cy="8.5" r="3.5"/><path d="M2.8 20c.7-3.2 3.1-5 6.2-5s5.5 1.8 6.2 5M16 5.4a3.5 3.5 0 0 1 0 6.6M17.8 15.4c1.9.6 3.1 2.1 3.6 4.6"/></>,
  'id-card': <><rect x="2.5" y="5" width="19" height="14" rx="2"/><circle cx="8.2" cy="11" r="2.2"/><path d="M5.2 16.6c.6-1.7 1.7-2.5 3-2.5s2.4.8 3 2.5M14.5 9.5H18M14.5 13H18"/></>,
  'badge-check': <><path d="M12 2.8 14.3 5l3.2-.3 1 3.1 2.9 1.4-1.2 3 1.2 3-2.9 1.4-1 3.1-3.2-.3L12 21.5 9.7 19.4l-3.2.3-1-3.1-2.9-1.4 1.2-3-1.2-3 2.9-1.4 1-3.1 3.2.3z"/><path d="m9 12.2 2.2 2.2L15.4 10"/></>,
  'clipboard': <><rect x="5" y="4.5" width="14" height="17" rx="2"/><path d="M9 4.5a3 3 0 0 1 6 0M9 11h6M9 15h4"/></>,
  'mail': <><rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/></>,
  'scale': <><path d="M12 3v18M7 21h10M12 6H5m7 0h7"/><path d="M5 6 2.8 12a3.2 3.2 0 0 0 4.4 0L5 6zM19 6l-2.2 6a3.2 3.2 0 0 0 4.4 0L19 6z"/></>,
  'landmark': <><path d="M3 9.5 12 3l9 6.5M4 21h16M5.5 9.5V18M10 9.5V18M14 9.5V18M18.5 9.5V18M3 21h18"/></>,
  'shield-check': <><path d="M12 3l7 2.8v5.4c0 4.4-2.9 7.4-7 9.3-4.1-1.9-7-4.9-7-9.3V5.8z"/><path d="m9 11.8 2.2 2.2 4-4.2"/></>,
  'lock': <><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 15v2"/></>,
  'rocket': <><path d="M12 15c5-3.5 6.5-8.5 6.5-12.5C14.5 3.5 9.5 5 6 10l-2.5 1.5L5 14c-.8 2-1 4.5-1 6 1.5 0 4-.2 6-1l2.5 1.5L14 18c1.8-1 3.5-2 5-3z" transform="scale(.92) translate(1,1)"/><circle cx="14.5" cy="9" r="1.8"/></>,
  'archive': <><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V9M10 13h4"/></>,
  'file-question': <><path d="M6 2.8h8L19 8v13.2H6z"/><path d="M13.5 3v5.5H19M12 12.2a1.9 1.9 0 1 1 1.3 3.2c-.7.3-1 .8-1 1.6M12 19.4h.01"/></>,
  'blocks': <><rect x="3.5" y="3.5" width="8" height="8" rx="1.5"/><rect x="12.5" y="12.5" width="8" height="8" rx="1.5"/><path d="M11.5 7.5h4a2 2 0 0 1 2 2v3M12.5 16.5h-4a2 2 0 0 1-2-2v-3"/></>,
  'graduation-cap': <><path d="M12 4 2.5 8.8 12 13.6l9.5-4.8z"/><path d="M6 11.2v5c0 1.7 2.7 3.2 6 3.2s6-1.5 6-3.2v-5M21.5 8.8V15"/></>,
  'presentation': <><rect x="3" y="3.5" width="18" height="12" rx="1.5"/><path d="M12 15.5V19m0 0-3.5 2M12 19l3.5 2M7.5 12l2.5-3 2.5 2 3.5-4"/></>,
  'flask': <><path d="M10 3h4M10.5 3v5.2L5 17.5A2 2 0 0 0 6.8 20.5h10.4A2 2 0 0 0 19 17.5L13.5 8.2V3M7.5 14h9"/></>,
  'building': <><rect x="5" y="3.5" width="14" height="17" rx="1"/><path d="M9 8h2M13 8h2M9 12h2M13 12h2M10.5 20.5v-3.5h3v3.5"/></>,
  'globe': <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.7 2.6 4 5.7 4 9s-1.3 6.4-4 9c-2.7-2.6-4-5.7-4-9s1.3-6.4 4-9z"/></>,
  'eye': <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></>,
  'bookmark': <><path d="M6.5 3.5h11V21L12 16.8 6.5 21z"/></>,
  'clock': <><circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.4 2"/></>,
  'inbox': <><path d="M3.5 13.5 5.8 4.5h12.4l2.3 9V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19z"/><path d="M3.5 13.5H8l1.2 2h5.6l1.2-2h4.5"/></>,
  'sprout': <><path d="M12 21v-8"/><path d="M12 13c0-3.5-2.8-5.5-7-5.5 0 4.2 2 7 5.5 7H12zM12 11c0-3.2 2.4-5 6-5 0 3.8-1.8 6-5 6h-1z"/></>,
  'compass': <><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/></>,
  'menu': <><path d="M4 7h16M4 12h16M4 17h16"/></>,
  'check': <><path d="m4.5 12.5 5 5 10-11"/></>,
  'asterisk': <><path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9"/></>,
  'database': <><ellipse cx="12" cy="5.5" rx="8" ry="2.8"/><path d="M4 5.5V18.5c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8V5.5M4 12c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8"/></>,
  'code': <><path d="m8 7-5.5 5L8 17M16 7l5.5 5L16 17M13.5 4l-3 16"/></>,
  'stamp': <><path d="M9.5 10.5a2.5 2.5 0 1 1 5 0c0 2-1 3-1 5.5h-3c0-2.5-1-3.5-1-5.5z"/><path d="M4.5 20.5a2 2 0 0 1 2-2h11a2 2 0 0 1 0 4h-11a2 2 0 0 1-2-2z" transform="translate(0,-1)"/></>,
};
const FILLED = {
  'star': 'M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.5L12 17.5l-5.8 3.05 1.1-6.5-4.7-4.6 6.5-.95z',
};
export default function Icon({ name, size = 20, strokeWidth = 1.8, style }) {
  if (FILLED[name]) return (<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={style}><path d={FILLED[name]} /></svg>);
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>{P[name] || P['asterisk']}</svg>);
}
export const ICON_NAMES = Object.keys(P);
