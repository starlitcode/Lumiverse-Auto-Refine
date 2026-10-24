// Every Log line has a kind, and every kind can be hidden under Show in this
// list. A line with no kind could not be hidden, so each call to log in the
// source has to name one of the kinds in LOG_KINDS.
//
// Run with: bun test

import { expect, test, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { __testing } from "../src/frontend";

const { LOG_KINDS } = __testing as any;
const SRC = readFileSync(new URL("../src/frontend.ts", import.meta.url), "utf8");
const IDS = new Set<string>(LOG_KINDS.map((k: any) => k.id));

// What each call passes first, up to the comma after the kind.
const calls = [...SRC.matchAll(/(?<![\w.])log\(\s*([^,]*),/g)]
  .map((m) => m[1].trim())
  .filter((first) => !/^kind: LogKind/.test(first));

describe("every Log line can be hidden", () => {
  test("the calls were found at all", () => {
    expect(calls.length).toBeGreaterThan(60);
  });

  test("every call names a kind from the list", () => {
    const bad: string[] = [];
    for (const first of calls) {
      const named = [...first.matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
      if (!named.length || named.some((n) => !IDS.has(n))) bad.push(first);
    }
    expect(bad).toEqual([]);
  });

  test("every kind in the list is used", () => {
    const used = new Set<string>();
    for (const first of calls) for (const m of first.matchAll(/"([a-z]+)"/g)) used.add(m[1]);
    expect([...IDS].filter((id) => !used.has(id))).toEqual([]);
  });

  test("what the second model found, sent to the refine model, has its own kind", () => {
    const at = SRC.indexOf('"what " + whoName() + " found went to the refine model: "');
    expect(at).toBeGreaterThan(0);
    const call = SRC.lastIndexOf("log(", at);
    expect(SRC.slice(call, at)).toContain('"found"');
  });
});
