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

  test("there are four", () => {
    expect(BUILT_IN_PROMPTS.length).toBe(4);
  });

  // One name for the quick pair and one for the thorough pair, so which two go
  // together is visible without reading either.
  test("each pair shares a name", () => {
    const stems = BUILT_IN_PROMPTS.map((p: any) => p.name.split(",")[0].trim());
    expect(stems.filter((n: string) => n === "A quick read").length).toBe(2);
    expect(stems.filter((n: string) => n === "A close read").length).toBe(2);
  });

  // And the two that need a reasoning model say so in the name, rather than
  // leaving somebody to find out by getting a worse rewrite.
  test("the ones that need a reasoning model say so in their name", () => {
    for (const p of BUILT_IN_PROMPTS) {
      const needs = p.thinking !== "off";
      expect({ name: p.name, said: /model that thinks/i.test(p.name) })
        .toEqual({ name: p.name, said: needs });
    }
  });

  test("the fuller one of each pair really is fuller", () => {
    expect(sizeOf(named("A close read"))).toBeGreaterThan(sizeOf(named("A quick read")) * 1.25);
    expect(sizeOf(named("A close read, for a model that thinks")))
      .toBeGreaterThan(sizeOf(named("A quick read, for a model that thinks")) * 1.25);
  });

  // What the names deliberately do not claim is how the two pairs compare with
  // each other, because they cannot: a close read for a thinking model is about
  // the size of a quick read for a plain one. That belongs in the description,
  // where it can be said in words rather than implied by a label.
  test("and the description of each says what it costs", () => {
    for (const p of BUILT_IN_PROMPTS)
      expect({ name: p.name, said: /size|smallest|half again|prompt/i.test(p.what) })
        .toEqual({ name: p.name, said: true });
  });

  test("the description also says whether it needs a reasoning model", () => {
    for (const p of BUILT_IN_PROMPTS) {
      const needs = p.thinking !== "off";
      expect({ name: p.name, said: /reason/i.test(p.what) })
        .toEqual({ name: p.name, said: needs });
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
