// The prompts that ship with it, held to what they promise.
//
// Run with: bun test

import { describe, test, expect } from "bun:test";
import { __testing } from "../src/frontend";

// They were called Short and Detailed in two pairs, and the set did not keep
// that promise: the detailed reasoning one came out barely longer than the
// plain short one, because the two pairs are not the same size of thing. So
// the names no longer claim a size, and these hold the two things that are
// left: that each pair really does get fuller, and that every one of them says
// the passage means what it already meant.
describe("the prompts that ship with it", () => {
  const { BUILT_IN_PROMPTS } = __testing as any;
  const SCENE = ["character", "persona", "world", "history", "turn"];
  const rulesOf = (p: any) =>
    p.blocks.filter((b: any) => SCENE.indexOf(b.id) < 0);
  const sizeOf = (p: any) =>
    rulesOf(p).reduce((n: number, b: any) => n + String(b.text).length, 0);
  const named = (n: string) => BUILT_IN_PROMPTS.find((p: any) => p.name === n);

  test("there are four, and none of them is named for a size", () => {
    expect(BUILT_IN_PROMPTS.length).toBe(4);
    for (const p of BUILT_IN_PROMPTS)
      expect({ name: p.name, sized: /\b(short|detailed|long|brief|full)\b/i.test(p.name) })
        .toEqual({ name: p.name, sized: false });
  });

  test("the fuller one of each pair really is fuller", () => {
    expect(sizeOf(named("Line by line"))).toBeGreaterThan(sizeOf(named("Light touch")) * 1.25);
    expect(sizeOf(named("Read it twice"))).toBeGreaterThan(sizeOf(named("One good question")) * 1.25);
  });

  test("and the description of each says whether it needs a reasoning model", () => {
    for (const p of BUILT_IN_PROMPTS) {
      const needs = p.thinking !== "off";
      expect({ name: p.name, said: /reason/i.test(p.what) })
        .toEqual({ name: p.name, said: needs });
    }
  });

  // The one thing a refine must never do is decide what the passage means. It
  // is said in the job block of all four, which is the block a reader is least
  // likely to switch off and the first thing the model reads.
  test("every one of them says the meaning is already settled", () => {
    for (const p of BUILT_IN_PROMPTS) {
      const job = p.blocks.find((b: any) => b.id === "job");
      expect({ name: p.name, hasJob: !!job }).toEqual({ name: p.name, hasJob: true });
      const t = String(job.text);
      expect({ name: p.name, settled: /still happens/.test(t) && /still means it/.test(t) })
        .toEqual({ name: p.name, settled: true });
      expect({ name: p.name, ending: /ends on the moment it already ends on/.test(t) })
        .toEqual({ name: p.name, ending: true });
    }
  });

  // A rewrite is a suggestion about wording, and a prompt that shouts reads as
  // an instruction to change something whether or not there is anything to
  // change. What is looked for is the shouting, not the words never and always
  // themselves: "what you write there never reaches the story" is a fact about
  // where the notes go, which is exactly the kind of thing worth saying plainly.
  const PUSHY = [
    /\byou must\b/i,
    /\byou will\b/i,
    /\bunder no circumstances\b/i,
    /\bat all times\b/i,
    /\bit is (?:critical|essential|imperative|vital)\b/i,
    /\bmake sure (?:you|to)\b/i,
    /\bdo not ever\b/i,
    /!/,
    /\b[A-Z]{4,}\b(?!\d)/,
  ];
  test("none of them shouts", () => {
    for (const p of BUILT_IN_PROMPTS)
      for (const b of p.blocks) {
        // Two kinds of capitals are not shouting. The answer tags are shouted
        // on purpose, which is said where they are written: a model skimming
        // for the shape of the answer finds a run of capitals before it finds a
        // word. And an acronym is just the name of the thing.
        const text = String(b.text)
          .replace(/REFINED|REFINE_NOTES/g, "x")
          .replace(/\b(?:HTML|XML|JSON|URL|URLs)\b/g, "x");
        const hit = PUSHY.find((re) => re.test(text));
        expect({ block: p.name + "/" + b.id, shouts: hit ? String(hit) : "" })
          .toEqual({ block: p.name + "/" + b.id, shouts: "" });
      }
  });
});
