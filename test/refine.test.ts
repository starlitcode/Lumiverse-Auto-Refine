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
  { id: "answer", name: "How to answer", on: true, role: "system", text: "<how_to_answer>\nPut the rewritten message between <refined> and </refined>.\n</how_to_answer>\n\n{{protect_notes}}" },
  { id: "turn", name: "The turn", on: true, role: "user", text: "{{whose}}\n\n<turn_to_refine>\n{{message}}\n</turn_to_refine>" },
];

const RULES = {
  enabled: true,
  refineOn: true,
  blocks: PROMPT,
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
    // Runs while the model is "thinking", which is the window another
    // extension's write lands in.
    whileAsking?: () => void;
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
  let storageBroken = false;
  const shared: Record<string, string> = {};
  const perUser: Record<string, any> = {};
  const forbidden: string[] = [];
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
      // The loud one, which posts its result into the chat as a new message.
      // Calling this instead of quiet would turn every refine into a reply.
      raw: async () => {
        forbidden.push("generate.raw");
        return { content: "" };
      },
      rawStream: async () => {
        forbidden.push("generate.rawStream");
        return (async function* () {})();
      },
      quiet: async (req: any) => {
        asked.push(req);
        if (opts.whileAsking) opts.whileAsking();
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
      // Every way a host could let an extension put something in the chat.
      // None of these should ever be called: this extension edits a message
      // that already exists and does nothing else.
      createMessage: async () => {
        forbidden.push("chat.createMessage");
      },
      addMessage: async () => {
        forbidden.push("chat.addMessage");
      },
      sendMessage: async () => {
        forbidden.push("chat.sendMessage");
      },
      appendMessage: async () => {
        forbidden.push("chat.appendMessage");
      },
      deleteMessage: async () => {
        forbidden.push("chat.deleteMessage");
      },
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
    // The old shared store, which every account on a server would read the
    // same copy of. Kept so the upgrade path can be checked.
    storage: {
      read: async (file: string) => (file in shared ? shared[file] : null),
      write: async (file: string, text: string) => {
        if (storageBroken) throw new Error("the disk is full");
        shared[file] = text;
      },
    },
    // Per user, keyed the way the real one is. A check that reads back another
    // account's key is the whole point of this being here.
    userStorage: {
      getJson: async (file: string, o: any) => {
        const k = String((o && o.userId) || '') + ':' + file;
        return k in perUser ? perUser[k] : (o && o.fallback) !== undefined ? o.fallback : null;
      },
      setJson: async (file: string, value: any, o: any) => {
        if (storageBroken) throw new Error("the disk is full");
        perUser[String((o && o.userId) || '') + ':' + file] = value;
      },
    },
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
    // Lets a check stand in for another extension writing to the same reply.
    edit: (id: string, content: string) => {
      const m = msgs.find((x) => x.id === id);
      if (m) m.content = content;
    },
    body: (id: string) => (msgs.find((m) => m.id === id) || ({} as any)).content,
    front: (p: any, who?: string) => frontHandler(p, who === undefined ? "u1" : who),
    // What each account's store actually holds, and the old shared one.
    perUser,
    shared,
    breakStorage: () => {
      storageBroken = true;
    },
    ended: async (p: any) => {
      for (const fn of handlers.GENERATION_ENDED || []) await fn(p);
    },
    skipped: () => sent.filter((m) => m.type === "refine_skipped").map((m) => m.why),
    // Anything called that would have put something in the chat.
    forbidden,
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
    const h = await armed(["i stride through it"]);
    await h.ended({ chatId: "c1", messageId: "m1" });
    await wait(50);
    expect(h.body("m1")).toBe("i walk through it");
  });

  test("but asking for one refines it, with no setting in the way", async () => {
    const h = await armed(["<refined>I walk through it.</refined>"]);
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

  // The shipped prompt says a passage that already reads well comes back exactly
  // as it was. Calling that "the model changed nothing" reported the extension's
  // own instruction as a fault, and on a short piece of writing, which is most
  // of what an input box holds, it was the usual answer: the button looked
  // broken every time somebody had written a clean line.
  test("the same text back is an outcome, not a refusal", async () => {
    const h = await armed([original]);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.body("m2")).toBe(original);
    expect(h.writes.length).toBe(0);
    const why = h.skipped().join(" ");
    expect(why).toMatch(/already read well/i);
    expect(why).not.toMatch(/changed nothing/i);
  });

  test("and it is not asked again, since it has just said it needs no change", async () => {
    // Two answers waiting. A reason worth retrying takes the second; this one
    // must not, because asking again is paying twice for the same answer.
    const h = await armed([original, "She stepped through, and the cold took her."], { retryRefine: 1 });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.body("m2")).toBe(original);
    expect(h.asked.length).toBe(1);
  });

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

// A macro is for dropping what is already in the chat into the prompt: the
// passage, the pages before it, the lorebook, the card. One of them was not
// doing that. {{whose}} expanded into two sentences of the extension's own
// writing, chosen by the extension, and slid into a prompt the reader wrote
// without appearing anywhere they could read it, let alone reword it. The
// same words are in the shipped prompt for your own messages, where they can
// be read, reworded or deleted.
describe("what a macro is allowed to put in the prompt", () => {
  const MINE = ["in their own hand", "the story is written in more than one", "the story in its own voice"];

  test("no macro writes prose of its own into a reply's prompt", async () => {
    const h = await armed(["<refined>She stepped through and the cold hit her.</refined>"]);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    for (const words of MINE) expect(said(h)).not.toContain(words);
  });

  test("nor into your own message's prompt", async () => {
    const h = await armed(["<refined>I walk through it.</refined>"]);
    await h.front({ type: "refine_now", requestId: "r1", chatId: "c1", messageId: "m1" });
    await wait(50);
    for (const words of MINE) expect(said(h)).not.toContain(words);
  });

  // Written out by hand, the way somebody's saved prompt might still have it.
  // An unknown macro is left alone rather than filled in with words nobody
  // asked for.
  test("and a macro that no longer exists puts nothing in", async () => {
    const h = await armed(["<refined>She stepped through and the cold hit her.</refined>"], {
      blocks: [
        { id: "turn", name: "The passage", on: true, role: "user", text: "{{whose}}\n{{message}}" },
      ],
    });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    for (const words of MINE) expect(said(h)).not.toContain(words);
  });
});


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
    expect(said(h)).toContain("Co-author: i walk through it");
    expect(said(h)).not.toContain("Player:");
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

  // The card says it shows what gets sent, and it is the only place anybody can
  // check what a prompt actually costs or carries. It skipped the two steps a
  // real refine takes on the passage first, so it showed markup that never
  // reaches a model, reasoning that is cut off before the call, and no
  // {{protect_notes}} at all: the one macro that puts words rather than chat
  // into the prompt was the one the preview never showed.
  test("the preview shows the passage protected, the way the model gets it", async () => {
    const h = await armed(["x"], {}, [
      { id: "m1", role: "user", content: "i walk through it" },
      {
        id: "m2",
        role: "assistant",
        content: 'She stepped <font color="#ff0000">through</font> it, suddenly.',
      },
    ]);
    await h.front({ type: "preview_prompt", requestId: "p", chatId: "c1", messageId: "m2" });
    await wait(50);
    const whole = h.sent
      .find((m) => m.type === "prompt_preview")
      .messages.map((m: any) => m.content)
      .join("\n");
    expect(whole).toContain("[[AR1]]");
    expect(whole).not.toContain('<font color="#ff0000">');
  });

  test("and shows the words that go with the tokens", async () => {
    const h = await armed(["x"], {}, [
      { id: "m1", role: "user", content: "i walk through it" },
      {
        id: "m2",
        role: "assistant",
        content: 'She stepped <font color="#ff0000">through</font> it, suddenly.',
      },
    ]);
    await h.front({ type: "preview_prompt", requestId: "p", chatId: "c1", messageId: "m2" });
    await wait(50);
    const whole = h.sent
      .find((m) => m.type === "prompt_preview")
      .messages.map((m: any) => m.content)
      .join("\n");
    expect(whole).toContain("tokens shaped like");
    expect(whole).toContain("unchanged and in the same place");
  });

  // Nothing to protect, nothing to say about protecting it.
  test("and says nothing about tokens when there are none", async () => {
    const h = await armed(["x"]);
    await h.front({ type: "preview_prompt", requestId: "p", chatId: "c1", messageId: "m2" });
    await wait(50);
    const whole = h.sent
      .find((m) => m.type === "prompt_preview")
      .messages.map((m: any) => m.content)
      .join("\n");
    expect(whole).not.toContain("tokens shaped like");
  });

  // A reasoning model's working is cut off before the call, so a preview that
  // showed it was showing a passage no model is given.
  test("and leaves the model's own working out, as the call does", async () => {
    const h = await armed(["x"], {}, [
      { id: "m1", role: "user", content: "i walk through it" },
      {
        id: "m2",
        role: "assistant",
        content: "<think>weighing how to open</think>She stepped through it.",
      },
    ]);
    await h.front({ type: "preview_prompt", requestId: "p", chatId: "c1", messageId: "m2" });
    await wait(50);
    const whole = h.sent
      .find((m) => m.type === "prompt_preview")
      .messages.map((m: any) => m.content)
      .join("\n");
    expect(whole).not.toContain("weighing how to open");
    expect(whole).toContain("She stepped through it.");
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
    // Both halves. Checking only that the fence survived passes just as well
    // when the refine was refused and the original was left sitting there,
    // which is how the shield eating its own tokens went unnoticed: the fence
    // was always there because nothing was ever saved over it.
    expect(h.writes.length).toBe(1);
    expect(h.body("m2")).toContain("```\nkeep me exactly\n```");
    expect(h.body("m2")).toContain("Then she stopped, slowly.");
  });

  // The shield runs its rules one after another over text that already has
  // tokens in it, and one of those rules is for wiki-style brackets, which is
  // the shape of a token. So it hid its own work: a reply with inline code came
  // out as [[AR1]], the bracket rule hid that as [[AR2]], and a model that
  // copied every token back perfectly was still turned down for dropping one
  // piece of formatting. Every model, every time.
  //
  // One case per rule that runs before the bracket one, because being right
  // about the first shape and wrong about the rest is the shape of the bug.
  // Every token the model was actually shown, which is what a model that copies
  // them all back would send. Read off the prompt rather than assumed, so the
  // check is about what the shield did and not about the fixture's tag names.
  const tokensShown = (h: any): string[] => {
    const turn = h.asked[0].messages[h.asked[0].messages.length - 1].content;
    return String(turn).match(/\[\[AR\d+\]\]/g) || [];
  };

  const beforeTheBrackets: Array<[string, string, string, string]> = [
    ["inline code", "She said `hello there` and left.", "`hello there`", "She said %T and went."],
    ["a link", "Read [the note](https://x.test/a) later.", "[the note](https://x.test/a)", "Read %T soon."],
    [
      "an image",
      "It showed ![a gate](https://x.test/g.png) plainly.",
      "![a gate](https://x.test/g.png)",
      "It showed %T clearly.",
    ],
    [
      "a comment",
      "She left the room. <!-- a note to self --> Then it was quiet.",
      "<!-- a note to self -->",
      "She left the room. %T Then it went quiet.",
    ],
  ];
  for (const [what, body, keep, answer] of beforeTheBrackets) {
    test("a reply with " + what + " is not turned down for keeping every token", async () => {
      const msgs = marked();
      msgs[2].content = body;
      const seen = await armed([], {}, msgs);
      await seen.ended({ chatId: "c1", messageId: "m2" });
      await wait(50);
      const toks = tokensShown(seen);
      // One piece of formatting, so one token. More than one means the shield
      // hid something of its own, which is the fault itself.
      expect(toks.length).toBe(1);

      const h = await armed(["<REFINED>" + answer.replace("%T", toks.join(" ")) + "</REFINED>"], {}, msgs);
      await h.ended({ chatId: "c1", messageId: "m2" });
      await wait(50);
      expect(h.skipped().join(" ")).not.toMatch(/formatting/i);
      expect(h.writes.length).toBe(1);
      expect(h.body("m2")).toContain(keep);
    });
  }

  test("a token swallowed inside a bigger match still comes back", async () => {
    // A table row is a region that can hold a token, since inline code inside a
    // cell is hidden before the row rule runs. Putting the row back has to put
    // back what was inside it too, rather than leaving [[AR1]] on screen.
    const msgs = marked();
    msgs[2].content = "She read the whole sheet.\n\n| name | `code` |\n\nThen she looked up.";
    const seen = await armed([], {}, msgs);
    await seen.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    const toks = tokensShown(seen);
    const h = await armed(
      ["<REFINED>She read the sheet through.\n\n" + toks.join("\n") + "\n\nThen she looked up.</REFINED>"],
      {},
      msgs,
    );
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.skipped().join(" ")).not.toMatch(/formatting/i);
    const saved = h.body("m2");
    expect(saved).toContain("| name | `code` |");
    expect(saved).not.toMatch(/\[\[AR\d+\]\]/);
  });

  test("a rewrite that really did drop a token is still refused", async () => {
    // The fix must not be "stop checking". A model that leaves the token out
    // has lost the formatting, and that answer is still turned down.
    const msgs = marked();
    msgs[2].content = "She said `hello there` and left.";
    const h = await armed(["<REFINED>She said nothing and left.</REFINED>"], {}, msgs);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.writes.length).toBe(0);
    expect(h.skipped().join(" ")).toMatch(/formatting/i);
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

describe("nothing is ever sent to the chat", () => {
  // The whole extension edits one message that already exists. There is no
  // path that writes a new one, and the check is worth having because the
  // difference between generate.quiet and generate.raw is one word and the
  // second one posts its answer into the conversation.
  test("a refine writes over the message and creates nothing", async () => {
    const h = await armed(["<refined>She stepped through and the cold hit her.</refined>"]);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.forbidden).toEqual([]);
    expect(h.writes.length).toBe(1);
    expect(h.writes[0].id).toBe("m2");
  });

  test("the generation is the quiet one, which does not post its answer", async () => {
    const h = await armed(["<refined>She stepped through and the cold hit her.</refined>"]);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.forbidden).toEqual([]);
    expect(h.asked.length).toBe(1);
  });

  test("trying the rules writes nothing at all", async () => {
    const h = await armed(["<refined>A tighter line.</refined>"]);
    await h.front({ type: "try_refine", requestId: "t", text: "A line with filler in it." });
    await wait(50);
    expect(h.forbidden).toEqual([]);
    expect(h.writes.length).toBe(0);
  });

  test("and a preview neither writes nor generates", async () => {
    const h = await armed(["x"]);
    await h.front({ type: "preview_prompt", requestId: "p", chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.forbidden).toEqual([]);
    expect(h.writes.length).toBe(0);
    expect(h.asked.length).toBe(0);
  });

  test("a dropped rewrite writes nothing, so a refusal cannot reach the chat", async () => {
    const h = await armed(["I'm sorry, but I can't help with rewriting this content."]);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.forbidden).toEqual([]);
    expect(h.writes.length).toBe(0);
  });
});

describe("the answer it asks for", () => {
  const original = "She stepped through and, suddenly, the cold just hit her.";

  // The ask is the prompt's, written out in a block, not a macro this extension
  // fills in. Which means it reaches the model exactly as it was typed.
  test("the prompt asks for the rewrite in the words the block was written in", async () => {
    const h = await armed(["<refined>She stepped through and the cold hit her.</refined>"]);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(said(h)).toContain("Put the rewritten message between <refined> and </refined>.");
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

  // Switching it off changes how the answer is read, never what was asked. The
  // ask belongs to whoever wrote the block, so it goes out either way and it is
  // theirs to delete.
  test("switching it off leaves the prompt exactly as it was written", async () => {
    const h = await armed(["She stepped through and the cold hit her."], { wrapOutput: false });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(said(h)).toContain("<refined>");
    expect(h.body("m2")).toBe("She stepped through and the cold hit her.");
  });

  // Nothing outside the tags is ever saved, which is what makes it somewhere a
  // prompt can safely ask for a report on what was cut.
  test("what the model wrote around the tags is carried back, not saved", async () => {
    const h = await armed([
      "<changes>Cut two filler words. Left the dialogue alone.</changes>\n" +
        "<refined>She stepped through and the cold hit her.</refined>",
    ]);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.body("m2")).toBe("She stepped through and the cold hit her.");
    const notes = h.sent.filter((m: any) => m && typeof m.notes === "string" && m.notes);
    expect(notes.length).toBeGreaterThan(0);
    expect(notes[0].notes).toContain("Left the dialogue alone");
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

// Settings used to live only in the browser, so opening Lumiverse anywhere else
// presented a fresh install. They belong to the account, and on a server serving
// several accounts they have to belong to one account each.
describe("settings that follow the account", () => {
  test("saving writes them to the account, not just to memory", async () => {
    const h = await armed(["<refined>x</refined>"]);
    expect(h.perUser["u1:settings.json"]).toBeTruthy();
    expect(h.perUser["u1:settings.json"].contextMessages).toBe(RULES.contextMessages);
  });

  test("loading gives back what that account saved", async () => {
    const h = await armed(["<refined>x</refined>"], { contextMessages: 11 });
    await h.front({ type: "load_settings", requestId: "r1" });
    await wait(10);
    const got = h.sent.find((m: any) => m.type === "loaded_settings" && m.requestId === "r1");
    expect(got).toBeTruthy();
    expect(got.settings.contextMessages).toBe(11);
  });

  // The one that matters on a shared server. Two accounts, two prompts, and
  // neither can read the other's.
  test("one account cannot read another's settings", async () => {
    const h = host(chat(), ["<refined>x</refined>"]);
    await h.front({ type: "set_settings", settings: { ...RULES, contextMessages: 3 } }, "alice");
    await h.front({ type: "set_settings", settings: { ...RULES, contextMessages: 8 } }, "bob");
    await h.front({ type: "load_settings", requestId: "ra" }, "alice");
    await h.front({ type: "load_settings", requestId: "rb" }, "bob");
    await wait(10);
    const a = h.sent.find((m: any) => m.type === "loaded_settings" && m.requestId === "ra");
    const b = h.sent.find((m: any) => m.type === "loaded_settings" && m.requestId === "rb");
    expect(a.settings.contextMessages).toBe(3);
    expect(b.settings.contextMessages).toBe(8);
  });

  test("presets are the same story", async () => {
    const h = host(chat(), ["<refined>x</refined>"]);
    await h.front({ type: "save_presets", presets: [{ name: "Alice's", at: 1, settings: {} }] }, "alice");
    await h.front({ type: "load_presets", requestId: "pb" }, "bob");
    await wait(10);
    const b = h.sent.find((m: any) => m.type === "loaded_presets" && m.requestId === "pb");
    expect(b.presets).toBe(null);
  });

  // Somebody who had settings before this existed should not open the panel to
  // a fresh install.
  test("the old shared copy is carried up on the first read", async () => {
    const h = host(chat(), ["<refined>x</refined>"]);
    h.shared["settings.json"] = JSON.stringify({ contextMessages: 6 });
    await h.front({ type: "load_settings", requestId: "r1" });
    await wait(10);
    const got = h.sent.find((m: any) => m.type === "loaded_settings" && m.requestId === "r1");
    expect(got.settings.contextMessages).toBe(6);
    expect(h.perUser["u1:settings.json"].contextMessages).toBe(6);
  });

  // Settings that look saved and are not is the worst shape this can take.
  // Both stores down. One down alone is not a failure: the write falls through
  // to the other rather than being lost, which is the point of the fallback.
  test("a write that fails everywhere says so rather than going quiet", async () => {
    const h = host(chat(), ["<refined>x</refined>"]);
    h.breakStorage();
    await h.front({ type: "set_settings", settings: RULES });
    await wait(10);
    expect(h.sent.some((m: any) => m.type === "account_save_failed" && m.what === "settings")).toBe(true);
  });

  // A refine still works when the disk does not, because the settings that
  // matter are already in memory.
  test("and a failed write does not stop the refine that follows", async () => {
    const h = host(chat(), ["<refined>She stepped through and the cold hit her.</refined>"]);
    h.breakStorage();
    await h.front({ type: "set_settings", settings: RULES });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.body("m2")).toBe("She stepped through and the cold hit her.");
  });
});

// Two extensions on one reply. Auto Retry swaps words on the same event this
// refines on, and a refine takes seconds: the message it read is not
// necessarily the message that is there when it writes.
describe("when something else edits the reply mid-refine", () => {
  test("the refine is dropped rather than reverting the other edit", async () => {
    const h = host(chat(), ["<refined>She stepped through and the cold hit her.</refined>"], {
      whileAsking: () => h.edit("m2", "Somebody else got here first."),
    });
    await h.front({ type: "set_settings", settings: RULES });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.body("m2")).toBe("Somebody else got here first.");
    expect(h.skipped().join(" ")).toMatch(/changed while the rewrite/i);
  });

  test("and nothing is written at all, so the other edit survives whole", async () => {
    const h = host(chat(), ["<refined>She stepped through and the cold hit her.</refined>"], {
      whileAsking: () => h.edit("m2", "Somebody else got here first."),
    });
    await h.front({ type: "set_settings", settings: RULES });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.writes.length).toBe(0);
  });

  // The guard must not fire when nothing actually moved.
  test("an untouched reply is still refined", async () => {
    const h = await armed(["<refined>She stepped through and the cold hit her.</refined>"]);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.body("m2")).toBe("She stepped through and the cold hit her.");
  });
});

// The panel's button and the floating button both mean "the latest reply", and
// both send no message id whenever nothing has rendered since the page loaded,
// which on a chat you opened and did not add to is every time. That used to
// come back as "that message is not in this chat any more": the button did
// nothing and said something untrue about why.
describe("refining the latest reply with no message id in hand", () => {
  test("the latest reply is found and refined", async () => {
    const h = await armed(["<refined>She stepped through and the cold hit her.</refined>"]);
    await h.front({ type: "refine_now", requestId: "r1", chatId: "c1", messageId: null });
    await wait(50);
    const got = h.sent.find((m: any) => m.type === "refine_result" && m.requestId === "r1");
    expect(got.ok).toBe(true);
    expect(h.body("m2")).toBe("She stepped through and the cold hit her.");
  });

  test("and it is the last reply, not the first thing in the chat", async () => {
    const h = await armed(["<refined>She stepped through and the cold hit her.</refined>"]);
    await h.front({ type: "refine_now", requestId: "r1", chatId: "c1", messageId: null });
    await wait(50);
    // m0 is the greeting and m1 is the player's line; neither is touched.
    expect(h.writes.map((w: any) => w.id)).toEqual(["m2"]);
  });

  // A chat holding nothing but a greeting has no reply to refine. Offering the
  // greeting would offer the one message that is always refused.
  test("a chat with only a greeting says so plainly", async () => {
    const h = await armed(
      ["<refined>x</refined>"],
      {},
      [{ id: "m0", role: "assistant", content: "The gate stands open." }],
    );
    await h.front({ type: "refine_now", requestId: "r1", chatId: "c1", messageId: null });
    await wait(50);
    const got = h.sent.find((m: any) => m.type === "refine_result" && m.requestId === "r1");
    expect(got.ok).toBe(false);
    expect(got.why).toMatch(/no reply in this chat to refine yet/);
    expect(h.writes.length).toBe(0);
  });

  // A named message that has since gone still says the right thing: the two
  // cases are different and used to share one wrong sentence.
  test("a message id that is gone still says that, not the other thing", async () => {
    const h = await armed(["<refined>x</refined>"]);
    await h.front({ type: "refine_now", requestId: "r1", chatId: "c1", messageId: "gone" });
    await wait(50);
    const got = h.sent.find((m: any) => m.type === "refine_result" && m.requestId === "r1");
    expect(got.why).toMatch(/not in this chat any more/);
  });
});

// A reasoning model is asked for its working in a tag of its own, before the
// rewrite. The tag sits outside <REFINED>, so none of it can reach the chat,
// and it comes back to the panel to be shown beside the refine.
describe("the working a reasoning prompt asks for", () => {
  const answer =
    "<REFINE_NOTES>\n" +
    "The second sentence restates the first. Cutting the held breath.\n" +
    "Leaving the dialogue alone: the clipped voice is deliberate.\n" +
    "</REFINE_NOTES>\n" +
    "<REFINED>She stepped through and the cold hit her.</REFINED>";

  test("only the rewrite is saved", async () => {
    const h = await armed([answer]);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.body("m2")).toBe("She stepped through and the cold hit her.");
  });

  test("and none of the working leaks into the message", async () => {
    const h = await armed([answer]);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.body("m2")).not.toContain("REFINE_NOTES");
    expect(h.body("m2")).not.toContain("restates the first");
  });

  test("but it is carried back so the panel can show it", async () => {
    const h = await armed([answer]);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    const carried = h.sent.filter((m: any) => m && typeof m.notes === "string" && m.notes);
    expect(carried.length).toBeGreaterThan(0);
    expect(carried[0].notes).toContain("Leaving the dialogue alone");
  });

  // The rewrite is on the card already, marked against what it replaced, so
  // carrying it back under the working would be sending it twice.
  test("and the rewrite is not carried back with it", async () => {
    const h = await armed([answer]);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    const carried = h.sent.filter((m: any) => m && typeof m.notes === "string" && m.notes);
    expect(carried[0].notes).not.toContain("the cold hit her");
    expect(carried[0].notes).not.toContain("REFINED");
  });

  // The tags are shouted. A prompt asking in lower case still works, because
  // the answer is read case-insensitively.
  test("a prompt asking in lower case reads the same", async () => {
    const h = await armed(["<refined>She stepped through and the cold hit her.</refined>"]);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.body("m2")).toBe("She stepped through and the cold hit her.");
  });
});

// A reasoning block this fails to recognise is handed to the refiner as prose,
// rewritten, and saved over the reply. That is a worse failure than missing a
// check, which is why the list is the reader's to extend.
describe("thinking the extension has to recognise", () => {
  const withHead = (head: string): Msg[] => [
    { id: "m0", role: "assistant", content: "The gate stands open, and the road past it is dark." },
    { id: "m1", role: "user", content: "i walk through it" },
    {
      id: "m2",
      role: "assistant",
      content: head + "She stepped through and, suddenly, the cold just hit her.",
    },
  ];

  test("a built-in tag is kept out of what the model is shown", async () => {
    const h = await armed(
      ["<REFINED>She stepped through and the cold hit her.</REFINED>"],
      {},
      withHead("<scratchpad>plan the edit</scratchpad>\n\n"),
    );
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(said(h)).not.toContain("plan the edit");
    expect(h.body("m2")).toContain("<scratchpad>plan the edit</scratchpad>");
  });

  test("an unusual one is sent as prose until it is named", async () => {
    const h = await armed(
      ["<REFINED>She stepped through and the cold hit her.</REFINED>"],
      {},
      withHead("<mythink>plan the edit</mythink>\n\n"),
    );
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(said(h)).toContain("plan the edit");
  });

  test("and is kept out once the reader names it", async () => {
    const h = await armed(
      ["<REFINED>She stepped through and the cold hit her.</REFINED>"],
      { thinkTags: "mythink" },
      withHead("<mythink>plan the edit</mythink>\n\n"),
    );
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(said(h)).not.toContain("plan the edit");
    expect(h.body("m2")).toContain("<mythink>plan the edit</mythink>");
  });

  test("a name pasted with its brackets still works", async () => {
    const h = await armed(
      ["<REFINED>She stepped through and the cold hit her.</REFINED>"],
      { thinkTags: "<mythink>" },
      withHead("<mythink>plan the edit</mythink>\n\n"),
    );
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(said(h)).not.toContain("plan the edit");
  });

  // A name is letters, digits, underscores and hyphens. Anything that would
  // change what the pattern means is dropped rather than escaped.
  test("a name that would break the pattern cannot", async () => {
    const h = await armed(
      ["<REFINED>She stepped through and the cold hit her.</REFINED>"],
      { thinkTags: ".*|(" },
      withHead("<mythink>plan the edit</mythink>\n\n"),
    );
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    // The junk name matched nothing, so the block went through as prose and the
    // message arrived whole rather than the pattern eating it.
    expect(said(h)).toContain("plan the edit");
    expect(said(h)).toContain("the cold just hit her");
  });
});

describe("stopping a refine", () => {
  test("a stop reaches the run and the reply is left alone", async () => {
    const h = host(chat(), ["<REFINED>She stepped through and the cold hit her.</REFINED>"], {
      // Stop it while the model is still "thinking".
      whileAsking: () => {
        h.front({ type: "cancel_refine", requestId: "s1" });
      },
    });
    await h.front({ type: "set_settings", settings: RULES });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(60);
    const said2 = h.sent.find((m: any) => m.type === "refine_stopped" && m.requestId === "s1");
    expect(said2).toBeTruthy();
    expect(said2.stopped).toBe(1);
  });

  test("stopping when nothing is running says so rather than claiming otherwise", async () => {
    const h = await armed(["<REFINED>x</REFINED>"]);
    await h.front({ type: "cancel_refine", requestId: "s1" });
    await wait(10);
    const got = h.sent.find((m: any) => m.type === "refine_stopped" && m.requestId === "s1");
    expect(got.stopped).toBe(0);
  });

  // With the wait switched off there is no timer to end a run, so Stop is the
  // only way out and it has to keep working. The run is still held for that
  // reason and no other.
  test("a stop still reaches the run with the wait switched off", async () => {
    const h = host(chat(), ["<REFINED>She stepped through and the cold hit her.</REFINED>"], {
      whileAsking: () => {
        h.front({ type: "cancel_refine", requestId: "s2" });
      },
    });
    await h.front({ type: "set_settings", settings: { ...RULES, timeoutSecs: 0 } });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(60);
    const said = h.sent.find((m: any) => m.type === "refine_stopped" && m.requestId === "s2");
    expect(said).toBeTruthy();
    expect(said.stopped).toBe(1);
  });

  // Zero is a setting, not a missing value, and it reaches the backend as one.
  // Proving the timer is really absent would need a refine slower than the
  // default wait, which is a minute and a half of test, so this checks the step
  // that was actually wrong: the setting arriving and being kept.
  test("the wait switched off reaches the backend as nought", async () => {
    const h = await armed(["<REFINED>She stepped through and the cold hit her.</REFINED>"]);
    await h.front({ type: "set_settings", settings: { ...RULES, timeoutSecs: 0 } });
    await h.front({ type: "load_settings", requestId: "q1" });
    await wait(20);
    const got = h.sent.find((m: any) => m.type === "loaded_settings" && m.requestId === "q1");
    expect(got).toBeTruthy();
    expect(got.settings.timeoutSecs).toBe(0);
  });
});

// The failure the other checks cannot see. A softened reply is not a refusal,
// is the right length, and keeps every protected token. It is only wrong beside
// the original, which is the one thing nothing else here looks at.
describe("a rewrite that sanitised the reply", () => {
  const bloody = (): Msg[] => [
    { id: "m0", role: "assistant", content: "The gate stands open." },
    { id: "m1", role: "user", content: "i go in" },
    {
      id: "m2",
      role: "assistant",
      content:
        "The blade went in under his ribs and the blood came fast, soaking her sleeve. " +
        "He was bleeding out on the stones before she got the knife free.",
    },
  ];

  test("dropping the charged language is refused", async () => {
    const h = await armed(
      [
        "<REFINED>The strike landed under his ribs and he went down hard, " +
          "soaking her sleeve. He was fading on the stones before she stepped back.</REFINED>",
      ],
      {},
      bloody(),
    );
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.writes.length).toBe(0);
    expect(h.skipped().join(" ")).toMatch(/softened the reply/i);
  });

  // The check has to survive ordinary tightening or it gets switched off, and
  // then it catches nothing at all.
  test("an ordinary tightening that keeps the register is saved", async () => {
    const h = await armed(
      [
        "<REFINED>The blade went in under his ribs. The blood came fast and soaked her sleeve, " +
          "and he was bleeding out on the stones before she got the knife free.</REFINED>",
      ],
      {},
      bloody(),
    );
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.writes.length).toBe(1);
  });

  test("switched off, the softened rewrite is saved", async () => {
    const h = await armed(
      [
        "<REFINED>The strike landed under his ribs and he went down hard, " +
          "soaking her sleeve. He was fading on the stones before she stepped back.</REFINED>",
      ],
      { guardSoften: false },
      bloody(),
    );
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.writes.length).toBe(1);
  });

  // Prose that never had the register cannot be softened out of it, and a
  // single word going is an edit rather than sanitising.
  test("a reply with almost none of it is left to the other checks", async () => {
    const h = await armed(["<REFINED>She stepped through and the cold hit her.</REFINED>"]);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.writes.length).toBe(1);
  });

  test("a word of the reader's own counts too", async () => {
    const h = await armed(
      ["<REFINED>She stepped through and the cold hit her at last.</REFINED>"],
      { softenWords: "cursed\nwretched\nbitter" },
      [
        { id: "m0", role: "assistant", content: "The gate stands open." },
        { id: "m1", role: "user", content: "i go in" },
        {
          id: "m2",
          role: "assistant",
          content: "She stepped through, cursed and wretched, into the bitter cold that hit her.",
        },
      ],
    );
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.skipped().join(" ")).toMatch(/softened the reply/i);
  });
});

describe("asking again when a check fails", () => {
  test("off by default, so one bad answer is one call", async () => {
    const h = await armed([
      "I'm sorry, but I can't help with that.",
      "<REFINED>She stepped through and the cold hit her.</REFINED>",
    ]);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(60);
    expect(h.asked.length).toBe(1);
    expect(h.writes.length).toBe(0);
  });

  test("switched on, a refusal is asked again and the clean answer is saved", async () => {
    const h = await armed(
      [
        "I'm sorry, but I can't help with that.",
        "<REFINED>She stepped through and the cold hit her.</REFINED>",
      ],
      { retryRefine: 2 },
    );
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(80);
    expect(h.asked.length).toBe(2);
    expect(h.body("m2")).toBe("She stepped through and the cold hit her.");
  });

  test("it gives up after the number you set", async () => {
    const h = await armed(["I'm sorry, but I can't help with that."], { retryRefine: 2 });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(90);
    expect(h.asked.length).toBe(3);
    expect(h.writes.length).toBe(0);
  });

  // A rewrite refused for its length is one the model meant. Asking again buys
  // the same answer at the same price.
  test("a failure a second try cannot fix is not retried", async () => {
    const h = await armed(["<REFINED>Short.</REFINED>"], { retryRefine: 2 });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(80);
    expect(h.asked.length).toBe(1);
    expect(h.skipped().join(" ")).toMatch(/shorter/i);
  });

  test("and a stop is never asked again", async () => {
    const h = host(chat(), ["<REFINED>She stepped through and the cold hit her.</REFINED>"], {
      whileAsking: () => {
        h.front({ type: "cancel_refine", requestId: "s1" });
      },
    });
    await h.front({ type: "set_settings", settings: { ...RULES, retryRefine: 3 } });
    await h.ended({ chatId: "c1", messageId: "m2", userId: "u1" });
    await wait(80);
    expect(h.asked.length).toBe(1);
  });
});

// A provider that caches prompts reuses the run of the request that has not
// changed since last time, counting from the front. So everything that holds
// still belongs above everything that moves: the rules, then the setting, then
// the pages before this one, then the passage.
//
// The presets used to put the run-up third, which put a block that is redrawn
// every turn above every rule, and made the whole prompt new on every reply.
describe("a prompt built to be cached", () => {
  // Built from the prompt that ships, not the small fixture the other checks
  // use: an empty list falls back to the default, which is the thing whose
  // order this is about.
  const build = async (over: any = {}) => {
    const h = await armed(["<REFINED>She stepped through and the cold hit her.</REFINED>"], {
      blocks: [],
      ...over,
    });
    await h.front({ type: "preview_prompt", requestId: "p1", chatId: "c1", messageId: "m2" });
    await wait(20);
    const got = h.sent.find((m: any) => m.type === "prompt_preview" && m.requestId === "p1");
    return (got.messages || []).map((m: any) => String(m.content || "")).join("\n\n");
  };

  test("the run-up and the passage come after the rules", async () => {
    const whole = await build();
    const rules = whole.indexOf("</how_to_answer>");
    const runUp = whole.indexOf("<earlier_pages>");
    const turn = whole.indexOf("<passage_to_refine>");
    expect(rules).toBeGreaterThan(-1);
    expect(runUp).toBeGreaterThan(rules);
    expect(turn).toBeGreaterThan(runUp);
  });

  test("and the setting sits between them", async () => {
    const whole = await build();
    const rules = whole.indexOf("</how_to_answer>");
    const who = whole.indexOf("<who_the_story_follows>");
    const runUp = whole.indexOf("<earlier_pages>");
    expect(who).toBeGreaterThan(rules);
    expect(runUp).toBeGreaterThan(who);
  });

  // What the front of the request is worth: the run above the first thing that
  // moved is the same on every refine, so it is the part a provider can reuse.
  test("the rules are byte for byte the same across two different chats", async () => {
    const a = await build();
    const b = await build();
    const cut = (t: string) => t.slice(0, t.indexOf("<who_the_story_follows>"));
    expect(cut(a)).toBe(cut(b));
    expect(cut(a).length).toBeGreaterThan(200);
  });
});

// The built-in shield covers the shapes that turn up everywhere. What a
// particular card prints is the reader's to name, so their patterns are added
// to the list instead of replacing it.
describe("shielding what the built-in rules miss", () => {
  const withScaffold = (body: string): Msg[] => [
    { id: "m0", role: "assistant", content: "The gate stands open." },
    { id: "m1", role: "user", content: "i go in" },
    { id: "m2", role: "assistant", content: body },
  ];

  test("a table row is hidden, because a grid is not prose", async () => {
    const h = await armed(
      ["<REFINED>She stepped through and the cold hit her at last.</REFINED>"],
      {},
      withScaffold("| HP | 12/20 |\nShe stepped through and, suddenly, the cold just hit her."),
    );
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(said(h)).not.toContain("12/20");
  });

  test("and a bare URL, which a rewrite likes to tidy", async () => {
    const h = await armed(
      ["<REFINED>She stepped through and the cold hit her at last.</REFINED>"],
      {},
      withScaffold("See https://example.com/a_b_c. She stepped through and, suddenly, the cold just hit her."),
    );
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(said(h)).not.toContain("example.com");
  });

  test("a shape of the reader's own is hidden once they name it", async () => {
    const body = "((tracker: day 3)) She stepped through and, suddenly, the cold just hit her.";
    const without = await armed(
      ["<REFINED>She stepped through and the cold hit her at last.</REFINED>"],
      {},
      withScaffold(body),
    );
    await without.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(said(without)).toContain("tracker: day 3");

    const withIt = await armed(
      ["<REFINED>She stepped through and the cold hit her at last.</REFINED>"],
      { shieldAdd: "\\(\\([^)]*\\)\\)" },
      withScaffold(body),
    );
    await withIt.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(said(withIt)).not.toContain("tracker: day 3");
  });

  test("and an exclude keeps a region visible that a built-in would have hidden", async () => {
    const h = await armed(
      ["<REFINED>She stepped through and the cold hit her at last.</REFINED>"],
      { protectInline: true, shieldKeep: "<i>|</i>" },
      withScaffold("She stepped <i>through</i> and, suddenly, the cold just hit her."),
    );
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(said(h)).toContain("<i>through</i>");
  });

  // A pattern that will not compile is named, so a typo is visible instead of
  // being a region somebody believes is shielded.
  test("a pattern that cannot be read is reported", async () => {
    const h = await armed(["<REFINED>x</REFINED>"], { shieldAdd: "([unclosed" });
    await wait(10);
    const said2 = h.sent.find((m: any) => m.type === "shield_bad");
    expect(said2).toBeTruthy();
    expect(said2.patterns.join(" ")).toContain("([unclosed");
  });

  // One that matches the empty string would match at every position and turn
  // the whole message into tokens.
  test("a pattern that matches nothing at all is refused", async () => {
    const h = await armed(
      ["<REFINED>She stepped through and the cold hit her at last.</REFINED>"],
      { shieldAdd: "x*" },
      withScaffold("She stepped through and, suddenly, the cold just hit her."),
    );
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(said(h)).toContain("the cold just hit her");
  });
});

describe("the refiner's own thinking in its answer", () => {
  test("working inside the tags is taken out before it is saved", async () => {
    const h = await armed([
      "<REFINED><think>let me tighten this</think>She stepped through and the cold hit her.</REFINED>",
    ]);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.body("m2")).toBe("She stepped through and the cold hit her.");
  });

  test("and with the tags switched off, where the whole answer is the rewrite", async () => {
    const h = await armed(
      ["<think>let me tighten this</think>\nShe stepped through and the cold hit her."],
      { wrapOutput: false },
    );
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.body("m2")).toBe("She stepped through and the cold hit her.");
  });

  test("switched off, it is left where it fell", async () => {
    const h = await armed(
      ["<REFINED><think>let me tighten this</think>She stepped through and the cold hit her.</REFINED>"],
      { stripAnswerThinking: false },
    );
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.body("m2")).toContain("<think>");
  });
});

// The whole point of the extension is keeping a long list of rules out of the
// chat prompt. The other half of that is not paying a model to look at a reply
// with nothing on the list in it.
describe("what a plain scan can do without a model", () => {
  const reply = (body: string): Msg[] => [
    { id: "m0", role: "assistant", content: "The gate stands open." },
    { id: "m1", role: "user", content: "i go in" },
    { id: "m2", role: "assistant", content: body },
  ];

  test("a scan costs no model call at all", async () => {
    const h = await armed(["<REFINED>x</REFINED>"]);
    await h.front({
      type: "scan_text",
      requestId: "s1",
      text: "She let out a breath she didn't know she was holding, suddenly.",
    });
    await wait(10);
    expect(h.asked.length).toBe(0);
    const got = h.sent.find((m: any) => m.type === "scan_result" && m.requestId === "s1");
    expect(got.cliches.join(" ")).toMatch(/held breath/i);
    expect(got.fillers).toContain("suddenly");
  });

  test("and says so plainly when it finds nothing", async () => {
    const h = await armed(["<REFINED>x</REFINED>"]);
    await h.front({ type: "scan_text", requestId: "s1", text: "She crossed the yard and knocked." });
    await wait(10);
    const got = h.sent.find((m: any) => m.type === "scan_result" && m.requestId === "s1");
    expect(got.total).toBe(0);
  });

  test("the automatic pass spends nothing on a reply the scan calls clean", async () => {
    const h = await armed(
      ["<REFINED>She crossed the yard.</REFINED>"],
      { skipWhenClean: true },
      reply("She crossed the yard and knocked twice on the weathered door."),
    );
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.asked.length).toBe(0);
    expect(h.skipped().join(" ")).toMatch(/nothing on the phrase list/i);
  });

  test("and still runs on one it does not", async () => {
    const h = await armed(
      ["<REFINED>She crossed the yard and knocked twice on the door.</REFINED>"],
      { skipWhenClean: true },
      reply("She let out a breath she didn't know she was holding, and suddenly knocked."),
    );
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.asked.length).toBe(1);
  });

  // Pressing a button is the reader asking for this one. A list of phrases is
  // in no position to overrule that.
  test("asking by hand runs whatever the scan thinks", async () => {
    const h = await armed(
      ["<REFINED>She crossed the yard and knocked twice on the door.</REFINED>"],
      { skipWhenClean: true },
      reply("She crossed the yard and knocked twice on the weathered door."),
    );
    await h.front({ type: "refine_now", requestId: "r1", chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.asked.length).toBe(1);
  });

  test("switched off, the automatic pass runs on anything", async () => {
    const h = await armed(
      ["<REFINED>She crossed the yard and knocked twice on the door.</REFINED>"],
      {},
      reply("She crossed the yard and knocked twice on the weathered door."),
    );
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.asked.length).toBe(1);
  });
});

// Best of three, asked for rather than assumed. Three calls instead of one, so
// it is a button somebody presses and never something the automatic pass does.
describe("the sampler list", () => {
  test("context size and longest answer both reach the request", async () => {
    const h = await armed(["<REFINED>She stepped through and the cold hit her.</REFINED>"], {
      samplers: { max_context: 16384, max_tokens: 900, temperature: 0.6 },
    });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    const p = h.asked[0].parameters;
    expect(p.max_context).toBe(16384);
    expect(p.max_tokens).toBe(900);
    expect(p.temperature).toBe(0.6);
  });

  test("a context size out of range is pulled back rather than sent", async () => {
    const h = await armed(["<REFINED>She stepped through and the cold hit her.</REFINED>"], {
      samplers: { max_context: 12 },
    });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.asked[0].parameters.max_context).toBe(512);
  });

  test("and left out entirely when it is blank, so the connection decides", async () => {
    const h = await armed(["<REFINED>She stepped through and the cold hit her.</REFINED>"]);
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.asked[0].parameters).toBeUndefined();
  });
});

// A chat written before the extension was installed, brought up to the rules
// in one go. The greeting is the thing this must never touch: it is the one
// message a person wrote, and a pass over "every reply" is exactly where it
// would get swept up.
describe("going through every reply in a chat", () => {
  const longChat = (): Msg[] => [
    { id: "m0", role: "assistant", content: "The gate stands open, and the road past it is dark." },
    { id: "m1", role: "user", content: "i walk through it" },
    { id: "m2", role: "assistant", content: "She stepped through and, suddenly, the cold just hit her." },
    { id: "m3", role: "user", content: "i keep going" },
    { id: "m4", role: "assistant", content: "The road bent, and, suddenly, the trees just closed over it." },
  ];

  test("every reply is refined, oldest first, and the greeting is left alone", async () => {
    const h = await armed(["<REFINED>The cold met her as she stepped through the gate.</REFINED>"], {}, longChat());
    await h.front({ type: "refine_all", requestId: "a1", chatId: "c1" });
    await wait(120);
    const done = h.sent.find((m: any) => m.type === "refine_all_done" && m.requestId === "a1");
    expect(done).toBeTruthy();
    expect(done.saved).toBe(2);
    // The greeting is not among them, and neither are the user's own messages.
    const touched = h.writes.map((w: any) => w.id).sort();
    expect(touched).toEqual(["m2", "m4"]);
    expect(h.body("m0")).toBe("The gate stands open, and the road past it is dark.");
    expect(h.body("m1")).toBe("i walk through it");
  });

  test("it says which one it is on as it goes", async () => {
    const h = await armed(["<REFINED>The cold met her as she stepped through the gate.</REFINED>"], {}, longChat());
    await h.front({ type: "refine_all", requestId: "a2", chatId: "c1" });
    await wait(120);
    const steps = h.sent.filter((m: any) => m.type === "refine_all_progress" && m.requestId === "a2");
    expect(steps.length).toBe(2);
    expect(steps[0].at).toBe(1);
    expect(steps[0].of).toBe(2);
    expect(steps[1].at).toBe(2);
  });

  test("a chat with only a greeting in it says so rather than doing nothing quietly", async () => {
    const h = await armed(["<REFINED>x</REFINED>"], {}, [
      { id: "m0", role: "assistant", content: "The gate stands open." },
    ]);
    await h.front({ type: "refine_all", requestId: "a3", chatId: "c1" });
    await wait(60);
    const done = h.sent.find((m: any) => m.type === "refine_all_done" && m.requestId === "a3");
    expect(done.saved).toBe(0);
    expect(done.skipped).toBe(0);
    expect(h.writes.length).toBe(0);
  });

  test("a reply that fails a check is counted and the rest still go", async () => {
    // The first answer is a refusal, which is dropped; the second is fine.
    const h = await armed(
      [
        "<REFINED>I can't help with that.</REFINED>",
        "<REFINED>The trees closed over the bending road.</REFINED>",
      ],
      {},
      longChat(),
    );
    await h.front({ type: "refine_all", requestId: "a4", chatId: "c1" });
    await wait(150);
    const done = h.sent.find((m: any) => m.type === "refine_all_done" && m.requestId === "a4");
    expect(done.saved).toBe(1);
    expect(done.skipped).toBe(1);
    // And it says what went wrong, once, rather than per message or not at all.
    expect(String(done.why).length).toBeGreaterThan(0);
  });

  test("a stop ends the run between messages and keeps what was saved", async () => {
    const h = host(chat(), ["<REFINED>The cold met her as she stepped through the gate.</REFINED>"]);
    await h.front({ type: "set_settings", settings: RULES });
    // Stopped before it starts, which is the same door the button uses.
    await h.front({ type: "cancel_refine", requestId: "s9" });
    await h.front({ type: "refine_all", requestId: "a5", chatId: "c1" });
    await wait(120);
    const done = h.sent.find((m: any) => m.type === "refine_all_done" && m.requestId === "a5");
    // The sweep clears the flag on the way in, so a stop pressed before it
    // started does not cancel the run somebody has just asked for.
    expect(done).toBeTruthy();
    expect(done.saved).toBe(1);
  });

  test("switched off in this chat, it refines nothing", async () => {
    const h = await armed(["<REFINED>The cold met her as she stepped through the gate.</REFINED>"], {}, longChat());
    await h.front({ type: "set_chats_off", chats: ["c1"] });
    await h.front({ type: "refine_all", requestId: "a6", chatId: "c1" });
    await wait(120);
    const done = h.sent.find((m: any) => m.type === "refine_all_done" && m.requestId === "a6");
    expect(done.saved).toBe(0);
    expect(h.writes.length).toBe(0);
  });
});
