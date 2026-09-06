// What the extension asks the reader to approve.
//
// Every gated permission in the manifest is a prompt in front of every person
// who installs this, and one that nothing calls is a prompt bought for nothing.
// That is not visible in a diff: the manifest reads as a list of sensible words
// whether or not the code behind them exists. It happened with `memories`, which
// was declared for a call that turned out to be available under `chats`, a
// permission already held.
//
// So each declared permission names what has to be in the source for it to be
// earned, and adding one means saying here what it is for.
import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const manifest = JSON.parse(read("spindle.json"));
const SRC = read("src/backend.ts") + read("src/frontend.ts");

// permission -> what using it looks like, and why it is asked for. A permission
// with no entry fails rather than passing quietly, so this list cannot go stale
// by someone adding a permission and not this.
const EARNS: Record<string, { uses: RegExp; why: string }> = {
  generation: {
    uses: /spindle\.generate\.(quiet|quietStream)\(/,
    why: "runs the refine",
  },
  chat_mutation: {
    uses: /spindle\.chat\.updateMessage\(/,
    why: "saves the rewrite over the reply, and puts it back",
  },
  chats: {
    uses: /spindle\.chat\.getMessages\(|spindle\.chats\.(get|getMemories)\(/,
    why: "reads the chat, its card and what Lumiverse remembers of it",
  },
  characters: {
    uses: /spindle\.characters\.get\(/,
    why: "reads the card behind the character macros",
  },
  world_books: {
    uses: /spindle\.world_books\b/,
    why: "reads the lorebook entries the chat has active",
  },
  ui_panels: {
    uses: /createFloatWidget|showContextMenu/,
    why: "the floating button and its menu",
  },
};

describe("the permissions it asks for", () => {
  const asked: string[] = manifest.permissions || [];

  test("the manifest was really read", () => {
    expect(asked.length).toBeGreaterThan(3);
  });

  test("every one is used by the code", () => {
    const idle = asked.filter((p) => {
      const rule = EARNS[p];
      return !rule || !rule.uses.test(SRC);
    });
    expect(idle).toEqual([]);
  });

  test("and nothing is used that was not asked for", () => {
    // The other direction: a call that needs a permission the manifest does not
    // declare fails at runtime on the reader's machine and nowhere here.
    const used = Object.keys(EARNS).filter((p) => EARNS[p].uses.test(SRC));
    expect(used.filter((p) => asked.indexOf(p) < 0)).toEqual([]);
  });

  test("memories is not among them, since chats already answers for it", () => {
    // spindle.chats.getMemories is documented as the same call as
    // spindle.memories.chatMemory.get under a permission this already holds.
    // Reaching for the other one would be a second approval for one answer.
    expect(asked.indexOf("memories")).toBe(-1);
    expect(/spindle\.memories\./.test(SRC)).toBe(false);
  });
});
