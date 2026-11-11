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

/** The pages to show: the first, the last, and two either side of this one; a gap in between reads as "...". */
export function pageWindow(page: number, last: number): (number | "gap")[] {
  const keep = new Set([1, last, page - 2, page - 1, page, page + 1, page + 2].filter((p) => p >= 1 && p <= last));
  const out: (number | "gap")[] = [];
  let prev = 0;
  for (const p of [...keep].sort((a, b) => a - b)) {
    if (p - prev > 1) out.push("gap");
    out.push(p);
    prev = p;
  }
  return out;
}

export function Pager({ path, page, total, size = PAGE_SIZE, query = {} }: {
  path: string; page: number; total: number; size?: number; query?: Record<string, string | undefined>;
}) {
  const last = Math.ceil(total / size);
  if (last <= 1) return null;
  // The list's own filters ride along on every page link.
  const href = (p: number) => {
    const q = new URLSearchParams(Object.entries(query).filter((e): e is [string, string] => !!e[1]));
    if (p > 1) q.set("page", String(p));
    return q.size ? `${path}?${q}` : path;
  };
  return (
    <nav className="pg" aria-label="Pages">
      {page > 1 && <Link className="pg-step" href={href(page - 1)}><GJump size={13} />Previous</Link>}
      {pageWindow(page, last).map((p, i) => p === "gap"
        ? <span key={`g${i}`} className="pg-gap" aria-hidden="true">...</span>
        : <Link key={p} href={href(p)} className="pg-n" aria-current={p === page ? "page" : undefined}>{p}</Link>)}
      {page < last && <Link className="pg-step" href={href(page + 1)}>Next<GJump size={13} /></Link>}
    </nav>
  );
}
