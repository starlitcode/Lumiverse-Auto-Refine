// The refine pass, driven for real.
//
// This extension hands somebody's writing to a model and saves whatever comes
// back over it. Almost everything worth checking is about refusing to save the
// wrong thing, and none of it can be checked by reading the source: it depends
// on what the model answers with. So these load the built backend against a
// stub host, feed it answers a model really gives, and watch what it writes.
//
// The greeting block is the one that matters most. A person wrote that message.
import { expect, test, describe } from "bun:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SRC = readFileSync(new URL("../dist/backend.js", import.meta.url), "utf8");

interface Msg {
  id: string;
  role: string;
  content: string;
}

// A prompt small enough to assert against, in the shape the panel writes.
const PROMPT = [
  { id: "system", name: "The job", on: true, role: "system", text: "<your_task>\nRewrite it.\n</your_task>" },
  { id: "character", name: "Character", on: true, role: "system", text: "<character>\n{{description}}\n</character>" },
  { id: "lore", name: "World", on: true, role: "system", text: "<world>\n{{lore}}\n</world>" },
  { id: "history", name: "Scene", on: true, role: "system", text: "<recent_scene>\n{{history}}\n</recent_scene>" },
  { id: "cliches", name: "Cliches", on: true, role: "system", text: "<cliches>\nCut filler words.\n</cliches>" },
  { id: "answer", name: "How to answer", on: true, role: "system", text: "{{output_format}}\n\n{{protect_notes}}" },
  { id: "turn", name: "The turn", on: true, role: "user", text: "{{whose}}\n\n<turn_to_refine>\n{{message}}\n</turn_to_refine>" },
];

const RULES = {
  enabled: true,
  refineOn: true,
  blocks: PROMPT,
  refineUserMessages: false,
  connectionId: "",
  thinkingMode: "off",
  timeoutSecs: 90,
  maxGrowthPct: 60,
  minShrinkPct: 40,
  keepOriginal: true,
  confirmBeforeSave: false,
};

// The card the stub host hands back. first_mes is in here on purpose: it is a
// writing sample, and a model told to rewrite will copy one if it is shown one,
// so a test below checks it never reaches the prompt.
const CARD = {
  name: "Wren",
  description: "A ferry pilot who has crossed the same water for thirty years.",
  personality: "Blunt, and slow to trust anyone who arrives at night.",
  scenario: "The last crossing before the gate is shut.",
  first_mes: "The gate stands open, and the road past it is dark.",
  mes_example: "Wren: You are late.",
};

// answers is what the stubbed model says, one per call, in order.
function host(
  messages: Msg[],
  answers: string[],
  opts: {
    fail?: string;
    chatFail?: string;
    cardFail?: string;
    noCard?: boolean;
    loreFail?: string;
    noLore?: boolean;
    macroFail?: string;
    stream?: boolean;
  } = {},
) {
  const handlers: Record<string, Array<(p: any) => any>> = {};
  let frontHandler: any = null;
  const sent: any[] = [];
  const writes: Array<{ id: string; content: string }> = [];
  const asked: any[] = [];
  const msgs = messages.map((m) => ({ ...m }));
  let turn = 0;

  let chatBroken = false;
  const spindle = {
    on: (name: string, fn: any) => {
      (handlers[name] = handlers[name] || []).push(fn);
    },
    onFrontendMessage: (fn: any) => {
      frontHandler = fn;
    },
    sendToFrontend: (msg: any) => sent.push(msg),
    log: { info: () => {}, warn: () => {}, error: () => {} },
    generate: {
      quiet: async (req: any) => {
        asked.push(req);
        if (opts.fail) throw new Error(opts.fail);
        const answer = answers[Math.min(turn, answers.length - 1)];
        turn++;
        return { content: answer, finish_reason: "stop", usage: {} };
      },
      // Only present when the check asks for it, since a host without it is
      // the case the fallback exists for.
      quietStream: opts.stream
        ? async (req: any) => {
            asked.push(req);
            if (opts.fail) throw new Error(opts.fail);
            const answer = answers[Math.min(turn, answers.length - 1)];
            turn++;
            return (async function* () {
              // Handed over in pieces, the way a provider does.
              for (let i = 0; i < answer.length; i += 12) yield answer.slice(i, i + 12);
            })();
          }
        : undefined,
    },
    connections: {
      list: async () => [
        { id: "c-fast", name: "Cheap and quick", provider: "openai", model: "mini", is_default: false },
        { id: "c-main", name: "The good one", provider: "anthropic", model: "big", is_default: true },
      ],
    },
    macros: {
      // Stands in for Lumiverse's own resolver: the character fields and the
      // persona, and anything it does not know left as it was.
      resolve: async (text: string, opt: any) => {
        if (opts.macroFail) throw new Error(opts.macroFail);
        // The host resolves a card macro against a real chat. With no chat, or
        // with the characters permission refused, it comes back empty, which is
        // what the real one does and what the extension has to cope with.
        const known = !!(opt && opt.chatId) && !opts.cardFail && !opts.noCard;
        return String(text)
          .replace(/\{\{description\}\}/g, known ? CARD.description : "")
          .replace(/\{\{personality\}\}/g, known ? CARD.personality : "")
          .replace(/\{\{scenario\}\}/g, known ? CARD.scenario : "")
          .replace(/\{\{persona\}\}/g, known ? "A traveller who arrived at night." : "")
          .replace(/\{\{char\}\}/g, known ? CARD.name : "");
      },
    },
    world_books: {
      getActivated: async () => {
        if (opts.loreFail) throw new Error(opts.loreFail);
        return opts.noLore ? [] : [{ id: "w1" }, { id: "w2" }];
      },
      entries: {
        get: async (id: string) =>
          id === "w1"
            ? { name: "The crossing", content: "The ferry runs at dusk and never after." }
            : { name: "The gate", content: "The gate is shut at the last bell." },
      },
    },
    chats: {
      get: async () => {
        if (opts.chatFail) throw new Error(opts.chatFail);
        return opts.noCard ? { id: "c1" } : { id: "c1", character_id: "ch1" };
      },
    },
    characters: {
      get: async () => {
        if (opts.cardFail) throw new Error(opts.cardFail);
        return { ...CARD };
      },
    },
    chat: {
      getMessages: async () => {
        if (chatBroken) throw new Error("the host went away");
        return msgs.map((m) => ({ ...m }));
      },
      updateMessage: async (_chatId: string, id: string, patch: any) => {
        const m = msgs.find((x) => x.id === id);
        if (!m) return;
        Object.assign(m, patch);
        writes.push({ id: id, content: patch.content });
      },
    },
    storage: { read: async () => null, write: async () => {} },
    userStorage: { getJson: async () => null, setJson: async () => {} },
    permissions: { has: () => true, onChanged: () => {}, onDenied: () => {} },
  };

  vm.runInContext(
    SRC,
    vm.createContext({
      spindle,
      console,
      setTimeout,
      clearTimeout,
      AbortController,
      Date,
      JSON,
      Math,
      Number,
      String,
      Array,
      Object,
      Promise,
      Map,
      Set,
      RegExp,
      Error,
      isNaN,
      parseInt,
      parseFloat,
      globalThis,
    }),
  );

  return {
    sent,
    writes,
    asked,
    body: (id: string) => (msgs.find((m) => m.id === id) || ({} as any)).content,
    front: (p: any) => frontHandler(p, "u1"),
    ended: async (p: any) => {
      for (const fn of handlers.GENERATION_ENDED || []) await fn(p);
    },
    skipped: () => sent.filter((m) => m.type === "refine_skipped").map((m) => m.why),
    // Makes the host fail the way a host that went away does.
    breakChat: () => {
      chatBroken = true;
    },
  };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const chat = (): Msg[] => [
  // Written by a person. This is the one message that is never refined.
  { id: "m0", role: "assistant", content: "The gate stands open, and the road past it is dark." },
  { id: "m1", role: "user", content: "i walk through it" },
  { id: "m2", role: "assistant", content: "She stepped through and, suddenly, the cold just hit her." },
];

async function armed(answers: string[], over: any = {}, messages = chat(), opts = {}) {
  const h = host(messages, answers, opts);
  await h.front({ type: "set_settings", settings: { ...RULES, ...over } });
  return h;
}

describe("refining a reply", () => {
  test("the rewrite is saved over the reply", async () => {
    const h = await armed(["She stepped through and the cold hit her."]);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.body("m2")).toBe("She stepped through and the cold hit her.");
  });

  test("the greeting is never refined, whatever the settings say", async () => {
    // Asked for directly, which is the strongest way somebody could try.
    const h = await armed(["A polished greeting nobody asked for."]);
    await h.front({ type: "refine_now", requestId: "r", chatId: "c1", messageId: "m0" });
    await wait(50);
    expect(h.body("m0")).toBe("The gate stands open, and the road past it is dark.");
    const done = h.sent.find((m) => m.type === "refine_result");
    expect(done.ok).toBe(false);
    expect(done.why).toMatch(/greeting/i);
  });

  test("your own message is left alone by the automatic pass", async () => {
    const h = await armed(["i stride through it"], { refineUserMessages: true });
    await h.ended({ chatId: "c1", messageId: "m1" });
    await wait(50);
    expect(h.body("m1")).toBe("i walk through it");
  });

  test("but the button will refine it when you ask", async () => {
    const h = await armed(["I walk through it."], { refineUserMessages: true });
    await h.front({ type: "refine_now", requestId: "r", chatId: "c1", messageId: "m1" });
    await wait(50);
    expect(h.body("m1")).toBe("I walk through it.");
  });

  test("a chat switched off is left alone", async () => {
    const h = await armed(["Something better."]);
    await h.front({ type: "set_chats_off", chats: ["c1"] });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.body("m2")).toBe("She stepped through and, suddenly, the cold just hit her.");
  });

  test("a prompt that cannot work is refused before a model is called", async () => {
    const h = await armed(["anything"], {
      blocks: [{ id: "a", name: "Rules only", on: true, role: "system", text: "cut filler" }],
    });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.asked.length).toBe(0);
    expect(h.skipped()[0]).toMatch(/\{\{message\}\}/);
  });
});

describe("answers that must not be saved", () => {
  const original = "She stepped through and, suddenly, the cold just hit her.";

  const bad: Array<[string, string, RegExp]> = [
    [
      "a preamble instead of the edit",
      "Here is the rewritten message:\n\nShe stepped through and the cold hit her.",
      /wrote about the edit/i,
    ],
    [
      "a chatty opener",
      "Sure! She stepped through and the cold hit her.",
      /wrote about the edit/i,
    ],
    [
      "the model declining",
      "I'm sorry, but I can't help with rewriting this content.",
      /declined/i,
    ],
    ["nothing at all", "   ", /sent nothing back/i],
    ["the same text back", original, /changed nothing/i],
    [
      "a rewrite that grew into new scene",
      original + " " + "She kept walking and the road opened onto a field, and beyond it a house with one lit window, and she knew whoever waited there had been waiting a long time.",
      /longer/i,
    ],
    ["a rewrite with most of it missing", "She stepped through.", /shorter/i],
  ];

  for (const [name, answer, why] of bad) {
    test(name + " leaves the reply exactly as it was", async () => {
      const h = await armed([answer]);
      await h.ended({ chatId: "c1", messageId: "m2" });
      await wait(50);
      expect(h.body("m2")).toBe(original);
      expect(h.writes.length).toBe(0);
      expect(h.skipped().join(" ")).toMatch(why);
    });
  }

  test("a rewrite wrapped in quotes is unwrapped rather than dropped", async () => {
    const h = await armed(['"She stepped through and the cold hit her."']);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.body("m2")).toBe("She stepped through and the cold hit her.");
  });

  test("a rewrite that keeps its own dialogue quotes is left whole", async () => {
    const h = await armed(['"Wait," she said, and the cold hit her. "Wait."']);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.body("m2")).toBe('"Wait," she said, and the cold hit her. "Wait."');
  });

  test("a rewrite in a code fence is unfenced", async () => {
    const h = await armed(["```\nShe stepped through and the cold hit her.\n```"]);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.body("m2")).toBe("She stepped through and the cold hit her.");
  });
});

describe("what the pass costs", () => {
  test("thinking is off unless the reader turns it on", async () => {
    const h = await armed(["She stepped through and the cold hit her."]);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.asked[0].reasoning).toEqual({ source: "off" });
  });

  test("and left alone when they do", async () => {
    const h = await armed(["She stepped through and the cold hit her."], { thinkingMode: "inherit" });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.asked[0].reasoning).toBeUndefined();
  });

  test("the refine runs on the connection the reader picked", async () => {
    const h = await armed(["She stepped through and the cold hit her."], { connectionId: "c-fast" });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.asked[0].connection_id).toBe("c-fast");
  });

  test("and on whatever they are chatting with by default", async () => {
    const h = await armed(["She stepped through and the cold hit her."]);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.asked[0].connection_id).toBeUndefined();
  });

  test("the connections come back named, so nobody pastes an id", async () => {
    const h = await armed(["x"]);
    await h.front({ type: "list_connections", requestId: "r" });
    await wait(50);
    const got = h.sent.find((m) => m.type === "connections");
    expect(got.list.map((c: any) => c.name)).toEqual(["Cheap and quick", "The good one"]);
    expect(got.list[1].isDefault).toBe(true);
  });
});

describe("putting a refine back", () => {
  test("the text from before the refine goes back", async () => {
    const original = "She stepped through and, suddenly, the cold just hit her.";
    const h = await armed(["She stepped through and the cold hit her."]);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.body("m2")).not.toBe(original);
    await h.front({ type: "undo_refine", requestId: "u", chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.body("m2")).toBe(original);
  });

  test("with keeping switched off there is nothing to put back", async () => {
    const h = await armed(["She stepped through and the cold hit her."], { keepOriginal: false });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    await h.front({ type: "undo_refine", requestId: "u", chatId: "c1", messageId: "m2" });
    await wait(50);
    const done = h.sent.find((m) => m.type === "undo_result");
    expect(done.ok).toBe(false);
  });
});

describe("asking first", () => {
  test("with the confirmation on, nothing is saved until the answer comes back", async () => {
    const original = "She stepped through and, suddenly, the cold just hit her.";
    const h = await armed(["She stepped through and the cold hit her."], { confirmBeforeSave: true });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.body("m2")).toBe(original);
    const ask = h.sent.find((m) => m.type === "confirm_refine");
    expect(ask.before).toBe(original);
    expect(ask.after).toBe("She stepped through and the cold hit her.");
    await h.front({ type: "apply_refine", requestId: "a", chatId: "c1", messageId: "m2", after: ask.after });
    await wait(50);
    expect(h.body("m2")).toBe("She stepped through and the cold hit her.");
  });
});

describe("when the model will not answer", () => {
  test("a refused permission is named rather than swallowed", async () => {
    const h = await armed(["x"], {}, chat(), { fail: "PERMISSION_DENIED: generation" });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.skipped()[0]).toMatch(/generation permission/i);
    expect(h.writes.length).toBe(0);
  });

  test("and the reply is left exactly as it was", async () => {
    const h = await armed(["x"], {}, chat(), { fail: "the provider is down" });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.body("m2")).toBe("She stepped through and, suddenly, the cold just hit her.");
  });
});

describe("trying it before turning it on", () => {
  test("the answer comes back and nothing is written to the chat", async () => {
    const h = await armed(["A tighter version of the line."]);
    await h.front({ type: "try_refine", requestId: "t", text: "A line with, suddenly, filler in it." });
    await wait(50);
    const got = h.sent.find((m) => m.type === "try_result");
    expect(got.ok).toBe(true);
    expect(got.after).toBe("A tighter version of the line.");
    expect(h.writes.length).toBe(0);
  });

  test("and an answer that would have been dropped says why", async () => {
    const h = await armed(["Here is the rewritten message:\n\nSomething."]);
    await h.front({ type: "try_refine", requestId: "t", text: "A line with filler in it." });
    await wait(50);
    const got = h.sent.find((m) => m.type === "try_result");
    expect(got.ok).toBe(false);
    expect(got.why).toMatch(/wrote about the edit/i);
  });
});

// Everything the model was told, flattened, for the assertions that only care
// that a thing was said and not which block said it.
const said = (h: any) => (h.asked[0].messages || []).map((m: any) => m.content).join("\n\n");

describe("what the model is told about the scene", () => {
  test("the character card is in the prompt", async () => {
    const h = await armed(["She stepped through and the cold hit her."]);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(said(h)).toContain("A ferry pilot who has crossed the same water");
  });

  test("the card's own writing samples are not, so they cannot be copied in", async () => {
    const h = await armed(["She stepped through and the cold hit her."]);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(said(h)).not.toContain("You are late");
  });

  test("the run-up is in the prompt, with the two voices named apart", async () => {
    const h = await armed(["She stepped through and the cold hit her."]);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(said(h)).toContain("Player: i walk through it");
    expect(said(h)).toContain("Wren: The gate stands open");
  });

  test("the message being rewritten is sent once, not also as context", async () => {
    const h = await armed(["She stepped through and the cold hit her."]);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    const hits = said(h).split("She stepped through and, suddenly, the cold just hit her.").length - 1;
    expect(hits).toBe(1);
  });

  test("with context set to none, no history is sent", async () => {
    const h = await armed(["She stepped through and the cold hit her."], { contextMessages: 0 });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(said(h)).not.toContain("i walk through it");
  });

  test("a chat the card could not be read for refines anyway, without it", async () => {
    const h = await armed(["She stepped through and the cold hit her."], {}, chat(), {
      cardFail: "PERMISSION_DENIED: characters",
    });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.body("m2")).toBe("She stepped through and the cold hit her.");
    expect(said(h)).not.toContain("ferry pilot");
  });

  test("and so does a chat with no card on it", async () => {
    const h = await armed(["She stepped through and the cold hit her."], {}, chat(), { noCard: true });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.body("m2")).toBe("She stepped through and the cold hit her.");
    // With no name to use, the history still labels who spoke.
    expect(said(h)).toContain("Character: The gate stands open");
  });

  test("trying the rules on pasted text belongs to no chat, so no card is sent", async () => {
    const h = await armed(["A tighter version of the line."]);
    await h.front({ type: "try_refine", requestId: "t", text: "A line with, suddenly, filler in it." });
    await wait(50);
    expect(said(h)).not.toContain("ferry pilot");
    expect(said(h)).not.toContain("i walk through it");
  });
});

describe("the lorebook", () => {
  test("active entries go in the prompt", async () => {
    const h = await armed(["She stepped through and the cold hit her."]);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(said(h)).toContain("The ferry runs at dusk");
    expect(said(h)).toContain("The gate is shut at the last bell");
  });

  test("a chat with no active entries sends no lore block", async () => {
    const h = await armed(["She stepped through and the cold hit her."], {}, chat(), { noLore: true });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(said(h)).not.toContain("What is true in this world");
  });

  test("a refused world books permission refines anyway", async () => {
    const h = await armed(["She stepped through and the cold hit her."], {}, chat(), {
      loreFail: "PERMISSION_DENIED: world_books",
    });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.body("m2")).toBe("She stepped through and the cold hit her.");
    expect(said(h)).not.toContain("ferry runs at dusk");
  });

  test("switching the lore block off leaves it out", async () => {
    const h = await armed(["She stepped through and the cold hit her."], {
      blocks: [
        { id: "a", name: "Job", on: true, role: "system", text: "Rewrite it." },
        { id: "lore", name: "World", on: false, role: "system", text: "<world>{{lore}}</world>" },
        { id: "t", name: "Turn", on: true, role: "user", text: "{{message}}" },
      ],
    });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(said(h)).not.toContain("ferry runs at dusk");
  });
});

describe("how much thinking it asks for", () => {
  test("off sends the off source", async () => {
    const h = await armed(["She stepped through and the cold hit her."]);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.asked[0].reasoning).toEqual({ source: "off" });
  });

  test("inherit sends nothing, which is what leaves your settings alone", async () => {
    const h = await armed(["She stepped through and the cold hit her."], { thinkingMode: "inherit" });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.asked[0].reasoning).toBeUndefined();
  });

  test("an effort you picked is sent as a custom source", async () => {
    const h = await armed(["She stepped through and the cold hit her."], {
      thinkingMode: "custom",
      thinkingEffort: "high",
    });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.asked[0].reasoning).toEqual({ source: "custom", effort: "high" });
  });

  test("an effort that is not one of the three falls back rather than being sent", async () => {
    const h = await armed(["She stepped through and the cold hit her."], {
      thinkingMode: "custom",
      thinkingEffort: "as much as it takes",
    });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.asked[0].reasoning).toEqual({ source: "custom", effort: "medium" });
  });
});

describe("seeing what gets sent", () => {
  test("the preview is the real request and calls no model", async () => {
    const h = await armed(["should not be used"]);
    await h.front({ type: "preview_prompt", requestId: "p", chatId: "c1", messageId: "m2" });
    await wait(50);
    const got = h.sent.find((m) => m.type === "prompt_preview");
    expect(got.ok).toBe(true);
    expect(h.asked.length).toBe(0);
    const whole = got.messages.map((m: any) => m.content).join("\n");
    expect(whole).toContain("Cut filler words");
    expect(whole).toContain("She stepped through and, suddenly");
    expect(got.messages[got.messages.length - 1].role).toBe("user");
  });

  test("it writes nothing to the chat", async () => {
    const h = await armed(["x"]);
    await h.front({ type: "preview_prompt", requestId: "p", chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.writes.length).toBe(0);
    expect(h.body("m2")).toBe("She stepped through and, suddenly, the cold just hit her.");
  });

  test("it says when it had to stand in for a message", async () => {
    const h = await armed(["x"]);
    await h.front({ type: "preview_prompt", requestId: "p", chatId: null, messageId: null });
    await wait(50);
    const got = h.sent.find((m) => m.type === "prompt_preview");
    expect(got.ok).toBe(true);
    expect(got.real).toBe(false);
  });

  test("and carries the rest of the call, not just the messages", async () => {
    const h = await armed(["x"], { connectionId: "c-fast", samplers: { temperature: 0.4 } });
    await h.front({ type: "preview_prompt", requestId: "p", chatId: "c1", messageId: "m2" });
    await wait(50);
    const got = h.sent.find((m) => m.type === "prompt_preview");
    expect(got.connectionId).toBe("c-fast");
    expect(got.parameters).toEqual({ temperature: 0.4 });
  });
});

describe("how the prompt is put together", () => {
  test("blocks are sent in the order they are listed", async () => {
    const h = await armed(["She stepped through and the cold hit her."], {
      blocks: [
        { id: "a", name: "First", on: true, role: "system", text: "<one>alpha</one>" },
        { id: "b", name: "Second", on: true, role: "system", text: "<two>beta</two>" },
        { id: "t", name: "Turn", on: true, role: "user", text: "{{message}}" },
      ],
    });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    const whole = h.asked[0].messages[0].content;
    expect(whole.indexOf("alpha")).toBeLessThan(whole.indexOf("beta"));
  });

  test("a block switched off is left out", async () => {
    const h = await armed(["She stepped through and the cold hit her."], {
      blocks: [
        { id: "a", name: "Off", on: false, role: "system", text: "<one>alpha</one>" },
        { id: "t", name: "Turn", on: true, role: "user", text: "{{message}}" },
      ],
    });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(said(h)).not.toContain("alpha");
  });

  test("adjacent blocks with the same role become one message", async () => {
    const h = await armed(["She stepped through and the cold hit her."], {
      blocks: [
        { id: "a", name: "One", on: true, role: "system", text: "alpha" },
        { id: "b", name: "Two", on: true, role: "system", text: "beta" },
        { id: "t", name: "Turn", on: true, role: "user", text: "{{message}}" },
      ],
    });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.asked[0].messages.map((m: any) => m.role)).toEqual(["system", "user"]);
    expect(h.asked[0].messages[0].content).toBe("alpha\n\nbeta");
  });

  test("a block sent as a different role arrives as that role", async () => {
    const h = await armed(["She stepped through and the cold hit her."], {
      blocks: [
        { id: "a", name: "One", on: true, role: "system", text: "alpha" },
        { id: "b", name: "Two", on: true, role: "assistant", text: "beta" },
        { id: "t", name: "Turn", on: true, role: "user", text: "{{message}}" },
      ],
    });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.asked[0].messages.map((m: any) => m.role)).toEqual(["system", "assistant", "user"]);
  });

  test("a prompt with no turn macro is refused before a model is called", async () => {
    const h = await armed(["anything"], {
      blocks: [{ id: "a", name: "One", on: true, role: "system", text: "just rules, no turn" }],
    });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.asked.length).toBe(0);
    expect(h.skipped()[0]).toMatch(/\{\{message\}\}/);
  });

  test("a block whose macros all came back empty is left out, tags and all", async () => {
    const h = await armed(["She stepped through and the cold hit her."], {}, chat(), { noLore: true });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    // The lore block is <world>{{lore}}</world> and this chat has no lore, so
    // the model must not be told the world is empty.
    expect(said(h)).not.toContain("<world>");
  });
});

describe("macros", () => {
  test("the host answers the ones it owns", async () => {
    const h = await armed(["She stepped through and the cold hit her."]);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(said(h)).toContain("A ferry pilot who has crossed the same water");
  });

  test("ours are filled after the host has run, so a reply cannot inject one", async () => {
    // A reply that contains a macro. If ours were filled before the host pass,
    // the resolver would expand this into the prompt.
    const evil = chat();
    evil[2].content = "She stepped through, and {{description}} was written on the wall in full.";
    const h = await armed(["She stepped through, and {{description}} was on the wall."], {}, evil);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    const turn = h.asked[0].messages[h.asked[0].messages.length - 1].content;
    expect(turn).toContain("{{description}}");
    expect(turn).not.toContain("A ferry pilot who has crossed");
  });

  test("a macro nobody can answer is left as it was typed", async () => {
    const h = await armed(["She stepped through and the cold hit her."], {
      blocks: [
        { id: "a", name: "One", on: true, role: "system", text: "keep {{not_a_macro}} as it is" },
        { id: "t", name: "Turn", on: true, role: "user", text: "{{message}}" },
      ],
    });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(said(h)).toContain("{{not_a_macro}}");
  });

  test("a host that refuses to resolve does not stop the refine", async () => {
    const h = await armed(["She stepped through and the cold hit her."], {}, chat(), {
      macroFail: "PERMISSION_DENIED: macros",
    });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.body("m2")).toBe("She stepped through and the cold hit her.");
  });
});

describe("protecting what is not prose", () => {
  const marked = (): Msg[] => [
    { id: "m0", role: "assistant", content: "The gate stands open." },
    { id: "m1", role: "user", content: "i walk through it" },
    {
      id: "m2",
      role: "assistant",
      content:
        'She stepped through and, suddenly, <font color="#ffff00">the cold</font> just hit her, all at once.',
    },
  ];

  test("markup is never shown to the model", async () => {
    const h = await armed(["ok"], {}, marked());
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    const turn = h.asked[0].messages[h.asked[0].messages.length - 1].content;
    expect(turn).not.toContain("<font");
    expect(turn).toContain("[[AR1]]");
  });

  test("and comes back exactly as it was", async () => {
    const h = await armed(
      ["She stepped through and [[AR1]]the cold[[AR2]] hit her, all at once."],
      {},
      marked(),
    );
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.body("m2")).toBe(
      'She stepped through and <font color="#ffff00">the cold</font> hit her, all at once.',
    );
  });

  test("a rewrite that dropped the markup is refused rather than saved", async () => {
    const h = await armed(["She stepped through and the cold hit her, all at once."], {}, marked());
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.writes.length).toBe(0);
    expect(h.skipped().join(" ")).toMatch(/formatting/i);
  });

  test("switched off, the markup goes to the model as it is", async () => {
    const h = await armed(["ok"], { protectOn: false }, marked());
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    const turn = h.asked[0].messages[h.asked[0].messages.length - 1].content;
    expect(turn).toContain("<font");
  });

  test("a code fence is protected too", async () => {
    const fenced = marked();
    fenced[2].content = "She read it aloud.\n\n```\nkeep me exactly\n```\n\nThen she stopped.";
    const h = await armed(["She read it out.\n\n[[AR1]]\n\nThen she stopped, slowly."], {}, fenced);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.body("m2")).toContain("```\nkeep me exactly\n```");
  });

  test("the model's own thinking is never sent and comes back untouched", async () => {
    const thought = marked();
    thought[2].content =
      "<think>She is cold. Lead with that.</think>She stepped through and, suddenly, the cold just hit her.";
    const h = await armed(["She stepped through and the cold hit her."], {}, thought);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    const turn = h.asked[0].messages[h.asked[0].messages.length - 1].content;
    expect(turn).not.toContain("Lead with that");
    expect(h.body("m2")).toBe(
      "<think>She is cold. Lead with that.</think>She stepped through and the cold hit her.",
    );
  });
});

describe("the answer it asks for", () => {
  const original = "She stepped through and, suddenly, the cold just hit her.";

  test("the prompt asks for the rewrite in tags", async () => {
    const h = await armed(["<refined>She stepped through and the cold hit her.</refined>"]);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(said(h)).toContain("<refined>");
  });

  test("only what is between the tags is saved", async () => {
    const h = await armed(["<refined>She stepped through and the cold hit her.</refined>"]);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.body("m2")).toBe("She stepped through and the cold hit her.");
  });

  test("a model that talks around the tags is no longer a lost refine", async () => {
    // Word for word the answer that used to be dropped for its preamble.
    const h = await armed([
      "Sure! Here is the rewritten message:\n\n<refined>She stepped through and the cold hit her.</refined>\n\nI cut the filler.",
    ]);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.body("m2")).toBe("She stepped through and the cold hit her.");
  });

  test("a rewrite cut off before the closing tag is refused", async () => {
    const h = await armed(["<refined>She stepped through and the cold"]);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.body("m2")).toBe(original);
    expect(h.skipped().join(" ")).toMatch(/cut off/i);
  });

  test("with the tags switched off, the checks still catch a preamble", async () => {
    const h = await armed(
      ["Here is the rewritten message:\n\nShe stepped through and the cold hit her."],
      { wrapOutput: false },
    );
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.body("m2")).toBe(original);
    expect(h.skipped().join(" ")).toMatch(/wrote about the edit/i);
  });

  test("and the prompt stops asking for them", async () => {
    const h = await armed(["She stepped through and the cold hit her."], { wrapOutput: false });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(said(h)).not.toContain("<refined>");
  });
});

describe("when something goes wrong inside", () => {
  test("a handler that throws still answers, so the panel is not left waiting", async () => {
    // getMessages throwing is the shape of a host that went away mid-refine.
    const h = host(chat(), ["x"]);
    await h.front({ type: "set_settings", settings: RULES });
    (h as any).breakChat();
    await h.front({ type: "refine_now", requestId: "r", chatId: "c1", messageId: "m2" });
    await wait(50);
    const done = h.sent.find((m) => m.type === "refine_result");
    expect(done).toBeTruthy();
    expect(done.ok).toBe(false);
  });

  test("and the automatic pass answers too rather than going silent", async () => {
    const h = host(chat(), ["x"]);
    await h.front({ type: "set_settings", settings: RULES });
    (h as any).breakChat();
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.sent.some((m) => m.type === "refine_skipped")).toBe(true);
  });

  test("a preview still builds when the chat cannot be read", async () => {
    // Not a failure: a preview is about the shape of the request, and it is
    // more useful with a stand-in message than not at all. It says which it is.
    const h = host(chat(), ["x"]);
    await h.front({ type: "set_settings", settings: RULES });
    (h as any).breakChat();
    await h.front({ type: "preview_prompt", requestId: "p", chatId: "c1", messageId: "m2" });
    await wait(50);
    const got = h.sent.find((m) => m.type === "prompt_preview");
    expect(got.ok).toBe(true);
    expect(got.real).toBe(false);
  });
});

describe("watching it arrive", () => {
  test("a streaming connection reports as it writes", async () => {
    const h = await armed(["<refined>She stepped through and the cold hit her.</refined>"], {}, chat(), {
      stream: true,
    });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(60);
    const said = h.sent.filter((m) => m.type === "refine_progress");
    expect(said.some((m) => m.stage === "writing")).toBe(true);
    expect(h.body("m2")).toBe("She stepped through and the cold hit her.");
  });

  test("a connection that cannot stream still refines", async () => {
    const h = await armed(["<refined>She stepped through and the cold hit her.</refined>"]);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.body("m2")).toBe("She stepped through and the cold hit her.");
  });

  test("and streaming switched off falls back to the plain call", async () => {
    const h = await armed(
      ["<refined>She stepped through and the cold hit her.</refined>"],
      { streamProgress: false },
      chat(),
      { stream: true },
    );
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.sent.filter((m) => m.type === "refine_progress" && m.stage === "writing").length).toBe(0);
    expect(h.body("m2")).toBe("She stepped through and the cold hit her.");
  });
});

describe("sampler settings", () => {
  test("nothing is sent when the reader has not set any", async () => {
    const h = await armed(["She stepped through and the cold hit her."]);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.asked[0].parameters).toBeUndefined();
  });

  test("only the ones they filled in are sent", async () => {
    const h = await armed(["She stepped through and the cold hit her."], {
      samplers: { temperature: 0.4, top_p: "", top_k: "" },
    });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.asked[0].parameters).toEqual({ temperature: 0.4 });
  });

  test("a value past the end of its range is pulled back to the end", async () => {
    const h = await armed(["She stepped through and the cold hit her."], {
      samplers: { temperature: 9, top_p: -1 },
    });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.asked[0].parameters).toEqual({ temperature: 2, top_p: 0 });
  });

  test("anything that is not a sampler is not passed on", async () => {
    const h = await armed(["She stepped through and the cold hit her."], {
      samplers: { temperature: 0.4, api_key: "sk-nope", stream: true },
    });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.asked[0].parameters).toEqual({ temperature: 0.4 });
  });

  test("zero is a value, not a blank", async () => {
    const h = await armed(["She stepped through and the cold hit her."], {
      samplers: { temperature: 0 },
    });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.asked[0].parameters).toEqual({ temperature: 0 });
  });
});

describe("the backend after a restart", () => {
  test("it announces itself so the panel knows to tell it everything again", async () => {
    const h = host(chat(), ["x"]);
    expect(h.sent.some((m) => m.type === "backend_ready")).toBe(true);
  });

  test("and refines nothing until it has been told", async () => {
    const h = host(chat(), ["Something better."]);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.writes.length).toBe(0);
  });
});
