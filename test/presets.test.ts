import { readFileSync } from "node:fs";
// The prompts that come with it, held to what they promise.
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
describe("the prompts that come with it", () => {
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

  test("there are two for each of the two prompts", () => {
    expect(forReplies().length).toBe(2);
    expect(forMine().length).toBe(2);
  });

  // What Jev found goes only to the prompts for replies, since Jev never reads
  // your own messages. Off, so nothing changes for anybody who does not turn
  // it on.
  test("each prompt for replies carries What Jev Found, switched off", () => {
    for (const p of forReplies()) {
      const b = p.blocks.find((x: any) => x.id === "jevfound");
      expect(b).toBeTruthy();
      expect(b.on).toBe(false);
      expect(String(b.text)).toContain("{{jev_found}}");
    }
  });

  test("and neither prompt for your own messages does", () => {
    for (const p of forMine())
      expect(p.blocks.some((x: any) => String(x.text).indexOf("{{jev_found}}") >= 0)).toBe(false);
  });

  // Every one scores before it changes anything, and the score has to rest on
  // a line the model could quote. The two for a model that reasons write the
  // scorecard ahead of the rewrite, so the scores are written before the
  // rewrite is and cannot grade it after. The two for a model that does not
  // score silently and are never asked for notes.
  test("every one scores the passage, on lines it could quote", () => {
    for (const p of BUILT_IN_PROMPTS) {
      const score = p.blocks.find((x: any) => x.id === "score");
      const t = String(score && score.text);
      expect({
        prompt: p.name,
        on: !!(score && score.on),
        quotes: /quote/.test(t),
        leavesDoubt: /85 to 99: a line might fit, but you are not sure/.test(t),
        onlyUnder: /Change only the areas that scored under 85/.test(t),
      }).toEqual({ prompt: p.name, on: true, quotes: true, leavesDoubt: true, onlyUnder: true });
    }
  });

  test("the ones for a model that reasons write the scorecard before the rewrite", () => {
    for (const p of BUILT_IN_PROMPTS.filter((x: any) => x.thinking !== "off")) {
      const a = String(p.blocks.find((x: any) => x.id === "answer").text);
      expect({ prompt: p.name, cardFirst: a.indexOf("<REFINE_NOTES>") >= 0 && a.indexOf("<REFINE_NOTES>") < a.indexOf("<REFINED>") })
        .toEqual({ prompt: p.name, cardFirst: true });
    }
  });

  test("and the ones for a model that does not reason ask for no notes at all", () => {
    for (const p of BUILT_IN_PROMPTS.filter((x: any) => x.thinking === "off")) {
      const all = p.blocks.map((b: any) => String(b.text)).join("\n");
      const score = String(p.blocks.find((x: any) => x.id === "score").text);
      expect({ prompt: p.name, notes: /refine_notes/i.test(all), silent: /Don't write the scores down/.test(score) })
        .toEqual({ prompt: p.name, notes: false, silent: true });
    }
  });

  // One card can hold several characters, and a group chat hands a reply to
  // whichever card wrote it. Each prompt says who is in the scene stays who
  // they were.
  test("every one keeps each line with its speaker", () => {
    for (const p of BUILT_IN_PROMPTS) {
      const cast = p.blocks.find((x: any) => x.id === "cast");
      expect({ prompt: p.name, on: !!(cast && cast.on), speaker: /keeps its speaker|Who says each line/.test(String(cast && cast.text)) })
        .toEqual({ prompt: p.name, on: true, speaker: true });
    }
  });

  test("the prompts for replies keep the names that say who is talking", () => {
    for (const p of forReplies()) {
      const t = String(p.blocks.find((x: any) => x.id === "cast").text);
      expect({
        prompt: p.name,
        tags: /a name or a plain speech tag/.test(t),
        pronouns: /could mean two people, use the name/.test(t),
        present: /still in it when you are done/.test(t),
      }).toEqual({ prompt: p.name, tags: true, pronouns: true, present: true });
    }
  });

  // A speech tag that only names the speaker is the one thing that says who is
  // talking in a crowded scene, so the rule about cutting tags leaves it.
  test("and the rule about speech tags leaves a tag that only names the speaker", () => {
    for (const p of forReplies()) {
      const all = p.blocks.map((b: any) => String(b.text)).join("\n");
      expect({ prompt: p.name, keeps: /tag that only says who is talking stays/.test(all) })
        .toEqual({ prompt: p.name, keeps: true });
    }
  });

  // A tag reads as a label, so it stays short, and each block is named after
  // the tag it holds, so the Prompt tab and the prompt say the same thing.
  test("every tag is short, and every block is named after its tag", () => {
    for (const p of BUILT_IN_PROMPTS)
      for (const b of p.blocks) {
        const m = /^<([a-z_]+)>/.exec(String(b.text));
        const tag = m ? m[1] : "";
        const fromName = String(b.name).toLowerCase().replace(/[^a-z ]/g, "").trim().replace(/ +/g, "_");
        expect({ block: p.name + "/" + b.id, short: tag.length > 0 && tag.length <= 20, named: fromName === tag })
          .toEqual({ block: p.name + "/" + b.id, short: true, named: true });
      }
  });

  // A name macro fills in one name. In a group chat that is one character out
  // of several, so a built-in prompt that leans on it is wrong for everyone
  // else in the scene. The macros stay in the list for a prompt of your own.
  test("none of them uses a macro that fills in one character's name", () => {
    for (const p of BUILT_IN_PROMPTS)
      for (const b of p.blocks) {
        const hit = /\{\{\s*(?:user|char|charGroupFocused)\s*\}\}/i.exec(String(b.text));
        expect({ block: p.name + "/" + b.id, macro: hit ? hit[0] : "" }).toEqual({ block: p.name + "/" + b.id, macro: "" });
      }
  });

  // The mark tells a reader the built-in prompts changed. A block added
  // switched off is still new wording to take, so it has to move the mark.
  test("the mark moves for a block added switched off", () => {
    const { markShape } = __testing as any;
    const blocks = forReplies()[0].blocks;
    const without = blocks.filter((x: any) => x.id !== "jevfound");
    expect(markShape(blocks)).not.toBe(markShape(without));
  });

  // Stored under a name of its own, shown under the heading's. Two entries
  // sharing a stored name would overwrite each other; two sharing a shown one
  // read fine, because the heading above says which prompt it is for.
  // Stored under exactly what it shows. The two used to differ: both sets were
  // called a quick read and a close read, so a stored name carried a prefix
  // saying which set it came from. Naming the sets for their job took the
  // collision away, and a name that no longer matches its label is a prefix
  // that outlived its reason.
  // A preset keeps the prompt and a model setup keeps what runs it. The built-in
  // ones used to carry thinkingMode in their settings, which is a setup key and
  // not a preset key, so applyPreset walked straight past it and it was never
  // once applied. Left there it would have been worse than useless the day
  // somebody added it to PRESET_KEYS: loading a prompt would have reached over
  // and changed the model.
  test("none of them carries a setting that belongs to a model setup", () => {
    const src = readFileSync(new URL("../src/frontend.ts", import.meta.url), "utf8");
    // The object literal builtIn() hands each built-in preset as its settings.
    // Code only. The comment above the settings names thinkingMode to say why it
    // is not in there, and a check that reads its own explanation as a breach
    // would fail the moment somebody documented the rule.
    const made = src
      .slice(src.indexOf("function builtIn("), src.indexOf("const isBuiltIn"))
      .split("\n")
      .filter((line) => !/^\s*\/\//.test(line))
      .join("\n");
    const setupOnly = ["connectionId", "thinkingMode", "thinkingEffort", "timeoutSecs", "costIn", "costOut"];
    for (const k of setupOnly) expect({ key: k, inSettings: made.indexOf(k) >= 0 }).toEqual({ key: k, inSettings: false });
  });

  test("every one is stored under the name it shows", () => {
    for (const p of BUILT_IN_PROMPTS)
      expect({ name: p.name, label: p.label }).toEqual({ name: p.name, label: p.name });
  });

  test("every one is stored under a name of its own", () => {
    const names = BUILT_IN_PROMPTS.map((p: any) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  // The two sets used to share their labels and lean on the heading above to
  // say which was which. They name their own job now, so the label agrees with
  // the role the first block hands out and the heading is no longer carrying
  // the difference on its own.
  test("and the two sets are named apart, since they are different jobs", () => {
    const mine = forMine().map((p: any) => p.label);
    const replies = forReplies().map((p: any) => p.label);
    for (const one of mine) expect(replies).not.toContain(one);
    expect(mine.every((l: string) => /^A line judge/.test(l))).toBe(true);
    expect(replies.every((l: string) => /^A judge/.test(l))).toBe(true);
  });

  // A prompt for your own turn loaded over the prompt for replies would be the
  // wrong job asked of every reply in the chat.
  test("each carries the one list it was written for", () => {
    for (const p of BUILT_IN_PROMPTS) expect(typeof p.mine).toBe("boolean");
  });

  // Both entries in a set share one name, which is the job the first block
  // hands the model: a line edit on a reply, a copy edit on your own turn. The
  // only thing separating them is which model they were written for.
  test("each set is named for the job it does", () => {
    for (const [set, job] of [[forReplies(), "A judge"], [forMine(), "A line judge"]] as any) {
      const stems = set.map((p: any) => p.label.replace(/ that thinks$/, "").trim());
      expect(stems.filter((n: string) => n === job).length).toBe(2);
    }
  });

  // And the two that need a reasoning model say so in the name, rather than
  // leaving somebody to find out by getting a worse rewrite.
  test("the ones that need a reasoning model say so in their name", () => {
    for (const p of BUILT_IN_PROMPTS) {
      const needs = p.thinking !== "off";
      expect({ name: p.name, said: /that thinks/i.test(p.name) })
        .toEqual({ name: p.name, said: needs });
    }
  });

  // The one for a reasoning model leans on the model to fill in the rest, so it
  // carries fewer words than the one written for any model. Its description says
  // so, and this is what holds that claim to the text.
  test("the one for a reasoning model is the smaller of its pair", () => {
    const pairs = [
      ["A judge that thinks", "A judge"],
      ["A line judge that thinks", "A line judge"],
    ];
    for (const [small, big] of pairs)
      expect(sizeOf(named(small))).toBeLessThan(sizeOf(named(big)));
  });

  // The whole reason there is a second set. A prompt for your own turn is about
  // repairing what is there; one for a reply is about improving it. If the two
  // said the same thing there would be no reason to have both.
  test("the prompts for your own writing are about leaving it alone", () => {
    for (const p of forMine()) {
      const whole = rulesOf(p).map((b: any) => b.text).join(" ");
      // The words these prompts use for standing back. Updated with the
      // prompts rather than loosened: the point is that a prompt for somebody's
      // own turn talks about leaving it alone, and it still has to say so.
      expect(whole).toMatch(/leave the writing to them|not a repair|not yours|hands off|what they meant to type/i);
    }
  });

  // What the names do not claim is which of the two on a side is the better
  // one, because that is not a question a name can answer: it depends entirely
  // on the model somebody is running. That belongs in the description, where it
  // can be said in words rather than implied by a label.
  test("and the description of each says what will run it", () => {
    for (const p of BUILT_IN_PROMPTS)
      expect({ name: p.name, said: /any model|model that reasons/i.test(p.what) })
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
    // Narrowed rather than dropped. A role with a job in it is what the
    // opening block is for now, and it is the generic ones that read as
    // filler: a helpful assistant, an expert writer, a master storyteller.
    /\byou are (?:a|an) (?:helpful|expert|professional|skilled|talented|seasoned|world.class|master)\b/i,
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

  // Two things a refine gets wrong without any warning, so every prompt says them.
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
// somebody's prompt stops working. {{whose}} was taken out of both,
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
// the setting is not in it.
//
// Six were missed this way at once, which is what this is here to stop.
describe("every setting can leave the panel", () => {
  const { CONFIG, PARTS } = __testing as any;

  // Settings that belong to this browser or to this screen rather than to a
  // person, so carrying them to another device would be wrong rather than
  // missing. Named one at a time, with the reason, so the list cannot
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
    builtInSeen: "the built-in prompts as they were when you last took one",
    movedSeen: "which moved defaults you have already been told about, which is about this browser rather than about your setup",
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


// The blocks the built-in prompts are made of. A block with a role the panel does
// not offer is turned into a system block without a word, and a block with no id
// is dropped on the way to the backend. Neither says anything, and both are the
// kind of mistake that comes from adding a block by hand.
describe("every block in a built-in prompt is one the panel can hold", () => {
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

  // {{protect_notes}} is the one macro that puts the extension's own words into
  // the prompt rather than a piece of the chat, and it is the only one that is
  // empty on most refines. It gets a block to itself so the tag around it can go
  // when the words do: a block that comes out as nothing but tags is dropped
  // whole, and a block is the only thing that check can drop.
  test("the token note has a block to itself in every built-in prompt", () => {
    const wrong: string[] = [];
    for (const p of BUILT_IN_PROMPTS as any[]) {
      const carry = (p.blocks as any[]).filter((b) => String(b.text).includes("{{protect_notes}}"));
      if (carry.length !== 1) {
        wrong.push(p.name + ": " + carry.length + " blocks carry it");
        continue;
      }
      const b = carry[0];
      // Nothing but the macro in a tag, so there is never anything left to keep
      // the block alive once the macro is empty.
      if (!/^<[a-z_]+>\s*\{\{protect_notes\}\}\s*<\/[a-z_]+>$/.test(String(b.text).trim()))
        wrong.push(p.name + ": the block holds more than the macro in a tag");
      if ((p.blocks as any[])[p.blocks.length - 1] !== b)
        wrong.push(p.name + ": it is not the last block");
    }
    expect(wrong).toEqual([]);
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

// The paragraph about who a sex scene is between. It is the same in all four
// prompts and quoted word for word in the docs, so the three cannot drift
// apart. It says what is allowed rather than naming alarm words, because
// those can make a model refuse to edit a scene between adults.
describe("the paragraph about adults", () => {
  const { BUILT_IN_PROMPTS } = __testing as any;
  const doc = readFileSync(new URL("../docs/prompt.md", import.meta.url), "utf8");
  const section = doc.split("### The one thing they do not edit")[1] || "";
  const quote = ((section.match(/^> (.+)$/m) || [])[1] || "").trim();

  test("the docs quote it", () => {
    expect(quote).toMatch(/^Sex scenes are between adults, 18 and older\./);
  });

  for (const p of BUILT_IN_PROMPTS) {
    const first = (p.blocks || [])[0];
    test(p.name + ": its first block carries it word for word", () => {
      expect(first && first.text).toContain(quote);
    });
    test(p.name + ": no alarm words anywhere in it", () => {
      const whole = (p.blocks || []).map((b: any) => b.text).join(" ");
      expect(whole).not.toMatch(/under eighteen|\bchild\b|\bminors?\b/i);
    });
  }
});
