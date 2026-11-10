// Before every web build: turns the git history (apps/web/changelog.txt, written from `git log` by the deploy script
// and CI, outside the image, since .git never enters it) into src/ui/changelog.json, which /changelog reads. Without
// the text file (a build with no history at hand) an existing JSON is kept, else an empty one is written.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const txt = resolve(web, "changelog.txt");
const out = resolve(web, "src/ui/changelog.json");

if (!existsSync(txt)) {
  const had = existsSync(out);
  if (!had) writeFileSync(out, "[]\n");
  console.log(`changelog: no history file, ${had ? "kept" : "wrote an empty"} ${out}`);
  process.exit(0);
}

// One record per commit (\x1e), fields split by \x1f: full hash, commit date (ISO), title, body.
const entries = readFileSync(txt, "utf8").split("\x1e").map((r) => r.replace(/^\n/, "")).filter((r) => r.trim()).map((r) => {
  const [hash, at, title, body = ""] = r.split("\x1f");
  // Bullets in the body ("- ..."), each with its wrapped lines joined; any other paragraph is kept as one note.
  const notes = [];
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (!t || /^[A-Za-z-]+: .+@/.test(t)) continue;
    if (t.startsWith("- ")) notes.push(t.slice(2));
    else if (notes.length && /^\s/.test(line)) notes[notes.length - 1] += ` ${t}`;
    else if (notes.length && !notes[notes.length - 1].endsWith(".")) notes[notes.length - 1] += ` ${t}`;
    else notes.push(t);
  }
  // The site credits its builder by his outward name only (a few early messages used another name for him).
  const outward = (t) => t.replace(/\bKami\b/g, "Jerome");
  return { hash: hash.trim(), at: at.trim(), title: outward(title.trim()), notes: notes.map(outward) };
});
writeFileSync(out, `${JSON.stringify(entries, null, 1)}\n`);
console.log(`changelog: ${entries.length} commits`);
