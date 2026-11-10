// Pages 1 2 3 with Previous and Next, as real addresses (?page=3), for every paged list (BUILD-RULES 3.2 and 3.4).
// Hidden when everything fits; no Previous on page 1, no Next on the last.
import Link from "next/link";
import { GJump } from "./glyphs";

export const PAGE_SIZE = 15;

/** The page asked for, as a real page: anything broken lands on 1, anything past the end on the last. */
export function pageOf(raw: string | string[] | undefined, total: number) {
  const last = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, last) : 1;
}

export function Pager({ path, page, total }: { path: string; page: number; total: number }) {
  const last = Math.ceil(total / PAGE_SIZE);
  if (last <= 1) return null;
  const href = (p: number) => (p === 1 ? path : `${path}?page=${p}`);
  return (
    <nav className="pg" aria-label="Pages">
      {page > 1 && <Link className="pg-step" href={href(page - 1)}><GJump size={13} />Previous</Link>}
      {Array.from({ length: last }, (_, i) => i + 1).map((p) => (
        <Link key={p} href={href(p)} className="pg-n" aria-current={p === page ? "page" : undefined}>{p}</Link>
      ))}
      {page < last && <Link className="pg-step" href={href(page + 1)}>Next<GJump size={13} /></Link>}
    </nav>
  );
}
