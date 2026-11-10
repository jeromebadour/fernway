// "How delivery works" names the tests that prove each promise. This keeps the page honest: every test it names must
// exist, word for word, in the file it points to.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");
const { cases } = JSON.parse(readFileSync(resolve(root, "apps/web/src/ui/delivery-proofs.json"), "utf8")) as {
  cases: { id: string; proofs: { file: string; name: string; line: number }[] }[];
};

describe("How delivery works", () => {
  it("names only tests that exist, on the lines it links to", () => {
    expect(cases.length).toBeGreaterThan(0);
    for (const c of cases) {
      expect(c.proofs.length, c.id).toBeGreaterThan(0);
      for (const p of c.proofs) {
        const lines = readFileSync(resolve(root, p.file), "utf8").split("\n");
        const at = lines.findIndex((l) => l.includes(`it("${p.name}"`)) + 1;
        expect(at, `${c.id}: ${p.file} has no test "${p.name}"`).toBeGreaterThan(0);
        expect(p.line, `${c.id}: "${p.name}" is on line ${at} of ${p.file}, the page says ${p.line}`).toBe(at);
      }
    }
  });
});
