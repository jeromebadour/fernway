// Before every web build: packs Fernway for WordPress (integrations/wordpress/plugin/fernway) into
// public/downloads/fernway-for-wordpress.zip, the file /docs/wordpress offers, and writes src/ui/plugin-zip.json (its
// version, size and SHA-256) for the page to show. Built from the repo every time, so the download is always the code
// CI tested. Every entry carries the same fixed date, so the same files always make the same bytes (and the same
// SHA-256). No library: a zip is a list of deflated files with a small directory at the end.
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const plugin = resolve(web, "../../integrations/wordpress/plugin/fernway");
const out = resolve(web, "public/downloads/fernway-for-wordpress.zip");
const info = resolve(web, "src/ui/plugin-zip.json");

const files = (dir) => readdirSync(dir).sort().flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? files(p) : [p];
});

// 1 January 2026, 00:00, in the zip's DOS date and time.
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

const locals = [];
const central = [];
let offset = 0;
for (const path of files(plugin)) {
  const name = Buffer.from(`fernway/${relative(plugin, path).split("\\").join("/")}`);
  const raw = readFileSync(path);
  const packed = deflateRawSync(raw, { level: 9 });
  const crc = crc32(raw) >>> 0;
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(8, 8);
  head.writeUInt16LE(DOS_TIME, 10); head.writeUInt16LE(DOS_DATE, 12); head.writeUInt32LE(crc, 14);
  head.writeUInt32LE(packed.length, 18); head.writeUInt32LE(raw.length, 22); head.writeUInt16LE(name.length, 26); head.writeUInt16LE(0, 28);
  const dir = Buffer.alloc(46);
  dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(0x0314, 4); dir.writeUInt16LE(20, 6); dir.writeUInt16LE(0x0800, 8); dir.writeUInt16LE(8, 10);
  dir.writeUInt16LE(DOS_TIME, 12); dir.writeUInt16LE(DOS_DATE, 14); dir.writeUInt32LE(crc, 16); dir.writeUInt32LE(packed.length, 20);
  dir.writeUInt32LE(raw.length, 24); dir.writeUInt16LE(name.length, 28); dir.writeUInt32LE((0o100644 << 16) >>> 0, 38); dir.writeUInt32LE(offset, 42);
  locals.push(head, name, packed);
  central.push(dir, name);
  offset += head.length + name.length + packed.length;
}
const dirBytes = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10);
end.writeUInt32LE(dirBytes.length, 12); end.writeUInt32LE(offset, 16);
const zip = Buffer.concat([...locals, dirBytes, end]);

const version = /^\s*\*\s*Version:\s*(\S+)/m.exec(readFileSync(join(plugin, "fernway.php"), "utf8"))?.[1];
if (!version) throw new Error("plugin-zip: fernway.php has no Version header");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, zip);
writeFileSync(info, `${JSON.stringify({ version, bytes: zip.length, files: central.length / 2, sha256: createHash("sha256").update(zip).digest("hex") }, null, 2)}\n`);
console.log(`plugin-zip: fernway-for-wordpress.zip ${version}, ${central.length / 2} files, ${zip.length} bytes`);
