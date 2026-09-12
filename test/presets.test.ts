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
  // The blocks that carry the chat rather than the rules, by the ids they are
  // built under. "world" was in this list and is not a block id: the lore block
  // is "lore", so it was being weighed as a rule. What that measures is how
  // much instruction each prompt gives, and a block that is one macro in a tag
  // is not instruction.
  const SCENE = ["character", "persona", "lore", "memory", "history", "turn"];
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
      // The words these prompts use for standing back. Updated with the
      // prompts rather than loosened: the point is that a prompt for somebody's
      // own turn talks about leaving it alone, and it still has to say so.
      expect(whole).toMatch(/leave the writing to them|not a repair|not yours|what they meant to type/i);
    }
  });

  // What the names do not claim is how the two pairs compare with
  // each other, because they cannot: a close read for a thinking model is about
  // the size of a quick read for a plain one. That belongs in the description,
  // where it can be said in words rather than implied by a label.
  test("and the description of each says what it costs", () => {
    for (const p of BUILT_IN_PROMPTS)
      expect({ name: p.name, said: /size|short|smallest|half again|prompt/i.test(p.what) })
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
  // A prompt whose job is cutting stock phrases cannot be built out of them.
  // Every entry below was in these prompts and was taken out: two of them
  // opened on "you are the second pair of eyes", and "beat" and "lands" were
  // used for units of writing in the same breath as telling a model to write
  // plainly. Nothing is listed here on a guess about what might creep in
  // later, because a guard for a fault nobody has made is a rule to work
  // around rather than a check that ever fires.
  const STOCK = [
    /\bsecond pair of eyes\b/i,
    /\byou are (?:a|an|the) \w+/i,
    /\bbeats?\b/i,
    /\blands?\b/i,
    /\blose the thread\b/i,
    /\btrip on\b/i,
    /\bin a breath\b/i,
    /\bsame hand\b/i,
  ];
  // Only the prose. A bullet is an example of something to cut, so a prompt
  // naming "a beat" as a pause worth filling is doing its job rather than
  // failing this: the fault being guarded against is a prompt written in the
  // stuff it exists to remove, not one that quotes it.
  const prose = (text: string) =>
    String(text)
      .split("\n")
      .filter((line) => !/^\s*-\s/.test(line))
      .join("\n");
  test("none of them is built out of the phrases they exist to cut", () => {
    for (const p of BUILT_IN_PROMPTS)
      for (const b of p.blocks) {
        const hit = STOCK.find((re) => re.test(prose(b.text)));
        expect({ block: p.name + "/" + b.id, stock: hit ? String(hit) : "" })
          .toEqual({ block: p.name + "/" + b.id, stock: "" });
      }
  });

  // Two things a refine gets wrong quietly, so every prompt says them.
  //
  // A reply written in first person, present tense, from inside one head can
  // come back in polished third with another character's thoughts in it, and
  // nothing about that reads as an error.
  //
  // And a model rewriting roleplay will soften it: the heat comes down, the
  // violence goes vague, the crude word becomes a polite one. Limits can refuse
  // a rewrite that did it, but that is a call already paid for, so the prompts
  // ask first.
  test("each one holds the point of view and the strength of what it is given", () => {
    for (const p of BUILT_IN_PROMPTS) {
      const all = p.blocks.map((b) => String(b.text)).join("\n");
      const holdsPov = /\bperson\b/.test(all) && /\btense\b/.test(all);
      const holdsStrength = /\bstrength it went in\b/.test(all);
      expect({ prompt: p.name, pov: holdsPov, strength: holdsStrength })
        .toEqual({ prompt: p.name, pov: true, strength: true });
    }
  });

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

// A setting nobody can export is a setting that does not survive moving to
// another device, and nothing says so: the export runs, the file downloads, and
// the setting is quietly not in it.
//
// Six were missed this way at once, which is what this is here to stop.
describe("every setting can leave the panel", () => {
  const { CONFIG, PARTS } = __testing as any;

  // Settings that belong to this browser or to this screen rather than to a
  // person, so carrying them to another device would be wrong rather than
  // missing. Named one at a time, with the reason, so the list cannot quietly
  // become a place to put anything awkward.
  const STAYS_HERE: Record<string, string> = {
    ui: "which tab was open",
    blocksShut: "which blocks are folded, which is where you were looking",
    exportParts: "what to tick on the export card",
    importParts: "what to tick on the import card",
    resetParts: "what to tick on the reset card",
    debugParts: "what to tick on the problem report card",
    hunt: "what is typed in the search box",
    tab: "which tab of the panel was last open",
    // A record of the shipped prompts this device has already been shown. It
    // describes what somebody has read rather than anything about their setup,
    // and carrying it to another device would silence a notice there that
    // nobody there had seen.
    promptsSeen: "which shipped prompts this device has already been told about",
  };

  test("there are parts to check, or this proves nothing", () => {
    expect(Array.isArray(PARTS) && PARTS.length).toBeGreaterThan(4);
  });

  test("every setting is in a part, or named as staying on this device", () => {
    const carried = new Set<string>();
    for (const p of PARTS) for (const k of p.keys) carried.add(k);
    const missing = Object.keys(CONFIG).filter((k) => !carried.has(k) && !(k in STAYS_HERE));
    expect(missing).toEqual([]);
  });

  test("and nothing is named as staying here that is also exported", () => {
    const carried = new Set<string>();
    for (const p of PARTS) for (const k of p.keys) carried.add(k);
    const both = Object.keys(STAYS_HERE).filter((k) => carried.has(k));
    expect(both).toEqual([]);
  });

  test("no part names a setting that does not exist", () => {
    const known = new Set(Object.keys(CONFIG));
    const ghosts: string[] = [];
    for (const p of PARTS) for (const k of p.keys) if (!known.has(k)) ghosts.push(p.id + "/" + k);
    expect(ghosts).toEqual([]);
  });
});


// The blocks the shipped prompts are made of. A block with a role the panel does
// not offer is turned into a system block without a word, and a block with no id
// is dropped on the way to the backend. Neither says anything, and both are the
// kind of mistake that comes from adding a block by hand.
describe("every block in a shipped prompt is one the panel can hold", () => {
  const { BUILT_IN_PROMPTS, ROLE_OPTIONS, MACROS } = __testing as any;
  const roles = ROLE_OPTIONS.map((r: any) => r.value);
  const every = BUILT_IN_PROMPTS.flatMap((p: any) =>
    p.blocks.map((b: any) => ({ prompt: p.name, block: b })),
  );

  test("there are blocks to check", () => {
    expect(every.length).toBeGreaterThan(40);
  });

  test("every role is one the panel offers", () => {
    const wrong = every
      .filter((x: any) => roles.indexOf(String(x.block.role)) < 0)
      .map((x: any) => x.prompt + "/" + x.block.id + ": " + x.block.role);
    expect(wrong).toEqual([]);
  });

  test("every block has an id, since one without is dropped on the way out", () => {
    const wrong = every
      .filter((x: any) => !x.block.id || !String(x.block.id).trim())
      .map((x: any) => x.prompt + ": a block with no id");
    expect(wrong).toEqual([]);
  });

  test("every block has a name, since the list is read by name", () => {
    const wrong = every
      .filter((x: any) => !x.block.name || !String(x.block.name).trim())
      .map((x: any) => x.prompt + "/" + x.block.id);
    expect(wrong).toEqual([]);
  });

  test("no two blocks in one prompt share an id", () => {
    const clashes: string[] = [];
    for (const p of BUILT_IN_PROMPTS) {
      const seen = new Set<string>();
      for (const b of p.blocks) {
        if (seen.has(String(b.id))) clashes.push(p.name + "/" + b.id);
        seen.add(String(b.id));
      }
    }
    expect(clashes).toEqual([]);
  });

  test("every macro used in one is a macro that gets answered", () => {
    // A macro nothing fills is left in the prompt as its own braces, so the
    // model is sent the word rather than the thing.
    const known = MACROS.map((m: any) => m.tag);
    const unknown: string[] = [];
    for (const x of every)
      for (const m of String(x.block.text).matchAll(/\{\{\s*[a-z_]+\s*\}\}/gi)) {
        const tag = m[0].replace(/\s+/g, "");
        // The host answers its own, and the panel lists ours. Anything in
        // neither list is checked by hand below rather than guessed at.
        if (known.indexOf(tag) < 0 && !HOSTS.includes(tag)) unknown.push(x.prompt + "/" + x.block.id + ": " + tag);
      }
    expect([...new Set(unknown)]).toEqual([]);
  });
});

// Macros Lumiverse fills in rather than this extension. Listed here because the
// check above cannot tell one it has never heard of from one the host answers.
const HOSTS = ["{{description}}", "{{persona}}", "{{char}}", "{{user}}", "{{scenario}}", "{{personality}}", "{{whose}}"];
