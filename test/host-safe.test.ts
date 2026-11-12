// Two things Auto Refine must never do to the Lumiverse it runs in.
//
// It must not get in the way of Lumiverse's own memory. Lumiverse stops its
// memory work for a chat when a reply in that chat is stopped or a new one
// starts, and it reads a message into memory again when the message is edited.
// So Auto Refine never stops or starts a reply in a chat, never deletes or
// adds a message, never asks Lumiverse to skip reading an edited message into
// memory, and hands every prompt back exactly as it came.
//
// And its built-in prompts must not ask the model to write out its reasoning
// or thinking. Some providers decline a request that does, as
// "reasoning_extraction", and the call is still paid for.
//
// Run with: bun test

import { expect, test, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { __testing } from "../src/frontend";

const root = join(import.meta.dir, "..");
// Comments are taken out first, so a line about one of these calls is not
// read as the call.
const strip = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const BACK = strip(readFileSync(join(root, "src", "backend.ts"), "utf8"));
const FRONT = strip(readFileSync(join(root, "src", "frontend.ts"), "utf8"));

describe("Lumiverse's own memory is left alone", () => {
  const calls = Array.from(new Set((BACK.match(/spindle\.[a-zA-Z_]+\.[a-zA-Z_]+\(/g) || []).map((c) => c.slice(0, -1))));

  test("the backend calls nothing that stops, starts or removes anything in a chat", () => {
    const allowed = new Set([
      "spindle.characters.get",
      "spindle.chat.getMessages",
      "spindle.chat.updateMessage",
      "spindle.chats.get",
      "spindle.chats.getActive",
      "spindle.connections.list",
      "spindle.decisions.evaluate",
      "spindle.decisions.listConnections",
      "spindle.enclave.delete",
      "spindle.enclave.list",
      "spindle.generate.quiet",
      "spindle.generate.quietStream",
      "spindle.log.info",
      "spindle.log.warn",
      "spindle.macros.resolve",
      "spindle.permissions.getGranted",
      "spindle.permissions.has",
      "spindle.permissions.onChanged",
      "spindle.storage.read",
      "spindle.storage.write",
      "spindle.tokens.countText",
      "spindle.ui.closeDrawer",
      "spindle.userStorage.getJson",
      "spindle.userStorage.setJson",
    ]);
    expect(calls.filter((c) => !allowed.has(c))).toEqual([]);
  });

  test("an edited message is always read into memory again", () => {
    // Lumiverse skips that for a write that asks it to.
    expect(BACK).not.toMatch(/skipChunkRebuild/);
    expect(FRONT).not.toMatch(/skipChunkRebuild/);
  });

  test("nothing in either half reaches for Lumiverse's memory or stops a reply", () => {
    for (const code of [BACK, FRONT]) {
      expect(code).not.toMatch(/spindle\.memor/i);
      expect(code).not.toMatch(/\.memories?\.(?:delete|clear|reset|rebuild|update|set)\(/);
      expect(code).not.toMatch(/generate\.(?:stop|cancel|abort)\(/);
    }
  });
});

describe("the built-in prompts do not ask the model to write out its reasoning", () => {
  const { BUILT_IN_PROMPTS } = __testing as any;
  const ASKS = /reasoning|chain of thought|step by step|think out loud|scratchpad|your working|your thinking|<\/?think/i;

  test("there are built-in prompts to read, with text in their blocks", () => {
    expect(BUILT_IN_PROMPTS.length).toBeGreaterThan(0);
    for (const p of BUILT_IN_PROMPTS) expect(p.blocks.some((b: any) => typeof b.text === "string" && b.text.length > 40)).toBe(true);
  });

  for (const p of BUILT_IN_PROMPTS) {
    test(p.name + (p.mine ? " (your messages)" : ""), () => {
      const hits: string[] = [];
      for (const b of p.blocks || []) {
        const m = ASKS.exec(String(b.text || ""));
        if (m) hits.push(b.name + ": " + m[0]);
      }
      expect(hits).toEqual([]);
    });
  }
});
