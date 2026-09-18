// The four shipped prompts are described twice: in the panel, where the text
// lives in the code, and in docs/prompt.md, where it is written out again by
// hand. Nothing makes the second copy follow the first, so a rewording lands in
// one and sits in the other until somebody reads both.
//
// That is what happened to the four for a reasoning model. They opened on a
// question asked for effect, the panel stopped doing that, and the docs table
// kept it for two releases. A rule reads as a rule, and a question is the one
// shape it must not take.
import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const page = readFileSync(join(root, "docs/prompt.md"), "utf8");
const code = readFileSync(join(root, "src/frontend.ts"), "utf8");
const { __testing } = await import("../src/frontend");

// Read from the array itself rather than listed again here, so a ninth prompt
// is covered the day it is added. The label is what the panel puts in the
// picker and the page puts in a row; the name is longer, since the panel holds
// both sets in one list and the page gives each set a heading.
const array = code.slice(
  code.indexOf("const BUILT_IN_PROMPTS"),
  code.indexOf("const BUILT_IN =", code.indexOf("const BUILT_IN_PROMPTS")),
);
const shipped = [...array.matchAll(/\n\s+label: "([^"]+)",\n\s+mine: (true|false),/g)].map((m) => ({
  label: m[1],
  mine: m[2] === "true",
}));

// A table row is "| cell | cell | cell |", and the ones that matter start with a
// bolded prompt name. Splitting on the bar leaves an empty cell at each end.
const rows = page
  .split("\n")
  .filter((l) => l.startsWith("| **"))
  .map((l) => l.split("|").map((c) => c.trim()))
  .map((cells) => ({ name: cells[1].replace(/\*\*/g, ""), what: cells[2], needs: cells[3] }));

describe("the prompts page keeps up with the panel", () => {
  test("the code has four prompts to check against", () => {
    expect(shipped.length).toBe(4);
  });

  test("the page has a row for each of them", () => {
    expect(rows.length).toBe(shipped.length);
  });

  test("and names them in the same order, replies first", () => {
    // The page runs the replies table then the one for your own messages, which
    // is the order the array is in. A prompt renamed in one and not the other
    // lands here.
    expect(rows.map((r) => r.name)).toEqual(shipped.map((p) => p.label));
    expect(shipped.map((p) => p.mine)).toEqual([false, false, true, true]);
  });

  test("the page agrees about which ones need a reasoning model", () => {
    const fromCode = [...array.matchAll(/\n\s+thinking: "(off|inherit)",/g)].map((m) =>
      m[1] === "inherit" ? "yes" : "no",
    );
    expect(rows.map((r) => r.needs)).toEqual(fromCode);
  });

  test("and none of the reasoning ones is described as a question", () => {
    const asked = rows
      .filter((r) => /for a model that thinks/.test(r.name) && r.what.includes("?"))
      .map((r) => r.what);
    expect(asked).toEqual([]);
  });
});
