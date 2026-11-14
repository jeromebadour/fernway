// Small helps for the fields people type in, shared by every form (2026-11-10: the details make the site its own).

// Free mail providers: a typo in one of these is caught, and an address at one of them never suggests a company name.
const FREE = ["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com", "icloud.com", "me.com",
  "aol.com", "proton.me", "protonmail.com", "gmx.com", "gmx.de", "web.de", "yandex.com", "mail.com", "zoho.com", "hotmail.co.uk", "yahoo.co.uk"];
const TLD_FIX: Record<string, string> = { con: "com", cpm: "com", cmo: "com", ocm: "com", comm: "com", coom: "com", vom: "com", xom: "com", cm: "com", om: "com", ne: "net", nte: "net", orgg: "org", rog: "org" };

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
        i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1] ? d[i - 2]![j - 2]! + 1 : Infinity);
  return d[a.length]![b.length]!;
}

/** "lena@gmial.con" gives "lena@gmail.com"; a correct or unknown address gives null. */
export function emailTypo(email: string): string | null {
  const m = email.trim().toLowerCase().match(/^([^@\s]+)@([^@\s]+\.[a-z]{2,})$/);
  if (!m) return null;
  const [, user, domain] = m;
  if (FREE.includes(domain!)) return null;
  const near = FREE.map((f) => ({ f, d: distance(domain!, f) })).filter((x) => x.d > 0 && x.d <= (x.f.length > 9 ? 2 : 1)).sort((a, b) => a.d - b.d)[0];
  if (near) return `${user}@${near.f}`;
  const parts = domain!.split(".");
  const fix = TLD_FIX[parts.at(-1)!];
  return fix ? `${user}@${[...parts.slice(0, -1), fix].join(".")}` : null;
}

/** A company name read from a work address: "lena@northpine-dental.com" gives "Northpine Dental"; free mail gives null. */
export function companyFromEmail(email: string): string | null {
  const domain = email.trim().toLowerCase().split("@")[1];
  if (!domain || !domain.includes(".") || FREE.includes(domain) || emailTypo(email)) return null;
  const label = domain.split(".").at(-2) === "co" ? domain.split(".").at(-3) : domain.split(".")[0];
  if (!label || label.length < 2) return null;
  return label.split(/[-_]/).filter(Boolean).map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ");
}
