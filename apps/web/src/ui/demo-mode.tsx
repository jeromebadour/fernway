"use client";
// The public console demo: the real console's pages over invented data. Inside it every action still opens its own
// dialog, but where it would change something it says so instead.
import { createContext, useContext, useRef, type ReactNode } from "react";
import { GClose, GNodes, GShield } from "./glyphs";

const Demo = createContext(false);
export const DemoMode = ({ children }: { children: ReactNode }) => <Demo.Provider value={true}>{children}</Demo.Provider>;
export const useDemo = () => useContext(Demo);

export function DemoSaid({ what }: { what: ReactNode }) {
  return <p className="op-ro" role="status"><GShield size={16} /><span><b>Read-only demo.</b> In a real account {what}</span></p>;
}

/** A button that only exists to show what it would do (Connect GHL, in the demo). */
export function DemoOnly({ label, title, what }: { label: string; title: string; what: ReactNode }) {
  const d = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="wb-go fm-btn" onClick={() => d.current?.showModal()}><GNodes size={16} />{label}</button>
      <dialog ref={d} className="fm-dialog" aria-label={title}>
        <h2>{title}</h2>
        <DemoSaid what={what} />
        <div className="fm-dialog-do"><button type="button" className="wb-ghost fm-btn" onClick={() => d.current?.close()}><GClose size={16} />Close</button></div>
      </dialog>
    </>
  );
}
