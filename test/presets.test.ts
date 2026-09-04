import { readFileSync } from "node:fs";
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

  const forReplies = () => BUILT_IN_PROMPTS.filter((p: any) => !p.mine);
  const forMine = () => BUILT_IN_PROMPTS.filter((p: any) => p.mine);

  test("there are four for each of the two prompts", () => {
    expect(forReplies().length).toBe(4);
    expect(forMine().length).toBe(4);
  });

  // Stored under a name of its own, shown under the heading's. Two entries
  // sharing a stored name would overwrite each other; two sharing a shown one
  // read fine, because the heading above says which prompt it is for.
  test("every one is stored under a name of its own", () => {
    const names = BUILT_IN_PROMPTS.map((p: any) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("and the two sets read the same, since the heading says which is which", () => {
    expect(forMine().map((p: any) => p.label).sort())
      .toEqual(forReplies().map((p: any) => p.label).sort());
  });

  // A prompt for your own turn loaded over the prompt for replies would be the
  // wrong job asked of every reply in the chat.
  test("each carries the one list it was written for", () => {
    for (const p of BUILT_IN_PROMPTS) expect(typeof p.mine).toBe("boolean");
  });

  // One name for the quick pair and one for the thorough pair, so which two go
  // together is visible without reading either.
  test("each pair shares a name", () => {
    for (const set of [forReplies(), forMine()]) {
      const stems = set.map((p: any) => p.label.split(",")[0].trim());
      expect(stems.filter((n: string) => n === "A quick read").length).toBe(2);
      expect(stems.filter((n: string) => n === "A close read").length).toBe(2);
    }
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
    const pairs = [
      ["A close read", "A quick read"],
      ["A close read, for a model that thinks", "A quick read, for a model that thinks"],
      ["Your writing, a close read", "Your writing, a quick read"],
      [
        "Your writing, a close read, for a model that thinks",
        "Your writing, a quick read, for a model that thinks",
      ],
    ];
    for (const [big, small] of pairs)
      expect(sizeOf(named(big))).toBeGreaterThan(sizeOf(named(small)) * 1.25);
  });

  // The whole reason there is a second set. A prompt for your own turn is about
  // repairing what is there; one for a reply is about improving it. If the two
  // said the same thing there would be no reason to ship both.
  test("the prompts for your own writing are about leaving it alone", () => {
    for (const p of forMine()) {
      const whole = rulesOf(p).map((b: any) => b.text).join(" ");
      expect(whole).toMatch(/co-author|their hand|not yours|what I meant to type/i);
    }
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

// The list of macros the panel shows and the list the backend answers are two
// lists in two files, and a macro in one but not the other is invisible until
// somebody's prompt quietly stops working. {{whose}} was taken out of both,
// and this is what says so next time.
describe("the macros offered and the macros answered", () => {
  const FE = readFileSync(new URL("../src/frontend.ts", import.meta.url), "utf8");
  const BE = readFileSync(new URL("../src/backend.ts", import.meta.url), "utf8");

  // Every entry in the panel's list, with whether it says this extension
  // answers it. The description in between can run to several lines.
  const listed = () => {
    const out = new Map<string, boolean>();
    const block = FE.slice(FE.indexOf("const MACROS"), FE.indexOf("type Block ="));
    for (const m of block.matchAll(/tag:\s*"\{\{([a-z_]+)\}\}"([\s\S]*?)ours:\s*(true|false)/g))
      out.set(m[1], m[3] === "true");
    return out;
  };
  const answered = () => {
    const m = /const OURS = \[([^\]]*)\]/.exec(BE);
    return new Set([...(m ? m[1] : "").matchAll(/'([a-z_]+)'/g)].map((x) => x[1]));
  };

  test("everything the panel calls ours is answered by the backend", () => {
    const ours = [...listed()].filter(([, mine]) => mine).map(([tag]) => tag);
    expect(ours.length).toBeGreaterThan(0);
    for (const tag of ours) expect([...answered()]).toContain(tag);
  });

  test("and everything the backend answers is offered by the panel", () => {
    for (const tag of answered()) expect([...listed().keys()]).toContain(tag);
  });

  test("a macro the panel leaves to Lumiverse is not answered here", () => {
    const theirs = [...listed()].filter(([, mine]) => !mine).map(([tag]) => tag);
    expect(theirs).toContain("persona");
    for (const tag of theirs) expect([...answered()]).not.toContain(tag);
  });

  // The one macro that puts words rather than chat into a prompt writes them
  // out where the macros are listed, so nothing reaches a model unread.
  test("the macro that carries words says which words", () => {
    const note = /const SHIELD_NOTE =\s*([\s\S]*?);\n/.exec(BE);
    const words = (note ? note[1] : "").match(/'([^']*)'/g) || [];
    const sentence = words.map((w) => w.slice(1, -1)).join("");
    expect(sentence.length).toBeGreaterThan(40);
    const block = FE.slice(FE.indexOf("const MACROS"), FE.indexOf("type Block ="));
    const shown = block.replace(/"\s*\+\s*\n\s*"/g, "").replace(/\\"/g, '"');
    for (const part of sentence.split(". ").filter((x) => x.length > 20))
      expect(shown).toContain(part.slice(0, 40));
  });
});
