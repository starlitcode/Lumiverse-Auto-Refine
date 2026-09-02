/*
 * Auto Refine frontend.
 *
 * The whole surface is one drawer tab. That is a deliberate choice rather than
 * a default: this is a thing you keep open and glance at while you write, not a
 * form you fill in and close. You want to see what the last refine did to your
 * prose, and put it back if you disagree, without stopping to open anything.
 *
 * A drawer tab has no moment where it closes, so there is no "nothing sticks
 * until Save" to build on. Everything here saves as you change it, which is
 * safe because nothing on this panel is destructive on its own: a rule is text
 * until a reply arrives, and the two switches that make something happen are
 * switches, which is exactly the control somebody expects to act at once.
 *
 * None of the refining happens on this side. This collects what the reader
 * wants, hands it to the backend, and shows what came back.
 */

interface Ctx {
  events: { on: (name: string, fn: (p: any) => void) => () => void };
  ui: any;
  sendToBackend?: (msg: any) => void;
  onBackendMessage?: (fn: (msg: any) => void) => () => void;
}

const VERSION = "1.0.0";
const STORE_KEY = "lv-auto-refine:settings:v1";
const CHATS_OFF_KEY = "lv-auto-refine:chats-off:v1";

// Every setting, with the value a fresh install starts on.
const CONFIG = {
  enabled: true,
  // The automatic pass is off until asked for. This rewrites saved messages
  // with a model, which is not something to start doing to somebody's chat
  // because they installed an extension.
  refineOn: false,
  rules: "",
  structureRules: "",
  refineUserMessages: false,
  connectionId: "",
  thinkingMode: "off",
  timeoutSecs: 90,
  maxGrowthPct: 60,
  minShrinkPct: 40,
  keepOriginal: true,
  confirmBeforeSave: false,
  toast: true,
  // How many messages of the run-up go in the prompt. A rewrite that cannot see
  // what just happened flattens a scene into general prose, which is the
  // failure people blame on the model.
  contextMessages: 4,
  // The prompt layout. Empty means the default order below, so a fresh install
  // does not carry a copy of it around and a later change to the default
  // reaches anybody who never edited theirs.
  blocks: [] as Block[],
  // Sampler values for the refine call. Empty means the connection's preset
  // decides, which is the right default: somebody who tuned a preset should not
  // have it quietly overridden by an extension.
  samplers: {} as Record<string, any>,
};

type Block = { id: string; on: boolean; role: string; text?: string; name?: string };

// The blocks the extension knows how to fill in, and what each one is for. The
// reader reorders them, switches them off, and changes the role each is sent
// as; these two are locked on because everything the pass does downstream
// assumes the model was given the instruction and the message.
const BLOCK_KINDS: Record<string, { label: string; hint: string; locked?: boolean }> = {
  guard: {
    label: "What the job is",
    hint: "Rewrite this message, keep what happens, answer with the message and nothing else. Locked on: every check on the answer assumes the model was told this.",
    locked: true,
  },
  character: {
    label: "Who the character is",
    hint: "Name, description, personality and scenario from the card. Needs the characters permission; without it this block is simply left out.",
  },
  context: {
    label: "What has been happening",
    hint: "The messages leading up to this one, so a rewrite keeps the thread of the scene instead of polishing a paragraph in isolation.",
  },
  rules: { label: "Your rules", hint: "The What to change box, above." },
  structure: { label: "Your structure rules", hint: "The Structure and formatting box, above." },
  whose: {
    label: "Whose message it is",
    hint: "One line saying whether the character wrote it or you did, so your own messages are not rewritten in the narrator's voice.",
  },
  thinking: {
    label: "Where the thinking goes",
    hint: "Only sent when you have let it think first. Tells it to keep its working out of the answer.",
  },
  message: {
    label: "The message to rewrite",
    hint: "The text itself. Locked on, and usually last: what comes after it reads as an instruction about it.",
    locked: true,
  },
};

const DEFAULT_BLOCKS: Block[] = [
  { id: "guard", on: true, role: "system" },
  { id: "character", on: true, role: "system" },
  { id: "context", on: true, role: "system" },
  { id: "rules", on: true, role: "system" },
  { id: "structure", on: true, role: "system" },
  { id: "whose", on: true, role: "system" },
  { id: "thinking", on: true, role: "system" },
  { id: "message", on: true, role: "user" },
];

const ROLE_OPTIONS = [
  { value: "system", label: "System" },
  { value: "user", label: "User" },
  { value: "assistant", label: "Assistant" },
];

// The sampler values that reach the request. Anything not on this list is not
// passed on, on either side of the bridge. Blank means the connection decides,
// which is why none of these carry a default.
const SAMPLER_FIELDS: Array<{ id: string; label: string; min: number; max: number; step: string; hint: string }> = [
  {
    id: "temperature",
    label: "Temperature",
    min: 0,
    max: 2,
    step: "0.05",
    hint: "How loose the wording is. A rewrite usually wants this lower than the one you roleplay with.",
  },
  { id: "top_p", label: "Top P", min: 0, max: 1, step: "0.01", hint: "" },
  { id: "top_k", label: "Top K", min: 0, max: 500, step: "1", hint: "" },
  { id: "min_p", label: "Min P", min: 0, max: 1, step: "0.01", hint: "" },
  {
    id: "max_tokens",
    label: "Longest answer (tokens)",
    min: 1,
    max: 200000,
    step: "1",
    hint: "A ceiling low enough to cut the rewrite off mid-sentence gets it dropped for being too short, so leave room.",
  },
  { id: "frequency_penalty", label: "Frequency penalty", min: -2, max: 2, step: "0.05", hint: "" },
  { id: "presence_penalty", label: "Presence penalty", min: -2, max: 2, step: "0.05", hint: "" },
  { id: "repetition_penalty", label: "Repetition penalty", min: 0, max: 2, step: "0.05", hint: "" },
];

// The settings that live behind the "How the pass runs" fold. Everything else
// is on the face of the tab, because it is what somebody changes while they
// work. These are set once and left.
type Field = {
  key: string;
  label: string;
  type: "bool" | "num" | "pick";
  hint: string;
  min?: number;
  max?: number;
  options?: Array<{ value: string; label: string }>;
};

const COST_FIELDS: Field[] = [
  {
    key: "connectionId",
    label: "Refine using",
    type: "pick",
    options: [{ value: "", label: "The model I am chatting with" }],
    hint: "A rewrite does not need the model you roleplay with. Pointing this at a cheaper or faster connection is the biggest saving there is here.",
  },
  {
    key: "thinkingMode",
    label: "Let it think first",
    type: "pick",
    options: [
      { value: "off", label: "No, keep it quick" },
      { value: "inherit", label: "Yes, whatever the connection does" },
    ],
    hint: "Off by default. Rewriting a paragraph is not a reasoning problem, and extended thinking on every reply is the cost nobody notices until the bill arrives.",
  },
  {
    key: "timeoutSecs",
    label: "Give up waiting after (seconds)",
    type: "num",
    min: 5,
    max: 600,
    hint: "A refine that has not come back by then is cancelled and the reply is left alone.",
  },
];

const LIMIT_FIELDS: Field[] = [
  {
    key: "maxGrowthPct",
    label: "Longest a rewrite may get (%)",
    type: "num",
    min: 0,
    max: 500,
    hint: "A rewrite this much longer has written new scene rather than polished what was there. 0 allows any length.",
  },
  {
    key: "minShrinkPct",
    label: "Shortest a rewrite may get (%)",
    type: "num",
    min: 0,
    max: 99,
    hint: "A rewrite this much shorter has lost writing rather than tightened it. 0 allows any length.",
  },
  {
    key: "keepOriginal",
    label: "Keep what a refine replaced",
    type: "bool",
    hint: "On by default, and what makes Put it back possible. Held while the page is open and written nowhere.",
  },
  {
    key: "confirmBeforeSave",
    label: "Ask before saving a refine",
    type: "bool",
    hint: "Off by default. On, every refine shows you both versions and waits for a yes.",
  },
  {
    key: "refineUserMessages",
    label: "Let the button refine your own messages",
    type: "bool",
    hint: "Off by default. The automatic pass never touches what you wrote whatever this says: only the button does.",
  },
  {
    key: "toast",
    label: "Show a pop-up on each refine",
    type: "bool",
    hint: "On by default. Turn it off if you would rather it worked quietly and you watched this tab instead.",
  },
];

// ---- colour, and staying readable on a theme nobody here has seen ----
// Everything is styled from the host's --lumiverse-* variables so it arrives in
// the reader's theme. That is most of the job and not all of it: a theme can
// set a near-white accent, or a panel colour close to its own text, and a rule
// that looked right on the stock dark theme comes out as a blank rectangle.
//
// So nothing here guesses at another variable to fix a colour. It reads what
// the browser actually painted and steps in only when two colours are genuinely
// too close. A theme that already reads well keeps its own colours exactly.
//
// The four below are pure, so a theme with a light accent can be checked
// without a browser.
interface Rgb { r: number; g: number; b: number; a: number }

// getComputedStyle hands colours back as rgb() or rgba() and nothing else, so
// those forms are the whole of what needs parsing. Anything else is unknown,
// and unknown means leave it alone.
function parseColor(input: any): Rgb | null {
  const s = String(input == null ? "" : input).trim();
  const m = s.match(/^rgba?\(([^)]+)\)$/i);
  if (!m) return null;
  const parts = m[1].replace(/\//g, " ").replace(/,/g, " ").split(/\s+/).filter(Boolean);
  if (parts.length < 3) return null;
  const num = (t: string, max: number) => {
    const v = t.indexOf("%") >= 0 ? (parseFloat(t) / 100) * max : parseFloat(t);
    return Number.isFinite(v) ? v : NaN;
  };
  const r = num(parts[0], 255), g = num(parts[1], 255), b = num(parts[2], 255);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null;
  let a = 1;
  if (parts.length > 3) {
    const v = num(parts[3], 1);
    a = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
  }
  return { r: r, g: g, b: b, a: a };
}

// One colour laid over another, which is what a translucent panel over a
// translucent drawer over the page actually is.
function blendColor(top: Rgb, under: Rgb): Rgb {
  const a = top.a + under.a * (1 - top.a);
  if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (t: number, u: number) => (t * top.a + u * under.a * (1 - top.a)) / a;
  return { r: mix(top.r, under.r), g: mix(top.g, under.g), b: mix(top.b, under.b), a: a };
}

function relLuminance(c: Rgb): number {
  const f = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const x = relLuminance(a), y = relLuminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// Below this, text is repainted near-white or near-black, whichever reads
// better on what is behind it.
const TEXT_FLOOR = 3.2;
// A filled button whose fill is this close to the surface behind it reads as
// plain text however legible its label is, so it is given an edge instead. Low
// enough that a merely quiet accent is left alone.
const FILL_FLOOR = 1.45;
const WHITE: Rgb = { r: 255, g: 255, b: 255, a: 1 };
const BLACK: Rgb = { r: 0, g: 0, b: 0, a: 1 };
const PAGE_FALLBACK: Rgb = { r: 24, g: 20, b: 34, a: 1 };

function betterInk(back: Rgb): { color: string; ratio: number } {
  const onWhite = contrastRatio(WHITE, back);
  const onBlack = contrastRatio(BLACK, back);
  return onWhite >= onBlack
    ? { color: "rgba(255,255,255,0.94)", ratio: onWhite }
    : { color: "rgba(0,0,0,0.9)", ratio: onBlack };
}

// What an element is really sitting on. A panel is usually a solid colour with
// the theme's translucent tint laid over it as a gradient, and backgroundColor
// reports only the colour underneath. So the first stop of a gradient is read
// too: these tints are one colour repeated, so the first stop is the whole
// story.
function surfaceOf(el: any): Rgb | null {
  try {
    const cs = getComputedStyle(el);
    const base = parseColor(cs.backgroundColor);
    const img = String(cs.backgroundImage || "");
    if (img && img !== "none") {
      const stop = img.match(/rgba?\([^)]+\)/i);
      const tint = stop ? parseColor(stop[0]) : null;
      if (tint) return base ? blendColor(tint, base) : tint;
    }
    return base;
  } catch (_) {
    return null;
  }
}

// Walk up collecting surfaces until one is opaque, then blend them back down.
function backdropOf(el: any): Rgb {
  const stack: Rgb[] = [];
  let node: any = el;
  let hops = 0;
  while (node && hops < 24) {
    const c = surfaceOf(node);
    if (c && c.a > 0) {
      stack.push(c);
      if (c.a >= 0.999) break;
    }
    node = node.parentElement;
    hops++;
  }
  let out: Rgb = stack.length && stack[stack.length - 1].a >= 0.999
    ? stack.pop() as Rgb
    : PAGE_FALLBACK;
  for (let i = stack.length - 1; i >= 0; i--) out = blendColor(stack[i], out);
  return out;
}

// A page of writing with a spark over it. Drawn rather than borrowed so it sits
// at the same weight as the host's own icons, and readable at the size a tab
// gives it: three lines of text, the last one short so it reads as a paragraph
// rather than a list, and a spark for the pass that goes over it.
function refineIcon(): string {
  return (
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" ' +
    'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M4 6.5h11" /><path d="M4 12h9" /><path d="M4 17.5h6.5" />' +
    '<path d="M18.5 3.2l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z" ' +
    'fill="currentColor" stroke="none" />' +
    '<path d="M17.8 14.6l.55 1.5 1.5.55-1.5.55-.55 1.5-.55-1.5-1.5-.55 1.5-.55z" ' +
    'fill="currentColor" stroke="none" opacity="0.7" />' +
    "</svg>"
  );
}

export function setup(ctx: Ctx, overrides?: any) {
  const disposers: Array<() => void> = [];
  const cfg: any = Object.assign({}, CONFIG);

  function loadSaved(): any {
    try {
      if (typeof localStorage === "undefined") return {};
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }
  Object.assign(cfg, loadSaved(), overrides || {});

  // Saved as it is changed, and pushed to the backend in the same breath. There
  // is no Save button here: a drawer tab has no moment where it closes, so a
  // "nothing sticks until you press Save" contract would have nothing to hang
  // on and would only ever surprise somebody who walked away mid-edit.
  let saveTimer: any = null;
  function persist(now?: boolean) {
    const write = () => {
      saveTimer = null;
      try {
        if (typeof localStorage !== "undefined")
          localStorage.setItem(STORE_KEY, JSON.stringify(cfg));
      } catch (_) {}
      send({ type: "set_settings", settings: cfg });
    };
    if (now) {
      if (saveTimer) clearTimeout(saveTimer);
      write();
      return;
    }
    // Typing in a rule box should not write on every keystroke. A short settle
    // is enough, and the box also writes on blur, so nothing is lost by
    // wandering off mid-sentence.
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(write, 400);
  }

  let chatsOff: string[] = [];
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(CHATS_OFF_KEY);
      const list = raw ? JSON.parse(raw) : [];
      if (Array.isArray(list)) chatsOff = list.map((x) => String(x)).slice(0, 500);
    }
  } catch (_) {}

  const send = (msg: any) => {
    try {
      if (ctx && typeof ctx.sendToBackend === "function") ctx.sendToBackend(msg);
    } catch (_) {}
  };
  const newId = () =>
    "arf-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);

  // Everything the backend knows arrived over the bridge, and a backend that
  // restarts comes back knowing none of it. It cannot look the settings up
  // either: that read runs before any user is known. So this says it all again
  // whenever the backend announces itself.
  function armBackend() {
    send({ type: "set_settings", settings: cfg });
    send({ type: "set_chats_off", chats: chatsOff.slice() });
  }

  // ---- state the tab shows ----
  const LOG_MAX = 20;
  const activity: Array<{ at: number; text: string; good: boolean }> = [];
  function log(text: string, good?: boolean) {
    activity.unshift({ at: Date.now(), text: String(text), good: !!good });
    while (activity.length > LOG_MAX) activity.pop();
    paint();
  }

  let lastChatId: any = null;
  let lastMessageId: any = null;
  let busy = false;
  // The refine that can still be undone, per chat. What the tab is really for:
  // seeing what happened to your prose and disagreeing with it.
  const undoable = new Map<string, { messageId: any; before: string; after: string }>();
  let connections: Array<{ id: string; name: string; provider: string; model: string; isDefault: boolean }> = [];
  let tryResult: { ok: boolean; text: string } | null = null;
  let tryBusy = false;

  const chatIsOff = (id: any) => id != null && chatsOff.indexOf(String(id)) >= 0;
  function setChatOff(id: any, off: boolean) {
    if (id == null) return;
    const s = String(id);
    const at = chatsOff.indexOf(s);
    if (off && at < 0) chatsOff.push(s);
    else if (!off && at >= 0) chatsOff.splice(at, 1);
    while (chatsOff.length > 500) chatsOff.shift();
    try {
      if (typeof localStorage !== "undefined")
        localStorage.setItem(CHATS_OFF_KEY, JSON.stringify(chatsOff));
    } catch (_) {}
    send({ type: "set_chats_off", chats: chatsOff.slice() });
    paint();
  }

  function toast(text: string, force?: boolean) {
    if (!cfg.toast && !force) return;
    try {
      if (ctx.ui && typeof ctx.ui.toast === "function") {
        ctx.ui.toast(text);
      }
    } catch (_) {}
  }

  // ---- one stylesheet, not a style attribute per element ----
  // Kept in one place so the coarse-pointer rule is a second rule rather than a
  // branch at every call site, and so a tap target grows for a finger without
  // anything asking how wide the screen is. Sizes are pinned in px: the host's
  // font scale is the reader's story text, and chrome that inherits it grows
  // until a section stops fitting on a phone.
  const CSS =
    ".arf{display:flex;flex-direction:column;gap:14px;padding:14px;box-sizing:border-box;" +
    "font:13px/1.5 var(--lumiverse-font-family,system-ui);color:var(--lumiverse-text,rgba(255,255,255,.9))}" +
    ".arf *{box-sizing:border-box}" +
    ".arf-h{font-size:11px;letter-spacing:.05em;text-transform:uppercase;" +
    "color:var(--lumiverse-text-muted,rgba(255,255,255,.65))}" +
    ".arf-note{font-size:12px;line-height:1.45;color:var(--lumiverse-text-muted,rgba(255,255,255,.65))}" +
    ".arf-lab{font-size:12.5px;color:var(--lumiverse-text,rgba(255,255,255,.9))}" +
    ".arf-rule{height:1px;background:var(--lumiverse-border,rgba(147,112,219,.12));margin:2px 0}" +
    ".arf-col{display:flex;flex-direction:column;gap:5px}" +
    ".arf-sec{display:flex;flex-direction:column;gap:9px}" +
    ".arf-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}" +
    ".arf-between{display:flex;align-items:center;gap:9px;justify-content:space-between}" +
    // Inputs sit on a fill rather than an invented black, and take a neutral
    // border so a theme with a strong accent does not tint every box.
    ".arf-field{width:100%;padding:8px 10px;border-radius:var(--lumiverse-radius,8px);" +
    "border:1px solid var(--lumiverse-border-neutral,rgba(128,128,128,.15));" +
    "background:var(--lumiverse-fill,rgba(0,0,0,.15));" +
    "color:var(--lumiverse-text,rgba(255,255,255,.9));" +
    "font:13px/1.5 var(--lumiverse-font-family,system-ui)}" +
    ".arf-field:focus-visible{outline:2px solid var(--lumiverse-primary,rgba(147,112,219,.9));outline-offset:1px}" +
    "textarea.arf-field{resize:vertical;min-height:64px}" +
    // One transparent pixel of border always present, so giving a button an
    // edge when its fill is too quiet costs no layout.
    ".arf-btn{min-height:32px;padding:7px 12px;border-radius:var(--lumiverse-radius,8px);cursor:pointer;" +
    "font:12.5px var(--lumiverse-font-family,system-ui);border:1px solid transparent;" +
    "background:var(--lumiverse-secondary,rgba(128,128,128,.15));" +
    "color:var(--lumiverse-text,rgba(255,255,255,.9));" +
    "transition:background-color var(--lumiverse-transition-fast,150ms ease)}" +
    ".arf-btn:hover:not(:disabled){background:var(--lumiverse-secondary-hover,rgba(128,128,128,.25))}" +
    ".arf-btn.arf-primary{background:var(--lumiverse-primary,rgba(147,112,219,.9));color:#fff}" +
    ".arf-btn.arf-primary:hover:not(:disabled){background:var(--lumiverse-primary-hover,rgba(167,132,239,.95))}" +
    ".arf-btn:disabled{opacity:.5;cursor:not-allowed}" +
    ".arf-btn:focus-visible{outline:2px solid var(--lumiverse-primary,rgba(147,112,219,.9));outline-offset:1px}" +
    ".arf-box{width:17px;height:17px;flex:none;cursor:pointer;accent-color:var(--lumiverse-primary,rgba(147,112,219,.9))}" +
    ".arf-well{white-space:pre-wrap;line-height:1.5;font-size:12.5px;padding:8px 10px;" +
    "border-radius:var(--lumiverse-radius,8px);" +
    "border:1px solid var(--lumiverse-border-neutral,rgba(128,128,128,.15));" +
    "background:var(--lumiverse-fill,rgba(0,0,0,.15))}" +
    ".arf-well.arf-dim{color:var(--lumiverse-text-muted,rgba(255,255,255,.65))}" +
    ".arf-scroll{max-height:130px;overflow-y:auto}" +
    ".arf-dot{flex:none;width:7px;height:7px;border-radius:50%;" +
    "background:var(--lumiverse-text-dim,rgba(255,255,255,.4))}" +
    ".arf-dot.arf-live{background:var(--lumiverse-primary,rgba(147,112,219,.9))}" +
    ".arf-dot.arf-busy{background:var(--lumiverse-primary,rgba(147,112,219,.9));" +
    "box-shadow:0 0 6px 1px var(--lumiverse-primary-020,rgba(147,112,219,.2))}" +
    ".arf-when{flex:none;font-variant-numeric:tabular-nums;" +
    "color:var(--lumiverse-text-dim,rgba(255,255,255,.4))}" +
    ".arf-fold{display:flex;align-items:center;gap:7px;cursor:pointer;user-select:none;" +
    "background:none;border:0;padding:0;text-align:left;width:100%}" +
    ".arf-fold:focus-visible{outline:2px solid var(--lumiverse-primary,rgba(147,112,219,.9));outline-offset:2px}" +
    // A checkbox comfortable under a mouse is too small for a finger, and the
    // width of the screen does not say which is in use. This asks directly.
    "@media (pointer: coarse){" +
    ".arf-btn{min-height:40px;padding:10px 14px}" +
    ".arf-fold{min-height:40px}" +
    ".arf-box{width:22px;height:22px}" +
    ".arf-field{padding:10px 12px}}";

  let styleEl: any = null;
  function injectStyle() {
    try {
      if (styleEl || typeof document === "undefined") return;
      styleEl = document.createElement("style");
      styleEl.setAttribute("data-arf-style", "1");
      styleEl.textContent = CSS;
      document.head.appendChild(styleEl);
      disposers.push(() => {
        try {
          styleEl && styleEl.remove();
        } catch (_) {}
        styleEl = null;
      });
    } catch (_) {}
  }

  // ---- small builders ----
  const el = (tag: string, cls?: string, text?: string) => {
    const d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text != null) d.textContent = text;
    return d;
  };
  const heading = (text: string) => el("div", "arf-h", text);
  const note = (text: string) => el("div", "arf-note", text);
  function button(label: string, primary: boolean): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "arf-btn" + (primary ? " arf-primary" : "");
    b.textContent = label;
    return b;
  }
  const rule = () => el("div", "arf-rule");

  // ---- the tab ----
  let tab: any = null;
  let badge: string | null = null;
  // The sections that stay folded, remembered while the page is open so they do
  // not close themselves every time the tab repaints.
  let costOpen = false;
  let shapeOpen = false;
  let transferSaid: string | null = null;

  function setBadge(v: string | null) {
    // Written only when it changes. This goes to the host on every call, and a
    // panel that repaints on a timer would otherwise say the same thing several
    // times a second.
    if (v === badge) return;
    badge = v;
    try {
      tab && tab.setBadge && tab.setBadge(v);
    } catch (_) {}
  }

  function statusLine(): { text: string; tone: "off" | "idle" | "busy" } {
    if (!cfg.enabled) return { text: "Off", tone: "off" };
    if (chatIsOff(lastChatId)) return { text: "Off in this chat", tone: "off" };
    if (busy) return { text: "Refining a reply", tone: "busy" };
    if (!String(cfg.rules || "").trim() && !String(cfg.structureRules || "").trim())
      return { text: "Waiting for some rules to follow", tone: "off" };
    if (cfg.refineOn) return { text: "Refining every reply as it arrives", tone: "idle" };
    return { text: "Waiting for you to press Refine", tone: "idle" };
  }

  // Browser-drawn controls are painted from the page's colour scheme, and with
  // none set the browser assumes light, which is why a checkbox comes out as a
  // white block on a dark panel. Measured rather than assumed, so a light theme
  // still gets light controls.
  function setScheme(root: any) {
    try {
      const back = backdropOf(root);
      root.style.colorScheme = relLuminance(back) > 0.5 ? "light" : "dark";
    } catch (_) {}
  }

  // Walk the panel and repair only what genuinely fails. Elements with no text
  // yet are included: a status line waiting for something to say has already
  // been given its colour, and it will not change when the text arrives.
  function sweepReadable(root: any) {
    try {
      const nodes: any[] = [root].concat(Array.prototype.slice.call(root.querySelectorAll("*")));
      for (const n of nodes) {
        const tag = String(n.tagName || "").toLowerCase();
        const isControl = tag === "button" || tag === "input" || tag === "select" || tag === "textarea";
        const hasText = !isControl && n.firstChild && n.firstChild.nodeType === 3;
        const painted = n.getAttribute && n.getAttribute("data-arf-painted") != null;
        if (!isControl && !hasText && !painted) continue;
        const cs = getComputedStyle(n);
        const fg = parseColor(cs.color);
        if (!fg) continue;
        const back = backdropOf(n.parentElement || root);
        const shown = blendColor(fg, back);
        if (contrastRatio(shown, back) < TEXT_FLOOR) {
          const ink = betterInk(back);
          n.style.color = ink.color;
          // Marked so the next repaint re-measures it. Without the mark an
          // element the sweep already fixed reads as healthy the second time
          // round, since what it is measuring is the repair. The two kinds of
          // repair are marked apart because they mean different things: ink
          // means a theme made its own text unreadable, edge means a fill sits
          // close to the surface behind it, which the stock theme does on
          // purpose.
          try {
            n.setAttribute("data-arf-painted", "ink");
          } catch (_) {}
        }
        // A filled button whose fill is close to the surface behind it reads as
        // plain text, however legible the label is. It gets an edge instead of
        // having its label repainted, which would fix the wrong half.
        if (tag === "button") {
          const fill = surfaceOf(n);
          const behind = backdropOf((n.parentElement || root).parentElement || root);
          if (fill && fill.a > 0.05) {
            const solid = blendColor(fill, behind);
            if (contrastRatio(solid, behind) < FILL_FLOOR) {
              n.style.borderColor = "var(--lumiverse-border-hover,rgba(147,112,219,.25))";
              try {
                if (n.getAttribute("data-arf-painted") == null)
                  n.setAttribute("data-arf-painted", "edge");
              } catch (_) {}
            }
          }
        }
      }
    } catch (_) {}
  }

  function paint() {
    if (!tab || !tab.root) return;
    const root = tab.root as HTMLElement;
    // The rule boxes are rebuilt with everything else, so a repaint while
    // somebody is typing would take the cursor with it. Held and put back.
    const focusKey = (document.activeElement as any)?.getAttribute?.("data-arf-field");
    const caret = (document.activeElement as any)?.selectionStart;

    root.innerHTML = "";
    root.className = "arf";

    root.appendChild(buildHeader());
    const last = lastChatId != null ? undoable.get(String(lastChatId)) : null;
    if (last) root.appendChild(buildLastRefine(last));
    root.appendChild(buildRules());
    root.appendChild(buildPromptShape());
    root.appendChild(buildTryIt());
    root.appendChild(buildFold());
    root.appendChild(buildChatSwitch());
    root.appendChild(buildTransfer());
    root.appendChild(buildActivity());

    setScheme(root);
    // Colours only resolve once the tree is in the page and laid out, so the
    // repair runs a frame later rather than against a half-built panel.
    try {
      requestAnimationFrame(() => sweepReadable(root));
    } catch (_) {
      sweepReadable(root);
    }

    if (focusKey) {
      const back = root.querySelector('[data-arf-field="' + focusKey + '"]') as any;
      if (back && typeof back.focus === "function") {
        back.focus();
        try {
          if (caret != null && back.setSelectionRange) back.setSelectionRange(caret, caret);
        } catch (_) {}
      }
    }
  }

  function buildHeader(): HTMLElement {
    const wrap = el("div", "arf-col");
    const top = el("div", "arf-row");
    const mark = el("span", "arf-mark");
    mark.innerHTML = refineIcon();
    const name = el("div", "arf-title", "Auto Refine");
    const sw = document.createElement("input");
    sw.type = "checkbox";
    sw.checked = !!cfg.enabled;
    sw.setAttribute("aria-label", "Turn Auto Refine on");
    sw.className = "arf-box";
    sw.addEventListener("change", () => {
      cfg.enabled = !!sw.checked;
      persist(true);
      paint();
    });
    top.appendChild(mark);
    top.appendChild(name);
    top.appendChild(sw);
    wrap.appendChild(top);

    const st = statusLine();
    const line = el("div", "arf-row arf-note");
    const dot = el(
      "span",
      "arf-dot" + (st.tone === "off" ? "" : st.tone === "busy" ? " arf-busy" : " arf-live"),
    );
    line.appendChild(dot);
    line.appendChild(el("span", "", st.text));
    wrap.appendChild(line);

    const row = el("div", "arf-row");
    const now = button("Refine the latest reply", true);
    now.disabled = busy || !cfg.enabled;
    now.style.opacity = now.disabled ? "0.5" : "1";
    now.addEventListener("click", () => refineNow());
    row.appendChild(now);

    const auto = document.createElement("label");
    auto.className = "arf-row arf-note";
    auto.style.cursor = "pointer";
    const autoBox = document.createElement("input");
    autoBox.type = "checkbox";
    autoBox.checked = !!cfg.refineOn;
    autoBox.className = "arf-box";
    autoBox.addEventListener("change", () => {
      cfg.refineOn = !!autoBox.checked;
      persist(true);
      paint();
    });
    auto.appendChild(autoBox);
    auto.appendChild(el("span", "", "every reply, automatically"));
    row.appendChild(auto);
    wrap.appendChild(row);
    return wrap;
  }

  // The heart of the tab. After a refine you want to see what it did to your
  // writing and be able to disagree, and this is that, sitting where you are
  // already looking rather than behind a menu.
  function buildLastRefine(last: { messageId: any; before: string; after: string }): HTMLElement {
    const wrap = el("div", "arf-col");
    wrap.setAttribute("data-arf-last", "1");
    wrap.appendChild(rule());
    wrap.appendChild(heading("The last refine"));
    const pane = (title: string, text: string, dim: boolean) => {
      wrap.appendChild(el("div", "arf-note", title));
      wrap.appendChild(el("div", "arf-well arf-scroll" + (dim ? " arf-dim" : ""), text));
    };
    pane("Before", last.before, true);
    pane("After", last.after, false);
    const row = el("div", "arf-row");
    const back = button("Put it back", false);
    back.addEventListener("click", () => {
      send({
        type: "undo_refine",
        requestId: newId(),
        chatId: lastChatId,
        messageId: last.messageId,
      });
    });
    const seen = button("Dismiss", false);
    seen.addEventListener("click", () => {
      if (lastChatId != null) undoable.delete(String(lastChatId));
      setBadge(null);
      paint();
    });
    row.appendChild(back);
    row.appendChild(seen);
    wrap.appendChild(row);
    return wrap;
  }

  function textBox(key: string, label: string, hint: string, rows: number): HTMLElement {
    const wrap = el("div", "display:flex;flex-direction:column;gap:5px");
    wrap.appendChild(el("div", "arf-lab", label));
    const ta = document.createElement("textarea");
    ta.rows = rows;
    ta.value = String(cfg[key] == null ? "" : cfg[key]);
    ta.setAttribute("data-arf-field", key);
    ta.setAttribute("aria-label", label);
    ta.className = "arf-field";
    ta.addEventListener("input", () => {
      cfg[key] = ta.value;
      persist();
    });
    // Written at once on the way out, so wandering off mid-sentence keeps it.
    ta.addEventListener("blur", () => {
      cfg[key] = ta.value;
      persist(true);
      paint();
    });
    wrap.appendChild(ta);
    wrap.appendChild(note(hint));
    return wrap;
  }

  // ---- the prompt layout ----
  // The stored list when there is one, the default otherwise, with the two
  // locked blocks put back if a hand-edited or imported file has lost them.
  // Everything that draws or edits the layout goes through here, so a bad
  // stored value cannot take the section down with it.
  function blockList(): Block[] {
    const raw = Array.isArray(cfg.blocks) ? cfg.blocks : [];
    const list: Block[] = raw
      .filter((b: any) => b && typeof b === "object" && b.id)
      .map((b: any) => ({
        id: String(b.id),
        on: b.on !== false,
        role: ROLE_OPTIONS.some((r) => r.value === String(b.role)) ? String(b.role) : "system",
        text: b.text == null ? undefined : String(b.text),
        name: b.name == null ? undefined : String(b.name),
      }));
    if (!list.length) return DEFAULT_BLOCKS.map((b) => ({ ...b }));
    for (const id of ["guard", "message"]) {
      const at = list.findIndex((b) => b.id === id);
      if (at < 0) list.push({ id: id, on: true, role: id === "message" ? "user" : "system" });
      else list[at].on = true;
    }
    return list;
  }

  function setBlocks(list: Block[], repaint?: boolean) {
    cfg.blocks = list;
    persist(true);
    if (repaint !== false) paint();
  }

  const blockLabel = (b: Block) =>
    BLOCK_KINDS[b.id] ? BLOCK_KINDS[b.id].label : b.name || "A block of your own";

  function buildPromptShape(): HTMLElement {
    const wrap = el("div", "arf-sec");
    wrap.appendChild(rule());
    const head = document.createElement("button");
    head.type = "button";
    head.className = "arf-fold";
    head.setAttribute("aria-expanded", shapeOpen ? "true" : "false");
    head.appendChild(el("span", "arf-note", shapeOpen ? "▾" : "▸"));
    head.appendChild(heading("How the prompt is built"));
    head.addEventListener("click", () => {
      shapeOpen = !shapeOpen;
      paint();
    });
    wrap.appendChild(head);
    if (!shapeOpen) return wrap;

    wrap.appendChild(
      note(
        "The refine is one request, and this is what goes in it and in what order. Blocks next to each other with the same role are sent as one message. A block with nothing to say is left out.",
      ),
    );

    const list = blockList();
    for (let i = 0; i < list.length; i++) {
      wrap.appendChild(buildBlockRow(list, i));
    }

    const acts = el("div", "arf-row");
    const add = button("Add a block of your own", false);
    add.addEventListener("click", () => {
      const next = blockList();
      const msgAt = next.findIndex((b) => b.id === "message");
      const made: Block = {
        id: "own-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6),
        on: true,
        role: "system",
        name: "My block",
        text: "",
      };
      // Dropped in before the message rather than at the end, since a block
      // after the message reads as an instruction about it and that is rarely
      // what somebody adding one meant.
      next.splice(msgAt < 0 ? next.length : msgAt, 0, made);
      setBlocks(next);
    });
    const reset = button("Put the order back", false);
    reset.addEventListener("click", () => {
      setBlocks(DEFAULT_BLOCKS.map((b) => ({ ...b })));
    });
    acts.appendChild(add);
    acts.appendChild(reset);
    wrap.appendChild(acts);

    wrap.appendChild(rule());
    wrap.appendChild(
      fieldRow({
        key: "contextMessages",
        label: "Messages of run-up to send",
        type: "num",
        min: 0,
        max: 40,
        hint: "How much of the chat the What has been happening block carries. 0 sends none. More context costs more on every refine, and long messages are trimmed so a single wall of text cannot fill the request.",
      }),
    );
    return wrap;
  }

  function buildBlockRow(list: Block[], i: number): HTMLElement {
    const b = list[i];
    const kind = BLOCK_KINDS[b.id];
    const locked = !!(kind && kind.locked);
    const own = !kind;

    const wrap = el("div", "arf-col");
    wrap.setAttribute("data-arf-block", b.id);
    const top = el("div", "arf-between");

    const left = el("div", "arf-row");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "arf-box";
    box.checked = b.on;
    box.disabled = locked;
    box.setAttribute("aria-label", "Send " + blockLabel(b));
    box.addEventListener("change", () => {
      const next = blockList();
      next[i].on = !!box.checked;
      setBlocks(next, false);
    });
    left.appendChild(box);
    left.appendChild(el("span", "arf-lab", blockLabel(b)));
    top.appendChild(left);

    const moves = el("div", "arf-row");
    const move = (to: number, label: string, sign: string) => {
      const btn = button(sign, false);
      btn.setAttribute("aria-label", label + " " + blockLabel(b));
      btn.disabled = to < 0 || to >= list.length;
      btn.style.opacity = btn.disabled ? "0.45" : "1";
      btn.addEventListener("click", () => {
        const next = blockList();
        const held = next[i];
        next.splice(i, 1);
        next.splice(to, 0, held);
        setBlocks(next);
      });
      return btn;
    };
    moves.appendChild(move(i - 1, "Move up", "↑"));
    moves.appendChild(move(i + 1, "Move down", "↓"));
    top.appendChild(moves);
    wrap.appendChild(top);

    const roleRow = el("div", "arf-row");
    const sel = document.createElement("select");
    sel.className = "arf-field";
    sel.style.maxWidth = "160px";
    sel.setAttribute("aria-label", "Role for " + blockLabel(b));
    for (const o of ROLE_OPTIONS) {
      const op = document.createElement("option");
      op.value = o.value;
      op.textContent = o.label;
      sel.appendChild(op);
    }
    sel.value = b.role;
    sel.addEventListener("change", () => {
      const next = blockList();
      next[i].role = sel.value;
      setBlocks(next, false);
    });
    roleRow.appendChild(el("span", "arf-note", "Sent as"));
    roleRow.appendChild(sel);
    if (own) {
      const drop = button("Remove", false);
      drop.addEventListener("click", () => {
        const next = blockList();
        next.splice(i, 1);
        setBlocks(next);
      });
      roleRow.appendChild(drop);
    }
    wrap.appendChild(roleRow);

    if (own) {
      const nameIn = document.createElement("input");
      nameIn.type = "text";
      nameIn.className = "arf-field";
      nameIn.value = b.name || "";
      nameIn.placeholder = "What to call it";
      nameIn.setAttribute("aria-label", "Name for this block");
      nameIn.setAttribute("data-arf-field", "blockname:" + b.id);
      nameIn.addEventListener("change", () => {
        const next = blockList();
        next[i].name = nameIn.value;
        setBlocks(next, false);
      });
      wrap.appendChild(nameIn);

      const ta = document.createElement("textarea");
      ta.rows = 3;
      ta.className = "arf-field";
      ta.value = b.text || "";
      ta.placeholder = "What this block says";
      ta.setAttribute("aria-label", "Text for this block");
      ta.setAttribute("data-arf-field", "blocktext:" + b.id);
      ta.addEventListener("input", () => {
        const next = blockList();
        next[i].text = ta.value;
        cfg.blocks = next;
        persist();
      });
      ta.addEventListener("blur", () => {
        const next = blockList();
        next[i].text = ta.value;
        setBlocks(next, false);
      });
      wrap.appendChild(ta);
    } else {
      wrap.appendChild(note(kind.hint));
    }
    return wrap;
  }

  function buildRules(): HTMLElement {
    const wrap = el("div", "arf-sec");
    wrap.appendChild(rule());
    wrap.appendChild(heading("The rules it follows"));
    wrap.appendChild(
      textBox(
        "rules",
        "What to change",
        "Plain sentences, one per line. Cut filler words. Keep paragraphs under four lines. Nothing is refined until there is something here.",
        5,
      ),
    );
    wrap.appendChild(
      textBox(
        "structureRules",
        "Structure and formatting",
        "Optional, and separate because it is a different kind of instruction: layout rather than wording. How dialogue is marked, how long a paragraph runs.",
        3,
      ),
    );
    return wrap;
  }

  function buildTryIt(): HTMLElement {
    const wrap = el("div", "arf-col");
    wrap.appendChild(rule());
    wrap.appendChild(heading("Try it"));
    wrap.appendChild(
      note(
        "Runs one refine on whatever is in the box and shows what comes back. Nothing is written to your chat.",
      ),
    );
    const ta = document.createElement("textarea");
    ta.rows = 3;
    ta.placeholder = "Paste a reply here";
    ta.setAttribute("data-arf-field", "tryText");
    ta.setAttribute("aria-label", "Text to try the rules on");
    ta.className = "arf-field";
    wrap.appendChild(ta);

    const row = el("div", "arf-row");
    const grab = button("Use my last reply", false);
    grab.addEventListener("click", () => {
      const t = lastRenderedReply();
      if (!t) {
        tryResult = { ok: false, text: "Could not find a reply on screen to read." };
        paint();
        return;
      }
      ta.value = t;
      ta.focus();
    });
    const go = button("Try it", false);
    go.disabled = tryBusy;
    go.style.opacity = tryBusy ? "0.5" : "1";
    go.addEventListener("click", () => {
      const text = String(ta.value || "").trim();
      if (!text) {
        tryResult = { ok: false, text: "Put some text in the box first." };
        paint();
        return;
      }
      if (!String(cfg.rules || "").trim() && !String(cfg.structureRules || "").trim()) {
        tryResult = { ok: false, text: "Write some rules first, or there is nothing to apply." };
        paint();
        return;
      }
      tryBusy = true;
      tryResult = null;
      persist(true);
      const id = newId();
      tryWaiting = id;
      send({ type: "try_refine", requestId: id, text: text, asUser: false });
      paint();
    });
    row.appendChild(grab);
    row.appendChild(go);
    wrap.appendChild(row);

    if (tryBusy) wrap.appendChild(note("Working..."));
    else if (tryResult)
      wrap.appendChild(
        el("div", "arf-well arf-scroll" + (tryResult.ok ? "" : " arf-dim"), tryResult.text),
      );
    return wrap;
  }

  let tryWaiting: string | null = null;

  function fieldRow(f: Field): HTMLElement {
    const wrap = el("div", "arf-col");
    if (f.type === "bool") {
      const lab = document.createElement("label");
      lab.className = "arf-between";
      lab.style.cursor = "pointer";
      lab.appendChild(el("span", "arf-lab", f.label));
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = !!cfg[f.key];
      box.setAttribute("data-arf-field", f.key);
      box.className = "arf-box";
      box.addEventListener("change", () => {
        cfg[f.key] = !!box.checked;
        persist(true);
      });
      lab.appendChild(box);
      wrap.appendChild(lab);
    } else if (f.type === "pick") {
      wrap.appendChild(el("div", "arf-lab", f.label));
      const sel = document.createElement("select");
      sel.setAttribute("data-arf-field", f.key);
      sel.setAttribute("aria-label", f.label);
      sel.className = "arf-field";
      const opts =
        f.key === "connectionId"
          ? [{ value: "", label: "The model I am chatting with" }].concat(
              connections.map((c) => ({
                value: c.id,
                label:
                  (c.name || c.provider || "Connection") +
                  (c.model ? " (" + c.model + ")" : "") +
                  (c.isDefault ? " - default" : ""),
              })),
            )
          : f.options || [];
      for (const o of opts) {
        const op = document.createElement("option");
        op.value = o.value;
        op.textContent = o.label;
        sel.appendChild(op);
      }
      sel.value = String(cfg[f.key] == null ? "" : cfg[f.key]);
      sel.addEventListener("change", () => {
        cfg[f.key] = sel.value;
        persist(true);
      });
      wrap.appendChild(sel);
    } else {
      wrap.appendChild(el("div", "arf-lab", f.label));
      const num = document.createElement("input");
      num.type = "number";
      if (f.min != null) num.min = String(f.min);
      if (f.max != null) num.max = String(f.max);
      num.value = String(cfg[f.key]);
      num.setAttribute("data-arf-field", f.key);
      num.setAttribute("aria-label", f.label);
      num.className = "arf-field";
      num.addEventListener("change", () => {
        let v = Math.round(Number(num.value));
        if (!Number.isFinite(v)) v = Number((CONFIG as any)[f.key]);
        if (f.min != null) v = Math.max(f.min, v);
        if (f.max != null) v = Math.min(f.max, v);
        cfg[f.key] = v;
        num.value = String(v);
        persist(true);
      });
      wrap.appendChild(num);
    }
    wrap.appendChild(note(f.hint));
    return wrap;
  }

  // Set once and left, so it stays folded and out of the way of the rules.
  function buildFold(): HTMLElement {
    const wrap = el("div", "arf-sec");
    wrap.appendChild(rule());
    // A real button, so the keyboard and a screen reader get it for free
    // rather than from a role attribute and a keydown handler that has to
    // remember Space as well as Enter.
    const head = document.createElement("button");
    head.type = "button";
    head.className = "arf-fold";
    head.setAttribute("aria-expanded", costOpen ? "true" : "false");
    const caret = el("span", "arf-note", costOpen ? "\u25be" : "\u25b8");
    head.appendChild(caret);
    head.appendChild(heading("How the pass runs"));
    const toggle = () => {
      costOpen = !costOpen;
      paint();
    };
    head.addEventListener("click", toggle);
    wrap.appendChild(head);
    if (!costOpen) return wrap;

    wrap.appendChild(
      note(
        "A refine is a second model call on every reply, so the first two are where the money and the waiting go. Both default to the cheap answer.",
      ),
    );
    for (const f of COST_FIELDS) wrap.appendChild(fieldRow(f));
    wrap.appendChild(rule());
    wrap.appendChild(heading("What it refuses to save"));
    wrap.appendChild(
      note(
        "A model asked to rewrite prose sometimes answers with something else. A rewrite that fails one of these is dropped and the reply is left exactly as it was, and the list below says which one fired.",
      ),
    );
    for (const f of LIMIT_FIELDS) wrap.appendChild(fieldRow(f));
    wrap.appendChild(rule());
    wrap.appendChild(heading("Sampler settings"));
    wrap.appendChild(
      note(
        "Left blank, the connection's own preset decides, which is what you want unless you have a reason. Fill one in and it is sent with the refine, and only with the refine: your chat is not affected.",
      ),
    );
    for (const s of SAMPLER_FIELDS) wrap.appendChild(samplerRow(s));
    const clear = button("Clear them all", false);
    clear.addEventListener("click", () => {
      cfg.samplers = {};
      persist(true);
      paint();
    });
    const clearRow = el("div", "arf-row");
    clearRow.appendChild(clear);
    wrap.appendChild(clearRow);
    return wrap;
  }

  function samplerRow(s: { id: string; label: string; min: number; max: number; step: string; hint: string }): HTMLElement {
    const wrap = el("div", "arf-col");
    wrap.appendChild(el("div", "arf-lab", s.label));
    const box = document.createElement("input");
    box.type = "number";
    box.min = String(s.min);
    box.max = String(s.max);
    box.step = s.step;
    box.className = "arf-field";
    box.placeholder = "Leave to the connection";
    box.setAttribute("aria-label", s.label);
    box.setAttribute("data-arf-field", "sampler:" + s.id);
    const held = cfg.samplers && cfg.samplers[s.id];
    box.value = held == null || held === "" ? "" : String(held);
    box.addEventListener("change", () => {
      const next = Object.assign({}, cfg.samplers || {});
      const raw = String(box.value).trim();
      // Cleared means handing it back to the connection, which is not the same
      // as sending zero, so the key goes rather than being set to 0.
      if (!raw) delete next[s.id];
      else {
        let v = Number(raw);
        if (!Number.isFinite(v)) {
          delete next[s.id];
          box.value = "";
        } else {
          v = Math.min(s.max, Math.max(s.min, v));
          next[s.id] = v;
          box.value = String(v);
        }
      }
      cfg.samplers = next;
      persist(true);
    });
    wrap.appendChild(box);
    if (s.hint) wrap.appendChild(note(s.hint));
    return wrap;
  }

  // ---- carrying a setup somewhere else ----
  // One file with everything in it: the rules, the layout, the samplers, the
  // lot. Not the chats you switched off, which name chats that do not exist on
  // the machine reading the file.
  function buildTransfer(): HTMLElement {
    const wrap = el("div", "arf-col");
    wrap.appendChild(rule());
    wrap.appendChild(heading("Import and export"));
    wrap.appendChild(
      note(
        "A file with your rules, your prompt layout and your sampler settings in it. Importing replaces what you have here, so export first if you want a way back.",
      ),
    );

    const row = el("div", "arf-row");
    const out = button("Export to a file", false);
    out.addEventListener("click", () => {
      const body = {
        extension: "auto-refine",
        version: VERSION,
        savedAt: new Date().toISOString(),
        settings: Object.assign({}, cfg, { blocks: blockList() }),
      };
      const ok = downloadText("auto-refine-settings.json", JSON.stringify(body, null, 2));
      transferSaid = ok
        ? "Exported."
        : "The browser would not save the file. Some private windows block downloads.";
      paint();
    });

    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = "application/json,.json";
    picker.style.display = "none";
    picker.addEventListener("change", () => {
      const file = picker.files && picker.files[0];
      picker.value = "";
      if (!file) return;
      readFileAsText(file, (text) => {
        transferSaid = applyImport(text);
        paint();
      });
    });
    const inBtn = button("Import a file", false);
    inBtn.addEventListener("click", () => {
      try {
        picker.click();
      } catch (_) {
        transferSaid = "The browser would not open a file picker.";
        paint();
      }
    });
    row.appendChild(out);
    row.appendChild(inBtn);
    row.appendChild(picker);
    wrap.appendChild(row);
    if (transferSaid) wrap.appendChild(note(transferSaid));
    return wrap;
  }

  // Reads a file back into the settings. Every value is checked against what it
  // is supposed to be rather than assigned: this is a file somebody was handed,
  // and one bad field should not leave the panel in a state it cannot repaint.
  function applyImport(text: string | null): string {
    if (!text) return "That file could not be read.";
    let body: any = null;
    try {
      body = JSON.parse(text);
    } catch (_) {
      return "That file is not settings JSON.";
    }
    const s = body && body.settings && typeof body.settings === "object" ? body.settings : body;
    if (!s || typeof s !== "object") return "That file has no settings in it.";
    if (body && body.extension && body.extension !== "auto-refine")
      return "That file is for a different extension.";

    let took = 0;
    for (const key of Object.keys(CONFIG)) {
      if (!(key in s)) continue;
      const want = (CONFIG as any)[key];
      const got = (s as any)[key];
      if (key === "blocks") {
        if (!Array.isArray(got)) continue;
        cfg.blocks = got
          .filter((b: any) => b && typeof b === "object" && b.id)
          .slice(0, 40)
          .map((b: any) => ({
            id: String(b.id),
            on: b.on !== false,
            role: ROLE_OPTIONS.some((r) => r.value === String(b.role)) ? String(b.role) : "system",
            text: b.text == null ? undefined : String(b.text),
            name: b.name == null ? undefined : String(b.name),
          }));
        took++;
      } else if (key === "samplers") {
        if (!got || typeof got !== "object" || Array.isArray(got)) continue;
        const clean: Record<string, number> = {};
        for (const f of SAMPLER_FIELDS) {
          const v = Number(got[f.id]);
          if (got[f.id] === "" || got[f.id] == null || !Number.isFinite(v)) continue;
          clean[f.id] = Math.min(f.max, Math.max(f.min, v));
        }
        cfg.samplers = clean;
        took++;
      } else if (typeof want === "boolean") {
        cfg[key] = !!got;
        took++;
      } else if (typeof want === "number") {
        const v = Number(got);
        if (Number.isFinite(v)) {
          cfg[key] = v;
          took++;
        }
      } else if (typeof want === "string") {
        if (typeof got === "string") {
          cfg[key] = got;
          took++;
        }
      }
    }
    if (!took) return "Nothing in that file matched a setting here.";
    persist(true);
    return "Imported " + took + " setting" + (took === 1 ? "" : "s") + ".";
  }

  // Save text as a file. False if the browser refused, which some private
  // windows do, and which is worth saying rather than looking like nothing
  // happened.
  function downloadText(filename: string, text: string): boolean {
    try {
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch (_) {}
      }, 1000);
      return true;
    } catch (_) {
      return false;
    }
  }

  function readFileAsText(file: any, cb: (text: string | null) => void): void {
    try {
      const reader = new FileReader();
      reader.onload = () => cb(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => cb(null);
      reader.readAsText(file);
    } catch (_) {
      cb(null);
    }
  }

  function buildChatSwitch(): HTMLElement {
    const wrap = el("div", "display:flex;flex-direction:column;gap:5px");
    wrap.setAttribute("data-arf-chat-switch", "1");
    wrap.appendChild(rule());
    const top = el("div", "arf-between");
    top.appendChild(el("span", "arf-lab", "This chat"));
    const known = lastChatId != null;
    const off = chatIsOff(lastChatId);
    const act = button(off ? "Turn on here" : "Turn off here", false);
    act.disabled = !known;
    act.style.opacity = known ? "1" : "0.45";
    act.style.cursor = known ? "pointer" : "not-allowed";
    act.addEventListener("click", () => setChatOff(lastChatId, !off));
    top.appendChild(act);
    wrap.appendChild(top);
    wrap.appendChild(
      note(
        !known
          ? "No chat is open, so there is nothing to switch here."
          : off
            ? "Auto Refine is switched off in this chat. Every other chat carries on as it is."
            : "Leave one chat completely alone while every other chat carries on.",
      ),
    );
    return wrap;
  }

  function buildActivity(): HTMLElement {
    const wrap = el("div", "arf-col");
    wrap.appendChild(rule());
    wrap.appendChild(heading("What it has been doing"));
    if (!activity.length) {
      wrap.appendChild(note("Nothing yet."));
      return wrap;
    }
    for (const a of activity) {
      const row = el("div", "arf-row arf-note");
      row.appendChild(el("span", "arf-when", new Date(a.at).toTimeString().slice(0, 5)));
      row.appendChild(el("span", "arf-said" + (a.good ? "" : " arf-dim"), a.text));
      wrap.appendChild(row);
    }
    return wrap;
  }

  // Read off the page at the moment it is asked for, so nothing is held between
  // replies.
  function lastRenderedReply(): string {
    try {
      if (typeof document === "undefined") return "";
      const all = document.querySelectorAll('[data-component="MessageContent"]');
      for (let i = all.length - 1; i >= 0; i--) {
        const t = String((all[i] as any).innerText || all[i].textContent || "").trim();
        if (t) return t;
      }
    } catch (_) {}
    return "";
  }

  function refineNow() {
    if (!cfg.enabled) {
      toast("Auto Refine is switched off.", true);
      return;
    }
    if (lastChatId == null) {
      toast("No chat is open. Open a chat and try again.", true);
      return;
    }
    if (!String(cfg.rules || "").trim() && !String(cfg.structureRules || "").trim()) {
      toast("No rules are written yet.", true);
      log("nothing to do: no rules are written yet");
      return;
    }
    busy = true;
    paint();
    send({
      type: "refine_now",
      requestId: newId(),
      chatId: lastChatId,
      messageId: lastMessageId,
    });
  }

  // ---- host events ----
  try {
    const offs = [
      ctx.events.on("CHAT_CHANGED", (p: any) => {
        if (!p) return;
        lastChatId = p.chatId || null;
        lastMessageId = null;
        paint();
      }),
      ctx.events.on("CHAT_SWITCHED", (p: any) => {
        if (!p || typeof p.chatId === "undefined") return;
        lastChatId = p.chatId || null;
        lastMessageId = null;
        paint();
      }),
      ctx.events.on("CHARACTER_MESSAGE_RENDERED", (p: any) => {
        if (!p) return;
        if (p.chatId) lastChatId = p.chatId;
        if (p.messageId) lastMessageId = p.messageId;
        paint();
      }),
      ctx.events.on("USER_MESSAGE_RENDERED", (p: any) => {
        if (p && p.chatId) lastChatId = p.chatId;
        paint();
      }),
      ctx.events.on("GENERATION_ENDED", (p: any) => {
        if (!p) return;
        if (p.chatId) lastChatId = p.chatId;
        if (p.messageId) lastMessageId = p.messageId;
        if (cfg.enabled && cfg.refineOn && !p.error && !chatIsOff(p.chatId)) {
          busy = true;
          paint();
        }
      }),
    ];
    for (const o of offs) if (typeof o === "function") disposers.push(o);
  } catch (_) {
    log("could not listen for replies. Check that the generation permission is granted.");
  }

  // ---- backend messages ----
  try {
    if (ctx && typeof ctx.onBackendMessage === "function") {
      const off = ctx.onBackendMessage((msg: any) => {
        try {
          if (!msg) return;
          if (msg.type === "backend_ready") {
            armBackend();
            send({ type: "list_connections", requestId: newId() });
            return;
          }
          if (msg.type === "connections") {
            connections = Array.isArray(msg.list) ? msg.list : [];
            paint();
            return;
          }
          if (msg.type === "refined") {
            busy = false;
            // A refine only happens in the chat the reader is in, so this is
            // also the chat. Adopted when nothing else has said so yet, or the
            // panel would hold a refine it could not show anybody.
            if (msg.chatId != null && lastChatId == null) lastChatId = msg.chatId;
            if (msg.chatId != null && msg.canUndo)
              undoable.set(String(msg.chatId), {
                messageId: msg.messageId,
                before: String(msg.before || ""),
                after: String(msg.after || ""),
              });
            // The badge is the point of the tab being closable: something
            // happened to your writing and you can see that without opening it.
            setBadge("1");
            log("refined a reply", true);
            toast("Reply refined.");
            return;
          }
          if (msg.type === "refine_skipped") {
            busy = false;
            log("left a reply alone: " + String(msg.why || "no reason given"));
            return;
          }
          if (msg.type === "refine_result") {
            busy = false;
            if (msg.ok) {
              log("refined a reply on request", true);
              toast("Reply refined.", true);
            } else {
              log("could not refine: " + String(msg.why || "no reason given"));
              toast("Not refined: " + String(msg.why || "no reason given"), true);
            }
            paint();
            return;
          }
          if (msg.type === "try_result") {
            if (tryWaiting !== msg.requestId) return;
            tryWaiting = null;
            tryBusy = false;
            tryResult = msg.ok
              ? { ok: true, text: String(msg.after || "") }
              : {
                  ok: false,
                  text:
                    "This would not have been saved: " +
                    String(msg.why || "no reason given") +
                    (msg.after ? "\n\nWhat came back:\n" + String(msg.after) : ""),
                };
            paint();
            return;
          }
          if (msg.type === "undo_result") {
            if (msg.ok) {
              if (lastChatId != null) undoable.delete(String(lastChatId));
              setBadge(null);
              log("put a reply back the way it was", true);
              toast("Put back.", true);
            } else {
              log("could not put it back: " + String(msg.why || "no reason given"));
            }
            paint();
            return;
          }
          if (msg.type === "confirm_refine") {
            busy = false;
            askToSave(msg);
            return;
          }
        } catch (_) {}
      });
      if (typeof off === "function") disposers.push(off);
    }
  } catch (_) {}

  // The one modal in the extension, and it earns it: this is a question that
  // has to be answered before anything is written, which is exactly the moment
  // a modal is for. Everything else lives in the tab.
  function askToSave(msg: any) {
    try {
      if (!ctx.ui || typeof ctx.ui.showModal !== "function") return;
      const modal = ctx.ui.showModal({ title: "Save this refine?" });
      const root = modal.root as HTMLElement;
      root.innerHTML = "";
      root.className = "arf";
      root.style.maxHeight = "70vh";
      root.style.overflowY = "auto";
      const pane = (title: string, text: string) => {
        root.appendChild(heading(title));
        root.appendChild(el("div", "arf-well", text));
      };
      pane("As it is now", String(msg.before || ""));
      pane("After the refine", String(msg.after || ""));
      const bar = el("div", "arf-row");
      const yes = button("Save it", true);
      const no = button("Leave it alone", false);
      yes.addEventListener("click", () => {
        send({
          type: "apply_refine",
          requestId: newId(),
          chatId: msg.chatId,
          messageId: msg.messageId,
          after: msg.after,
        });
        try {
          modal.dismiss && modal.dismiss();
        } catch (_) {}
      });
      no.addEventListener("click", () => {
        log("left a reply alone: you said no");
        try {
          modal.dismiss && modal.dismiss();
        } catch (_) {}
      });
      bar.appendChild(yes);
      bar.appendChild(no);
      root.appendChild(bar);
    } catch (_) {}
  }

  // ---- start ----
  try {
    if (ctx.ui && typeof ctx.ui.registerDrawerTab === "function") {
      tab = ctx.ui.registerDrawerTab({
        id: "auto-refine",
        title: "Auto Refine",
        shortName: "Refine",
        description: "Rewrite each reply to follow rules you write, and put one back if you disagree",
        // What the command palette searches, written for somebody who does not
        // already know the extension by name.
        keywords: ["refine", "rewrite", "polish", "edit", "prose", "style", "rules"],
        iconSvg: refineIcon(),
      });
      disposers.push(() => {
        try {
          tab && tab.destroy && tab.destroy();
        } catch (_) {}
      });
    }
  } catch (_) {}

  injectStyle();
  armBackend();
  send({ type: "list_connections", requestId: newId() });
  log("ready v" + VERSION);
  paint();

  return () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    for (const d of disposers.splice(0)) {
      try {
        d();
      } catch (_) {}
    }
    tab = null;
  };
}

// The defaults and the fields built from them, so a check can hold the two
// against each other. A setting in one and not the other looks fine and quietly
// never loads.
export const __testing = {
  CONFIG,
  COST_FIELDS,
  LIMIT_FIELDS,
  BLOCK_KINDS,
  DEFAULT_BLOCKS,
  ROLE_OPTIONS,
  SAMPLER_FIELDS,
  refineIcon,
  VERSION,
  // Pure, so a theme with a light accent can be checked without a browser.
  parseColor,
  blendColor,
  relLuminance,
  contrastRatio,
  betterInk,
  TEXT_FLOOR,
  FILL_FLOOR,
};
