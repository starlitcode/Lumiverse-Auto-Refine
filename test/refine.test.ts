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

const RULES = {
  enabled: true,
  refineOn: true,
  rules: "Cut filler words.",
  structureRules: "",
  refineUserMessages: false,
  connectionId: "",
  thinkingMode: "off",
  timeoutSecs: 90,
  maxGrowthPct: 60,
  minShrinkPct: 40,
  keepOriginal: true,
  confirmBeforeSave: false,
};

// answers is what the stubbed model says, one per call, in order.
function host(messages: Msg[], answers: string[], opts: { fail?: string } = {}) {
  const handlers: Record<string, Array<(p: any) => any>> = {};
  let frontHandler: any = null;
  const sent: any[] = [];
  const writes: Array<{ id: string; content: string }> = [];
  const asked: any[] = [];
  const msgs = messages.map((m) => ({ ...m }));
  let turn = 0;

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
    },
    connections: {
      list: async () => [
        { id: "c-fast", name: "Cheap and quick", provider: "openai", model: "mini", is_default: false },
        { id: "c-main", name: "The good one", provider: "anthropic", model: "big", is_default: true },
      ],
    },
    chat: {
      getMessages: async () => msgs.map((m) => ({ ...m })),
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

  test("with no rules written, nothing is sent to a model at all", async () => {
    const h = await armed(["anything"], { rules: "", structureRules: "" });
    await h.ended({ chatId: "c1", messageId: "m2" });
    await wait(50);
    expect(h.asked.length).toBe(0);
    expect(h.skipped()[0]).toMatch(/no rules/i);
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
