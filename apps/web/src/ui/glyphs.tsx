// Waybill glyph set: 20px grid, 2px square-capped strokes, mitred corners, one filled "tag" accent.
type P = { size?: number };
const S = ({ size = 18, children }: P & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2}
    strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">{children}</svg>
);
export const GRoute = (p: P) => (<S {...p}><path d="M3 15h6V5h8" /><path d="M14 2l3 3-3 3" /><rect x="2" y="13" width="3" height="3" fill="currentColor" stroke="none" /></S>);
export const GScan = (p: P) => (<S {...p}><path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" /><path d="M6 10h8" /></S>);
export const GManifest = (p: P) => (<S {...p}><path d="M5 2h8l3 3v13H5z" /><path d="M8 8h5M8 11h5M8 14h3" /></S>);
export const GPrice = (p: P) => (<S {...p}><path d="M3 3h7l7 7-7 7-7-7z" /><rect x="6" y="6" width="2" height="2" fill="currentColor" stroke="none" /></S>);
export const GDepot = (p: P) => (<S {...p}><path d="M2 9l8-6 8 6v9H2z" /><path d="M7 18v-5h6v5" /></S>);
export const GKey = (p: P) => (<S {...p}><rect x="2" y="8" width="7" height="7" /><path d="M9 11h9M15 11v3M18 11v2" /></S>);
export const GCheck = (p: P) => (<S {...p}><path d="M3 10l5 5 9-10" /></S>);
export const GResend = (p: P) => (<S {...p}><path d="M16 7A7 7 0 1 0 17 12" /><path d="M17 3v4h-4" /></S>);
export const GHand = (p: P) => (<S {...p}><path d="M2 12h6l3 3h7" /><path d="M11 9h7" /><path d="M14 6l4 3-4 3" /></S>);
export const GFlow = (p: P) => (<S {...p}><rect x="2" y="3" width="5" height="5" /><rect x="13" y="12" width="5" height="5" /><path d="M7 5h4v9h2" /></S>);
export const GMark = ({ size = 30 }: P) => (
  <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true">
    <rect x="1" y="1" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M8 23V8h13M8 15h8" stroke="currentColor" strokeWidth="3" strokeLinecap="square" fill="none" />
    <path d="M18 5l4 3-4 3" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="square" />
  </svg>
);
// Works-with set (same grid and stroke; generic shapes, never the partners' own logos).
export const GFunnel = (p: P) => (<S {...p}><path d="M2 3h16l-6 7v7l-4-2v-5z" /></S>);
export const GBlocks = (p: P) => (<S {...p}><rect x="2" y="2" width="16" height="16" /><path d="M2 8h16M9 8v10" /></S>);
export const GWidget = (p: P) => (<S {...p}><rect x="2" y="4" width="16" height="12" /><path d="M6 8h8M6 12h5" /><rect x="14" y="11" width="2" height="2" fill="currentColor" stroke="none" /></S>);
export const GPackage = (p: P) => (<S {...p}><path d="M10 2l8 4v8l-8 4-8-4V6z" /><path d="M2 6l8 4 8-4M10 10v8" /></S>);
export const GNodes = (p: P) => (<S {...p}><rect x="2" y="8" width="4" height="4" /><rect x="14" y="3" width="4" height="4" /><rect x="14" y="13" width="4" height="4" /><path d="M6 10h4V5h4M10 10v5h4" /></S>);
export const GLoop = (p: P) => (<S {...p}><path d="M4 10a4 4 0 0 1 8 0a4 4 0 0 0 8 0" /><path d="M2 10h2" /></S>);
export const GCard = (p: P) => (<S {...p}><rect x="2" y="4" width="16" height="12" /><path d="M2 8h16M5 13h4" /></S>);
export const GGrid = (p: P) => (<S {...p}><rect x="3" y="2" width="14" height="16" /><path d="M3 7h14M3 12h14M9 2v16" /></S>);
export const GMenu = (p: P) => (<S {...p}><path d="M3 5h14M3 10h14M3 15h9" /></S>);
export const GHold = (p: P) => (<S {...p}><rect x="3" y="3" width="14" height="14" /><path d="M8 7v6M12 7v6" /></S>);
export const GClock = (p: P) => (<S {...p}><rect x="2" y="2" width="16" height="16" /><path d="M10 5v5h4" /></S>);
export const GCopy = (p: P) => (<S {...p}><rect x="6" y="6" width="11" height="11" /><path d="M3 13V3h10" /></S>);
export const GFind = (p: P) => (<S {...p}><rect x="2" y="2" width="11" height="11" /><path d="M13 13l5 5" /><path d="M5 7.5h5" /></S>);
export const GDown = (p: P) => (<S {...p}><path d="M3 3h14v6H3z" /><path d="M3 12h6M13 12h4v5H3v-2" /><path d="M10 10l2 4" /></S>);
export const GSilent = (p: P) => (<S {...p}><path d="M3 10h2M8 10h2M13 10h2" /><path d="M17 6v8" /></S>);
export const GShield = (p: P) => (<S {...p}><path d="M10 2l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V5z" /><path d="M7 10l2 2 4-4" /></S>);
