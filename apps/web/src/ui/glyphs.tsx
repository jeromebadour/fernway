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
// Docs: run it (quick start), the reference, a jump to a section on the page.
export const GPlay = (p: P) => (<S {...p}><rect x="2" y="2" width="16" height="16" /><path d="M8 6.5l5 3.5-5 3.5z" /></S>);
export const GBrackets = (p: P) => (<S {...p}><path d="M7 3H4v14h3M13 3h3v14h-3" /><path d="M8 10h4" /></S>);
export const GJump = (p: P) => (<S {...p}><path d="M4 3v8h11" /><path d="M12 8l3 3-3 3" /></S>);
// How delivery works: a test that proves a promise (a ticked box with its line of code).
export const GProof = (p: P) => (<S {...p}><rect x="2" y="2" width="16" height="16" /><path d="M5.5 10l2.5 2.5 5-5" /><path d="M5 15.5h10" /></S>);
// A link out to another site (the builder's own site, GitHub).
export const GOut = (p: P) => (<S {...p}><path d="M9 4H3v13h13v-6" /><path d="M11 2h7v7" /><path d="M18 2l-8 8" /></S>);
// The account area: each section and action its own glyph.
export const GUser = (p: P) => (<S {...p}><rect x="6" y="2" width="8" height="8" /><path d="M2 18v-3l3-3h10l3 3v3" /></S>);
export const GSliders = (p: P) => (<S {...p}><path d="M2 5h16M2 10h16M2 15h16" /><rect x="5" y="3" width="3" height="4" fill="currentColor" stroke="none" /><rect x="12" y="8" width="3" height="4" fill="currentColor" stroke="none" /><rect x="7" y="13" width="3" height="4" fill="currentColor" stroke="none" /></S>);
export const GLock = (p: P) => (<S {...p}><rect x="3" y="9" width="14" height="9" /><path d="M6 9V5h8v4" /><path d="M10 12v3" /></S>);
export const GDevice = (p: P) => (<S {...p}><rect x="2" y="3" width="16" height="10" /><path d="M7 17h6M10 13v4" /></S>);
export const GRecord = (p: P) => (<S {...p}><rect x="2" y="2" width="7" height="16" /><rect x="11" y="2" width="7" height="16" /><path d="M4 6h3M4 9h3M13 6h3M13 9h3" /></S>);
export const GTrash = (p: P) => (<S {...p}><path d="M3 5h14M8 5V2h4v3" /><path d="M5 5l1 13h8l1-13" /></S>);
export const GEye = (p: P) => (<S {...p}><path d="M1 10l4-5h10l4 5-4 5H5z" /><rect x="8" y="8" width="4" height="4" /></S>);
export const GEyeOff = (p: P) => (<S {...p}><path d="M1 10l4-5h10l4 5-4 5H5z" /><path d="M3 17L17 3" /></S>);
export const GCamera = (p: P) => (<S {...p}><rect x="2" y="5" width="16" height="12" /><path d="M7 5V3h6v2" /><rect x="7" y="8" width="6" height="6" /></S>);
export const GSignIn = (p: P) => (<S {...p}><path d="M11 3h6v14h-6" /><path d="M2 10h10M9 7l3 3-3 3" /></S>);
export const GSignUp = (p: P) => (<S {...p}><rect x="2" y="2" width="9" height="9" /><path d="M2 18v-2l3-3h6" /><path d="M15 11v7M11.5 14.5h7" /></S>);
export const GSave = (p: P) => (<S {...p}><path d="M3 3h11l3 3v11H3z" /><path d="M6 3v5h7V3" /><rect x="6" y="12" width="8" height="5" /></S>);
export const GMail = (p: P) => (<S {...p}><rect x="2" y="4" width="16" height="12" /><path d="M2 5l8 6 8-6" /></S>);
export const GSignOut = (p: P) => (<S {...p}><path d="M9 3H3v14h6" /><path d="M7 10h11M15 7l3 3-3 3" /></S>);
// Field kinds (each its own glyph, shown inside the field).
export const GBuilding = (p: P) => (<S {...p}><rect x="4" y="2" width="12" height="16" /><path d="M7 6h2M11 6h2M7 10h2M11 10h2M9 18v-4h2v4" /></S>);
export const GPhone = (p: P) => (<S {...p}><rect x="5" y="2" width="10" height="16" /><path d="M9 15h2" /></S>);
export const GGlobe = (p: P) => (<S {...p}><rect x="2" y="2" width="16" height="16" /><path d="M2 10h16M10 2c-3 3-3 13 0 16M10 2c3 3 3 13 0 16" /></S>);
export const GNote = (p: P) => (<S {...p}><path d="M3 3h14v10l-5 5H3z" /><path d="M12 18v-5h5" /><path d="M6 7h8M6 10h5" /></S>);
export const GCaps = (p: P) => (<S {...p}><path d="M10 3l7 7h-4v4H7v-4H3z" /><path d="M7 17h6" /></S>);
export const GClose = (p: P) => (<S {...p}><path d="M4 4l12 12M16 4L4 16" /></S>);
export const GCalendar = (p: P) => (<S {...p}><rect x="2" y="4" width="16" height="14" /><path d="M2 8h16M6 2v4M14 2v4" /><rect x="11" y="11" width="3" height="3" fill="currentColor" stroke="none" /></S>);
export const GStage = (p: P) => (<S {...p}><path d="M2 4h5l3 6-3 6H2l3-6z" /><path d="M11 4h4l3 6-3 6h-4l3-6z" /></S>);
export const GPlus = (p: P) => (<S {...p}><path d="M10 3v14M3 10h14" /></S>);
