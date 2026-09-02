/*
 * Auto Refine frontend.
 *
 * The whole surface is one drawer tab. That is chosen rather than
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
const CARET_OPEN = "\u25be";
const CARET_SHUT = "\u25b8";
const CHATS_OFF_KEY = "lv-auto-refine:chats-off:v1";
const PRESETS_KEY = "lv-auto-refine:presets:v1";

// What a preset carries: everything that decides how a refine reads. The rest
// stays yours whichever preset you load, which is the split that makes a preset
// worth having. A connection is not in here on purpose: an id from somebody
// else's account names nothing on yours, so a shared preset that carried one
// would quietly point at nothing.
const PRESET_KEYS = [
  "blocks",
  "contextMessages",
  "samplers",
  "thinkingMode",
  "thinkingEffort",
];

// Every setting, with the value a fresh install starts on.
const CONFIG = {
  enabled: true,
  // The automatic pass is off until asked for. This rewrites saved messages
  // with a model, which is not something to start doing to somebody's chat
  // because they installed an extension.
  refineOn: false,
  refineUserMessages: false,
  connectionId: "",
  thinkingMode: "off",
  thinkingEffort: "medium",
  timeoutSecs: 90,
  maxGrowthPct: 60,
  minShrinkPct: 40,
  keepOriginal: true,
  confirmBeforeSave: false,
  toast: true,
  // A sound when a refine lands, off until asked for. An extension that starts
  // making noise because it was installed is an extension people uninstall.
  soundOn: false,
  // Empty means the built-in two-note blip, which is synthesised rather than
  // shipped so there is no audio file in the repository. A reader's own sound
  // is held as a data URL, which is why it is capped.
  soundUrl: "",
  soundVolume: 60,
  // The floating button: one tap to refine the latest reply without opening the
  // drawer. Needs the ui_panels permission, and says so if it is missing.
  widgetOn: false,
  // Markup, code and the model's own thinking are lifted out of a message
  // before it is sent and put back afterwards. On by default: a rewrite that
  // eats a colour tag is the most common way this kind of extension ruins
  // somebody's reply, and they only notice three messages later.
  protectOn: true,
  protectThinking: true,
  // Asking for the rewrite inside <refined> tags rather than on its own. A
  // model that cannot help adding a sentence of its own still puts the rewrite
  // between the tags, and taking what is between them is exact.
  wrapOutput: true,
  // A button on every message, and one in the input bar. Both off until asked
  // for: they reach into the page, and an extension that redecorates somebody's
  // chat on install is one they uninstall.
  msgButton: false,
  // Refining what you are about to send, from the input bar, before it is sent.
  // Off by default: it edits the box you are typing in, which is not something
  // to start doing unasked.
  inputRefine: false,
  // How many messages of the run-up go in the prompt. A rewrite that cannot see
  // what just happened flattens a scene into general prose, which is the
  // failure people blame on the model.
  contextMessages: 4,
  // Which tab the panel opens on, remembered so it comes back where you left it.
  tab: "prompt",
  // The prompt layout. Empty means the default order below, so a fresh install
  // does not carry a copy of it around and a later change to the default
  // reaches anybody who never edited theirs.
  blocks: [] as Block[],
  // Sampler values for the refine call. Empty means the connection's preset
  // decides, which is the right default: somebody who tuned a preset should not
  // have it quietly overridden by an extension.
  samplers: {} as Record<string, any>,
};

// The macros a block can carry. Ours are answered here; the rest are handed to
// Lumiverse, which already resolves them for every other prompt it builds.
const MACROS: Array<{ tag: string; what: string; ours: boolean }> = [
  { tag: "{{message}}", what: "The turn being refined. Every prompt needs this one.", ours: true },
  { tag: "{{history}}", what: "The messages leading up to it, as many as Context says.", ours: true },
  { tag: "{{lore}}", what: "The lorebook entries this chat has active.", ours: true },
  { tag: "{{whose}}", what: "A line saying whether the character or the player wrote it.", ours: true },
  { tag: "{{refine_notes}}", what: "Where to keep its reasoning. Empty unless thinking is on.", ours: true },
  { tag: "{{output_format}}", what: "Tells it to wrap the answer in <refined> tags. Empty if you switched that off.", ours: true },
  { tag: "{{protect_notes}}", what: "Tells it to leave the protection tokens alone. Only appears when there are some.", ours: true },
  { tag: "{{description}}", what: "The character card's description.", ours: false },
  { tag: "{{personality}}", what: "The card's personality.", ours: false },
  { tag: "{{scenario}}", what: "The card's scenario.", ours: false },
  { tag: "{{persona}}", what: "Your persona for this chat.", ours: false },
  { tag: "{{char}}", what: "The character's name.", ours: false },
  { tag: "{{user}}", what: "Your name.", ours: false },
];

type Block = { id: string; name: string; on: boolean; role: string; text: string };

const TURN_MACRO = "{{message}}";

// ---- the prompts that ship with it ----
// Four, because two questions have different answers: does your model reason,
// and do you want the short version or the whole thing.
//
// A model that reasons is given the standard and left to apply it. A model that
// does not is given the list, because it will pattern-match a list and will not
// derive one from a principle. That is the difference between the two columns,
// and it is why the reasoning prompts are shorter rather than longer.
//
// All four are written second person, and use XML tags as headings with a
// closing tag at the end, because a model reads a tagged block as one
// instruction instead of a paragraph running into the next one.

const CONTEXT_BLOCKS: Block[] = [
  {
    id: "character",
    name: "Who the character is",
    on: true,
    role: "system",
    text: "<character>\n{{description}}\n</character>",
  },
  {
    id: "persona",
    name: "Who the player is",
    on: true,
    role: "system",
    text: "<player>\n{{persona}}\n</player>",
  },
  {
    id: "lore",
    name: "What is true in this world",
    on: true,
    role: "system",
    text: "<world>\n{{lore}}\n</world>",
  },
  {
    id: "history",
    name: "What has been happening",
    on: true,
    role: "system",
    text: "<recent_scene>\n{{history}}\n</recent_scene>",
  },
];

const TURN_BLOCK: Block = {
  id: "turn",
  name: "The turn to refine",
  on: true,
  role: "user",
  text: "{{whose}}\n\n<turn_to_refine>\n{{message}}\n</turn_to_refine>",
};

const HOW_TO_ANSWER: Block = {
  id: "answer",
  name: "How to answer",
  on: true,
  role: "system",
  text: "{{output_format}}\n\n{{protect_notes}}",
};

const JOB_BLOCK: Block = {
  id: "job",
  name: "The job",
  on: true,
  role: "system",
  text:
    "<your_job>\n" +
    "You are editing one message from a story two people are writing together. " +
    "Someone wrote this message and you are fixing how it reads. You are not " +
    "writing the next one.\n\n" +
    "The events stay. The speech stays. What anyone means stays. Nobody new " +
    "walks in, nothing new happens, and the scene ends exactly where it ended.\n" +
    "</your_job>",
};

// ---- the plain model, short ----
const PLAIN_SHORT: Block[] = [
  JOB_BLOCK,
  ...CONTEXT_BLOCKS,
  {
    id: "cut",
    name: "Cut these",
    on: true,
    role: "system",
    text:
      "<cut_these>\n" +
      "These turn up in every machine-written scene and almost never in a book. " +
      "Cut them wherever you find them:\n\n" +
      "- a breath someone did not know they were holding\n" +
      "- a heart hammering, pounding or thundering against ribs\n" +
      "- a voice barely above a whisper\n" +
      "- eyes that darken, or trace, or flick\n" +
      "- something unspoken hanging in the air\n" +
      "- an emotion described as a mixture of two other emotions\n" +
      "- not knowing whether to do one thing or another\n\n" +
      "Cut these words unless the sentence stops working without them: " +
      "suddenly, slowly, slightly, just, really, very, almost, seemed to, " +
      "began to, found himself, found herself.\n\n" +
      "When you cut a line, do not write another line doing the same job. The " +
      "message is usually better one sentence shorter.\n" +
      "</cut_these>",
  },
  {
    id: "leave",
    name: "What to leave alone",
    on: true,
    role: "system",
    text:
      "<leave_it_alone>\n" +
      "A passage that is already good comes back exactly as it was. Rewriting " +
      "something that did not need it is the worst thing you can do here: it " +
      "takes away a line the writer chose, and they cannot always see what you " +
      "changed.\n\n" +
      "Your rewrite should not be longer than what you were given. If it is, " +
      "you added instead of fixing.\n" +
      "</leave_it_alone>",
  },
  HOW_TO_ANSWER,
  TURN_BLOCK,
];

// ---- the plain model, in full ----
const PLAIN_LONG: Block[] = [
  JOB_BLOCK,
  ...CONTEXT_BLOCKS,
  PLAIN_SHORT[5], // cut these
  {
    id: "rhythm",
    name: "Rhythm",
    on: true,
    role: "system",
    text:
      "<rhythm>\n" +
      "Read the message for length before you read it for sense. If three " +
      "sentences in a row run about the same length, change one of them.\n\n" +
      "A fragment lands once. Three in a row is a tic.\n\n" +
      "Cut the sentence that says what the sentence before it already said in " +
      "different words. This is the single most common thing wrong with these " +
      "messages, and it is worth reading the whole message twice to catch.\n" +
      "</rhythm>",
  },
  {
    id: "dialogue",
    name: "Speech",
    on: true,
    role: "system",
    text:
      "<speech>\n" +
      "Every line keeps its meaning. You can fix phrasing that is stiff or " +
      "unnatural. You cannot change what was said, and you cannot add a line " +
      "nobody said.\n\n" +
      "Cut the tag that explains the line: she said angrily, he asked, curious. " +
      "If the tone is not already in the words, fix the words.\n\n" +
      "Cut speech that repeats back what the other person just did before " +
      "answering it.\n" +
      "</speech>",
  },
  {
    id: "bodies",
    name: "Bodies and feeling",
    on: true,
    role: "system",
    text:
      "<bodies_and_feeling>\n" +
      "Hands, eyes and breath do not act on their own. If the message says her " +
      "hand found his, write that she took his hand.\n\n" +
      "Feeling belongs in what someone does. Do not name the feeling as well: " +
      "if she is already pulling her coat closed, you do not need to say she " +
      "felt exposed.\n\n" +
      "One physical detail per beat is plenty. Three stacked together is a list, " +
      "and a reader skims a list.\n" +
      "</bodies_and_feeling>",
  },
  {
    id: "endings",
    name: "How it ends",
    on: true,
    role: "system",
    text:
      "<how_it_ends>\n" +
      "The message ends where it ends. Do not add a closing line that gestures " +
      "at what happens next, and do not turn the last line into a question " +
      "aimed at the other person.\n\n" +
      "If it already ends on a hook, keep the hook. The shape of the turn is not " +
      "yours to change.\n" +
      "</how_it_ends>",
  },
  PLAIN_SHORT[6], // leave it alone
  HOW_TO_ANSWER,
  TURN_BLOCK,
];

// ---- a model that reasons, short ----
const THINKS_SHORT: Block[] = [
  {
    id: "job",
    name: "The job",
    on: true,
    role: "system",
    text:
      "<your_job>\n" +
      "You are editing one message from a story two people are writing together. " +
      "Work out what is weak about how it is written, then fix that.\n\n" +
      "The events stay. The speech stays. What anyone means stays. Nobody new " +
      "walks in, nothing new happens, and the scene ends exactly where it ended.\n" +
      "</your_job>",
  },
  {
    id: "notes",
    name: "Where your thinking goes",
    on: true,
    role: "system",
    text: "{{refine_notes}}",
  },
  ...CONTEXT_BLOCKS,
  {
    id: "standard",
    name: "The standard",
    on: true,
    role: "system",
    text:
      "<the_standard>\n" +
      "One question decides every line: could this sentence sit in any story, or " +
      "only in this one?\n\n" +
      "A sentence that could sit anywhere is the sentence to fix. Put in its " +
      "place what is true of this person, in this room, right now. If nothing is " +
      "true there, cut the line and do not replace it.\n\n" +
      "Ask the same question of speech, of gesture, and of description. Ask it " +
      "of your own rewrite before you answer.\n" +
      "</the_standard>",
  },
  {
    id: "restraint",
    name: "Restraint",
    on: true,
    role: "system",
    text:
      "<restraint>\n" +
      "A passage that is already good comes back exactly as it was.\n\n" +
      "Do not make the message longer to make it better. Shorter with nothing " +
      "wasted is almost always the right answer.\n" +
      "</restraint>",
  },
  HOW_TO_ANSWER,
  TURN_BLOCK,
];

// ---- a model that reasons, in full ----
const THINKS_LONG: Block[] = [
  THINKS_SHORT[0], // job
  THINKS_SHORT[1], // notes
  ...CONTEXT_BLOCKS,
  THINKS_SHORT[6], // the standard
  {
    id: "where",
    name: "Where to look",
    on: true,
    role: "system",
    text:
      "<where_to_look>\n" +
      "Four places account for most of what goes wrong in a message like this. " +
      "Check each one before you decide the message is fine.\n\n" +
      "The second sentence. It often restates the first in different words. One " +
      "of the two is doing the work; keep that one.\n\n" +
      "The body. Hands and eyes that act on their own, a heartbeat standing in " +
      "for a feeling, three physical details stacked where one would land.\n\n" +
      "The speech tag. If it explains the tone, the line underneath it is not " +
      "carrying its weight.\n\n" +
      "The last line. A turn that ends by gesturing at what comes next is asking " +
      "the other writer to do the work.\n" +
      "</where_to_look>",
  },
  {
    id: "voice",
    name: "Voice",
    on: true,
    role: "system",
    text:
      "<voice>\n" +
      "The message has a voice already. Yours is not it. Fix what is weak in the " +
      "voice that is there rather than replacing it with a cleaner one.\n\n" +
      "This matters most with a character who speaks badly on purpose: clipped, " +
      "rambling, plain, crude. Smoothing that out is not an improvement, it is a " +
      "different character.\n" +
      "</voice>",
  },
  THINKS_SHORT[7], // restraint
  {
    id: "check",
    name: "Before you answer",
    on: true,
    role: "system",
    text:
      "<before_you_answer>\n" +
      "Read your rewrite against the original once more and answer two " +
      "questions.\n\n" +
      "Did anything happen in your version that did not happen in theirs? If so, " +
      "take it out.\n\n" +
      "Is your version longer? If so, find what you added and decide honestly " +
      "whether it earns its place. Usually it does not.\n" +
      "</before_you_answer>",
  },
  HOW_TO_ANSWER,
  TURN_BLOCK,
];

// What a fresh install starts on. The short plain one, because it is the prompt
// that works on the widest set of models and is the easiest to read before you
// start editing it.
const DEFAULT_BLOCKS: Block[] = PLAIN_SHORT;

const BUILT_IN_PROMPTS: Array<{ name: string; blocks: Block[]; thinking: string; what: string }> = [
  {
    name: "Short",
    blocks: PLAIN_SHORT,
    thinking: "off",
    what: "The one to start with. Seven blocks, the common faults named outright, and nothing your model has to work out for itself.",
  },
  {
    name: "Detailed",
    blocks: PLAIN_LONG,
    thinking: "off",
    what: "The same idea, taken further: rhythm, speech, bodies and endings each get a block. Costs more per refine and catches more.",
  },
  {
    name: "Short, for a thinking model",
    blocks: THINKS_SHORT,
    thinking: "inherit",
    what: "Gives your model the standard and lets it work out the rest. Shorter than the plain one on purpose: a model that reasons does not need the list.",
  },
  {
    name: "Detailed, for a thinking model",
    blocks: THINKS_LONG,
    thinking: "inherit",
    what: "The standard, where to look for trouble, keeping the writer's voice, and a pass over its own answer before it hands it back.",
  },
];
const BUILT_IN = BUILT_IN_PROMPTS.map((p) => p.name);

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
  // Shown only while thinkingMode holds this value. A row that does nothing
  // where it sits is worse than a row that is not there.
  needs?: string;
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
      { value: "inherit", label: "Whatever my connection is set to" },
      { value: "custom", label: "Yes, and I will say how much" },
    ],
    hint: "Off by default. Rewriting a paragraph is not a reasoning problem, and extended thinking on every reply is the cost nobody notices until the bill arrives. The middle one sends nothing at all, which is what leaves your own reasoning settings in charge.",
  },
  {
    key: "thinkingEffort",
    label: "How much thinking",
    type: "pick",
    needs: "custom",
    options: [
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high", label: "High" },
    ],
    hint: "Only used when you picked the last option above. What each level means is the provider's business, and a provider that does not take an effort level ignores it.",
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
function undoIcon(): string {
  return (
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M3 8h11a5 5 0 0 1 0 10H8" />' +
    '<path d="M6.5 4.5 3 8l3.5 3.5" />' +
    "</svg>"
  );
}

// A ring with a gap, turned by the stylesheet rather than by a timer.
function spinIcon(): string {
  return (
    '<svg class="arf-spin" viewBox="0 0 24 24" width="14" height="14" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
    '<path d="M21 12a9 9 0 1 1-6.2-8.6" />' +
    "</svg>"
  );
}

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
      // The floating button and the Extras row follow the settings that turn
      // them on, and this is the one place every change passes through.
      syncExtras();
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
  // Whether something that could actually look has said no chat is open. Not
  // knowing and knowing there is nothing are different states: one is the home
  // screen, the other is the panel waiting to be told where it is.
  let noChatOpen = false;
  let character: string | null = null;
  // Read through here rather than off the flag. The chat id is set in several
  // places, and a flag cleared in all but one of them would go stale; pairing
  // the two at the point of reading means "no chat" cannot be believed while a
  // chat is known, whoever forgot to clear it.
  const outsideAnyChat = (): boolean => noChatOpen && lastChatId == null;

  // ---- knowing when the chat has been left ----
  // Walking out to the home screen, or onto a character page, is the move
  // nothing reliably announces. Some builds send CHAT_SWITCHED with a null id
  // and some say nothing at all, and asking the backend does not settle it
  // either: getActive answers with the account's most recent chat, which on the
  // home screen is the chat you just left.
  //
  // The address bar is the one thing in reach that knows. It is read rather
  // than parsed: no assumption about the shape of a Lumiverse URL, only whether
  // the id being held still appears in it. A build whose addresses never carry
  // the id leaves urlNamesChats false and none of this does anything.
  const URL_TICK_MS = 700;
  // An id short enough to appear inside an unrelated address by accident is not
  // evidence of anything, and being wrong here throws away the chat somebody is
  // sitting in.
  const URL_ID_MIN = 8;
  let urlNamesChats = false;
  let urlTimer: any = null;
  const hereUrl = (): string => {
    try {
      return String(location.href || "");
    } catch (_) {
      return "";
    }
  };
  const urlHolds = (id: any): boolean => {
    const t = id == null ? "" : String(id);
    if (t.length < URL_ID_MIN) return false;
    return hereUrl().indexOf(t) >= 0;
  };

  // Everything that describes the chat you are in, told you are not in one.
  function leftTheChat() {
    noChatOpen = true;
    lastChatId = null;
    lastMessageId = null;
    character = null;
    preview = null;
    stopUrlWatch();
    paint();
  }

  function startUrlWatch() {
    // Read now and not only on the tick. This runs the moment the browser says
    // which chat is open, which is the one moment the address is certain to
    // agree; a first tick landing after somebody has moved on would read an
    // address without the id and prove nothing.
    if (urlHolds(lastChatId)) urlNamesChats = true;
    if (urlTimer) return;
    urlTimer = setInterval(() => {
      if (lastChatId == null) {
        stopUrlWatch();
        return;
      }
      if (urlHolds(lastChatId)) {
        urlNamesChats = true;
        return;
      }
      if (!urlNamesChats) return;
      leftTheChat();
      // Moving from one chat straight into another looks the same from here as
      // walking out, so this asks where we ended up.
      askActiveChat();
    }, URL_TICK_MS);
  }
  function stopUrlWatch() {
    if (!urlTimer) return;
    clearInterval(urlTimer);
    urlTimer = null;
  }
  disposers.push(stopUrlWatch);

  let chatAsk: string | null = null;
  function askActiveChat() {
    const id = newId();
    chatAsk = id;
    send({ type: "active_chat", requestId: id, chatId: null });
  }

  // The one place a chat id arrives, whichever event carried it, so the flag,
  // the watch and the panel cannot end up disagreeing.
  function sawChat(id: any, messageId?: any) {
    if (id == null) return;
    const changed = String(id) !== String(lastChatId);
    lastChatId = id;
    noChatOpen = false;
    if (messageId != null) lastMessageId = messageId;
    if (changed) {
      lastMessageId = messageId != null ? messageId : null;
      character = null;
      preview = null;
      askActiveChat();
    }
    startUrlWatch();
  }
  let busy = false;
  // The refine that can still be undone, per chat. What the tab is really for:
  // seeing what happened to your prose and disagreeing with it.
  // Every refine that can still be put back, newest last, keyed by the chat and
  // the message together. It was one per chat, which meant a second refine in
  // the same chat quietly took away the way back from the first. The backend
  // keeps the text for thirty of them, so the panel keeps the same number.
  const undoable = new Map<string, { chatId: any; messageId: any; before: string; after: string; at: number }>();
  const UNDO_MAX = 30;
  const undoKey = (c: any, m: any) => String(c) + ":" + String(m);
  // The ones in the chat you are looking at, newest first.
  function undoHere(): Array<{ chatId: any; messageId: any; before: string; after: string; at: number }> {
    if (lastChatId == null) return [];
    const out: any[] = [];
    undoable.forEach((v) => {
      if (String(v.chatId) === String(lastChatId)) out.push(v);
    });
    return out.sort((a, b) => b.at - a.at);
  }
  let connections: Array<{ id: string; name: string; provider: string; model: string; isDefault: boolean }> = [];
  let tryResult: { ok: boolean; text: string } | null = null;
  let tryBusy = false;
  // The status line's own nodes, so the running clock can be written into them
  // without repainting the panel around whatever somebody is typing in.
  let liveEls: { dot: any; text: any } | null = null;
  let clock: any = null;
  let runStartedAt = 0;
  let lastRun: { ms: number; ok: boolean; why: string } | null = null;
  // Counts for the Log tab. Session only: this answers "is it doing anything",
  // not "what did it do last week".
  const tally = { saved: 0, dropped: 0, undone: 0 };
  const drops = new Map<string, number>();
  const DROPS_MAX = 20;
  function countDrop(why: string) {
    const k = String(why || "no reason given").slice(0, 80);
    drops.set(k, (drops.get(k) || 0) + 1);
    while (drops.size > DROPS_MAX) drops.delete(drops.keys().next().value as string);
  }
  let preview: any = null;
  let previewBusy = false;
  let previewWaiting: string | null = null;
  let soundSaid: string | null = null;
  let nameWithheld = false;
  let widgetFailed = false;
  const SOUND_MAX = 512 * 1024;

  // The clock under the status line. Runs only while something is in flight,
  // and writes one number rather than rebuilding the panel.
  function markBusy(on: boolean) {
    if (on && !busy) runStartedAt = Date.now();
    if (!on && busy && runStartedAt) lastRunMs = Date.now() - runStartedAt;
    busy = on;
    if (on) {
      if (!clock)
        clock = setInterval(() => {
          try {
            if (!busy || !liveEls) return;
            const secs = (Date.now() - runStartedAt) / 1000;
            liveEls.text.textContent = "Refining a reply, " + secs.toFixed(0) + "s";
          } catch (_) {}
        }, 500);
    } else if (clock) {
      clearInterval(clock);
      clock = null;
    }
  }
  let lastRunMs = 0;
  disposers.push(() => {
    if (clock) clearInterval(clock);
    clock = null;
  });

  const chatIsOff = (id: any) => id != null && chatsOff.indexOf(String(id)) >= 0;
  function saveChatsOff() {
    try {
      if (typeof localStorage !== "undefined")
        localStorage.setItem(CHATS_OFF_KEY, JSON.stringify(chatsOff));
    } catch (_) {}
    send({ type: "set_chats_off", chats: chatsOff.slice() });
  }

  function setChatOff(id: any, off: boolean) {
    if (id == null) return;
    const s = String(id);
    const at = chatsOff.indexOf(s);
    if (off && at < 0) chatsOff.push(s);
    else if (!off && at >= 0) chatsOff.splice(at, 1);
    while (chatsOff.length > 500) chatsOff.shift();
    saveChatsOff();
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
    // The mark on a field reached by keyboard. A soft ring in the accent at low
    // alpha, sitting on the field's own edge: a solid 2px outline with an
    // offset draws a second rounded rectangle around every box, which is a halo
    // rather than a focus mark.
    ".arf-field:focus-visible,.arf-field:focus{outline:none;" +
    "border-color:var(--lumiverse-primary-050,rgba(147,112,219,.5));" +
    "box-shadow:0 0 0 2px var(--lumiverse-primary-020,rgba(147,112,219,.2))}" +
    // The browser's own up and down arrows on a number box are drawn by the
    // browser rather than the theme, so on a dark panel they arrive as grey
    // chevrons belonging to no design here. The value is typed, and a focused
    // box still steps with the arrow keys.
    ".arf-field[type=number]::-webkit-outer-spin-button," +
    ".arf-field[type=number]::-webkit-inner-spin-button" +
    "{-webkit-appearance:none;appearance:none;margin:0}" +
    ".arf-field[type=number]{-moz-appearance:textfield;appearance:textfield}" +
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
    ".arf-btn:focus-visible{outline:none;" +
    "box-shadow:0 0 0 2px var(--lumiverse-primary-020,rgba(147,112,219,.2))," +
    "0 0 8px 0 var(--lumiverse-primary-020,rgba(147,112,219,.2))}" +
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
    // ---- the fold, as a box rather than a line of text ----
    // A heading you can click looks like a heading until you click it. Given an
    // edge, a fill and a caret that turns, it looks like a thing that opens,
    // which is the whole job.
    ".arf-fold{display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;" +
    "width:100%;text-align:left;min-height:34px;padding:7px 10px;" +
    "border-radius:var(--lumiverse-radius-sm,5px);" +
    "border:1px solid var(--lumiverse-border-neutral,rgba(128,128,128,.15));" +
    "background:var(--lumiverse-fill-subtle,rgba(0,0,0,.1));" +
    "color:var(--lumiverse-text,rgba(255,255,255,.9));" +
    "font:12.5px var(--lumiverse-font-family,system-ui);" +
    "transition:background-color var(--lumiverse-transition-fast,150ms ease)}" +
    ".arf-fold:hover{background:var(--lumiverse-secondary,rgba(128,128,128,.15))}" +
    ".arf-fold:focus-visible{outline:none;" +
    "box-shadow:0 0 0 2px var(--lumiverse-primary-020,rgba(147,112,219,.2))}" +
    ".arf-caret{flex:none;font-size:9px;width:9px;" +
    "color:var(--lumiverse-text-muted,rgba(255,255,255,.65))}" +
    ".arf-foldbody{display:flex;flex-direction:column;gap:11px;padding:2px 2px 4px 10px;" +
    "border-left:1px solid var(--lumiverse-border,rgba(147,112,219,.12));margin-left:5px}" +

    // ---- cards ----
    // Every group of settings gets a box of its own. This is the difference
    // between a panel you can scan and a column of rows you have to read: the
    // eye finds the edge of a box without being told to.
    ".arf-card{display:flex;flex-direction:column;gap:11px;padding:12px;" +
    "border-radius:var(--lumiverse-radius-md,10px);" +
    "border:1px solid var(--lumiverse-border,rgba(147,112,219,.12));" +
    "background:var(--lumiverse-fill-subtle,rgba(0,0,0,.1))}" +
    // The card's own title. Bigger and plainer than the old all-caps label,
    // because at 11px uppercase a heading reads as another muted row.
    ".arf-cardh{display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600;" +
    "color:var(--lumiverse-text,rgba(255,255,255,.9))}" +
    ".arf-cardh .arf-note{font-weight:400}" +

    // ---- the tab strip ----
    // Scrolls sideways rather than wrapping. Wrapped tabs move under each other
    // as the panel narrows, and the row you tapped is not where you left it.
    ".arf-tabs{display:flex;gap:2px;overflow-x:auto;scrollbar-width:none;-ms-overflow-style:none;" +
    "border-bottom:1px solid var(--lumiverse-border,rgba(147,112,219,.12))}" +
    ".arf-tabs::-webkit-scrollbar{display:none}" +
    ".arf-tab{flex:none;cursor:pointer;background:none;border:0;border-bottom:2px solid transparent;" +
    "padding:9px 11px;margin-bottom:-1px;white-space:nowrap;" +
    "font:12.5px var(--lumiverse-font-family,system-ui);" +
    "color:var(--lumiverse-text-muted,rgba(255,255,255,.65));" +
    "transition:color var(--lumiverse-transition-fast,150ms ease)}" +
    ".arf-tab:hover{color:var(--lumiverse-text,rgba(255,255,255,.9))}" +
    ".arf-tab[aria-selected=true]{color:var(--lumiverse-text,rgba(255,255,255,.9));" +
    "border-bottom-color:var(--lumiverse-primary,rgba(147,112,219,.9))}" +
    ".arf-tab:focus-visible{outline:none;" +
    "box-shadow:inset 0 0 0 2px var(--lumiverse-primary-020,rgba(147,112,219,.2))}" +
    ".arf-body{display:flex;flex-direction:column;gap:12px}" +
    // A pill for a count or a state, next to a card title.
    ".arf-pill{flex:none;font-size:11px;padding:2px 7px;border-radius:999px;" +
    "background:var(--lumiverse-secondary,rgba(128,128,128,.15));" +
    "color:var(--lumiverse-text-muted,rgba(255,255,255,.65))}" +
    // One block in the prompt list. Indented and edged so eight of them read as
    // a list of things rather than as twenty-four loose rows.
    ".arf-block{display:flex;flex-direction:column;gap:7px;padding:9px 10px;" +
    "border-radius:var(--lumiverse-radius-sm,5px);" +
    "border:1px solid var(--lumiverse-border-neutral,rgba(128,128,128,.15));" +
    "background:var(--lumiverse-fill,rgba(0,0,0,.15))}" +
    ".arf-block.arf-hushed{opacity:.55}" +
    ".arf-mini{min-height:28px;width:32px;padding:0;font-size:13px;line-height:1}" +
    // The button this extension puts on a message and in the input bar. Styled
    // to sit with the host's own icon buttons rather than to stand out: it is
    // one more action in a row of them, not a badge.
    ".arf-msgbtn{display:inline-flex;align-items:center;justify-content:center;" +
    "background:none;border:0;padding:4px;cursor:pointer;border-radius:var(--lumiverse-radius-sm,5px);" +
    "color:var(--lumiverse-text-muted,rgba(255,255,255,.65));" +
    "transition:color var(--lumiverse-transition-fast,150ms ease)}" +
    ".arf-msgbtn:hover:not(:disabled){color:var(--lumiverse-text,rgba(255,255,255,.9))}" +
    ".arf-msgbtn:disabled{cursor:default}" +
    ".arf-msgbtn:focus-visible{outline:none;" +
    "box-shadow:0 0 0 2px var(--lumiverse-primary-020,rgba(147,112,219,.2))}" +
    "@keyframes arf-turn{to{transform:rotate(360deg)}}" +
    ".arf-spin{animation:arf-turn 900ms linear infinite;transform-origin:50% 50%}" +
    // A reader who has asked for less movement gets a still icon rather than a
    // spinner, and the button's title still says it is working.
    "@media (prefers-reduced-motion: reduce){.arf-spin{animation:none}}" +
    // ---- saying something is wrong, in the theme's own colours ----
    // Lumiverse has a danger and a success colour and this had been using
    // neither, so a warning read as another muted paragraph. Tinted background,
    // matching edge, text left at full strength so the colour is the signal and
    // not the thing you have to read through.
    ".arf-warn,.arf-bad,.arf-good{display:flex;gap:8px;align-items:flex-start;" +
    "font-size:12px;line-height:1.45;padding:8px 10px;" +
    "border-radius:var(--lumiverse-radius-sm,5px);border:1px solid;" +
    "color:var(--lumiverse-text,rgba(255,255,255,.9))}" +
    ".arf-warn{border-color:var(--lumiverse-warning,#f59e0b);" +
    "background:color-mix(in srgb,var(--lumiverse-warning,#f59e0b) 12%,transparent)}" +
    ".arf-bad{border-color:var(--lumiverse-danger,#ef4444);" +
    "background:color-mix(in srgb,var(--lumiverse-danger,#ef4444) 12%,transparent)}" +
    ".arf-good{border-color:var(--lumiverse-success,#22c55e);" +
    "background:color-mix(in srgb,var(--lumiverse-success,#22c55e) 12%,transparent)}" +
    // The mark at the front of one. A glyph rather than a coloured dot alone,
    // so the line still says which kind it is to somebody who cannot tell the
    // three colours apart.
    ".arf-sign{flex:none;font-weight:700;line-height:1.45}" +
    ".arf-warn .arf-sign{color:var(--lumiverse-warning,#f59e0b)}" +
    ".arf-bad .arf-sign{color:var(--lumiverse-danger,#ef4444)}" +
    ".arf-good .arf-sign{color:var(--lumiverse-success,#22c55e)}" +
    ".arf-bad-ink{color:var(--lumiverse-danger,#ef4444)}" +
    // A button that throws something away. Edged in the danger colour rather
    // than filled with it: filled, it draws the eye to the one control on the
    // panel that should not be pressed by accident.
    ".arf-btn.arf-danger{border-color:var(--lumiverse-danger,#ef4444);" +
    "color:var(--lumiverse-danger,#ef4444);background:transparent}" +
    ".arf-btn.arf-danger:hover:not(:disabled){" +
    "background:color-mix(in srgb,var(--lumiverse-danger,#ef4444) 14%,transparent)}" +
    // ---- anything that is a log, a count or a piece of a prompt ----
    // The host's own monospace, so a timestamp column lines up, a character
    // count reads as a number, and the text of a prompt looks like the thing
    // that gets sent rather than like prose about it.
    ".arf-mono{font-family:var(--lumiverse-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);" +
    "font-variant-numeric:tabular-nums}" +
    ".arf-well.arf-mono{font-size:12px}" +
    ".arf-grow{flex:1;min-width:0}" +
    // ---- a checkbox comfortable under a mouse is too small for a finger ----
    // The width of the screen does not say which is in use. This asks directly.
    "@media (pointer: coarse){" +
    ".arf-btn{min-height:40px;padding:10px 14px}" +
    ".arf-btn.arf-mini{min-height:40px;width:40px;padding:0}" +
    ".arf-fold{min-height:44px}" +
    ".arf-tab{padding:12px 13px}" +
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
  // A line that says something is wrong, or is about to be, or went right.
  // Each carries a glyph as well as a colour, so the three are told apart
  // without relying on being able to tell the three colours apart.
  function notice(kind: "warn" | "bad" | "good", text: string): HTMLElement {
    const box = el("div", "arf-" + kind);
    box.appendChild(el("span", "arf-sign", kind === "good" ? "\u2713" : "!"));
    box.appendChild(el("span", "arf-grow", text));
    return box;
  }
  const warn = (t: string) => notice("warn", t);
  const bad = (t: string) => notice("bad", t);

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

  // A prompt that never shows the model the message is a prompt that cannot do
  // anything, and it is the one mistake the block editor makes possible.
  const noTurn = () =>
    !blockList().some((b) => b.on && String(b.text || "").indexOf(TURN_MACRO) >= 0);

  function statusLine(): { text: string; tone: "off" | "idle" | "busy" } {
    if (!cfg.enabled) return { text: "Off", tone: "off" };
    if (busy) return { text: "Refining a reply", tone: "busy" };
    // Said before the rules, because on the home screen a missing rule is not
    // what is stopping anything.
    if (outsideAnyChat()) return { text: "No chat open", tone: "off" };
    if (chatIsOff(lastChatId)) return { text: "Off in this chat", tone: "off" };
    if (noTurn()) return { text: "The prompt is missing {{message}}", tone: "off" };
    if (lastChatId == null) return { text: "Waiting for a chat", tone: "off" };
    if (cfg.refineOn) return { text: "On, refining every reply", tone: "idle" };
    return { text: "On, waiting for you to press Refine", tone: "idle" };
  }

  // Why the refine button cannot be pressed, or empty when it can. One answer
  // in one place, so the button, its tooltip and the line under it agree.
  function whyNot(): string {
    if (!cfg.enabled) return "Auto Refine is switched off.";
    if (outsideAnyChat()) return "No chat is open. Open one and this comes back.";
    if (lastChatId == null) return "Waiting to be told which chat you are in.";
    if (chatIsOff(lastChatId)) return "Auto Refine is switched off in this chat.";
    if (noTurn())
      return "No block in your prompt has {{message}} in it, so the model would never see the reply. Add it under Prompt.";
    return "";
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
        // From the element itself, not its parent. A filled button's label sits
        // on the button's own colour, and measuring it against the card behind
        // instead is how white-on-lavender passed a contrast check and shipped
        // as an unreadable button.
        const back = backdropOf(n);
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

  // ---- the tabs ----
  // Six boxes, and everything belongs in exactly one of them. The panel was one
  // column with every setting in it, which reads as a wall however carefully
  // each row is written: nothing tells the eye where one subject ends.
  const TABS: Array<{ id: string; label: string }> = [
    { id: "prompt", label: "Prompt" },
    { id: "context", label: "Context" },
    { id: "model", label: "Model" },
    { id: "limits", label: "Limits" },
    { id: "log", label: "Log" },
    { id: "setup", label: "Setup" },
  ];
  const tabNow = () => (TABS.some((t) => t.id === cfg.tab) ? String(cfg.tab) : "prompt");

  // A box with a title. Everything on a tab goes in one of these, so a group of
  // settings has an edge around it rather than being told apart by spacing.
  function card(title?: string, hint?: string, pill?: string): HTMLElement {
    const c = el("div", "arf-card");
    if (title) {
      const h = el("div", "arf-cardh");
      h.appendChild(el("span", "arf-grow", title));
      if (pill) h.appendChild(el("span", "arf-pill", pill));
      c.appendChild(h);
    }
    if (hint) c.appendChild(note(hint));
    return c;
  }

  // Which folds are open, by title, remembered while the page is open.
  const openFolds = new Set<string>();
  function fold(title: string, fill: (body: HTMLElement) => void): HTMLElement {
    const wrap = el("div", "arf-col");
    const open = openFolds.has(title);
    // A real button, so the keyboard and a screen reader get it for free rather
    // than from a role attribute and a keydown handler that has to remember
    // Space as well as Enter.
    const head = document.createElement("button");
    head.type = "button";
    head.className = "arf-fold";
    head.setAttribute("aria-expanded", open ? "true" : "false");
    head.appendChild(el("span", "arf-caret", open ? CARET_OPEN : CARET_SHUT));
    head.appendChild(el("span", "arf-grow", title));
    head.addEventListener("click", () => {
      if (openFolds.has(title)) openFolds.delete(title);
      else openFolds.add(title);
      paint();
    });
    wrap.appendChild(head);
    if (open) {
      const body = el("div", "arf-foldbody");
      fill(body);
      wrap.appendChild(body);
    }
    return wrap;
  }

  function buildTabs(): HTMLElement {
    const strip = el("div", "arf-tabs");
    strip.setAttribute("role", "tablist");
    const here = tabNow();
    for (const t of TABS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "arf-tab";
      b.textContent = t.label;
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", t.id === here ? "true" : "false");
      b.addEventListener("click", () => {
        cfg.tab = t.id;
        persist(true);
        paint();
      });
      strip.appendChild(b);
    }
    return strip;
  }

  function paint() {
    // The buttons on the messages show the same state this panel does, so they
    // are refreshed with it rather than on a timer of their own.
    if (cfg.msgButton && cfg.enabled) sweepMsgButtons();
    if (!tab || !tab.root) return;
    const root = tab.root as HTMLElement;
    // The rule boxes are rebuilt with everything else, so a repaint while
    // somebody is typing would take the cursor with it. Held and put back.
    const focusKey = (document.activeElement as any)?.getAttribute?.("data-arf-field");
    const caret = (document.activeElement as any)?.selectionStart;

    root.innerHTML = "";
    root.className = "arf";
    liveEls = null;

    root.appendChild(buildHeader());
    const back = undoHere();
    if (back.length) root.appendChild(buildLastRefine(back));
    root.appendChild(buildTabs());

    const body = el("div", "arf-body");
    const here = tabNow();
    if (here === "prompt") {
      body.appendChild(buildBlocksCard());
      body.appendChild(buildMacroCard());
      body.appendChild(buildPresetCard());
    } else if (here === "context") {
      body.appendChild(buildContextCard());
      body.appendChild(buildPreviewCard());
      body.appendChild(buildTryCard());
    } else if (here === "model") {
      body.appendChild(buildConnectionCard());
      body.appendChild(buildSamplerCard());
    } else if (here === "limits") {
      body.appendChild(buildProtectCard());
      body.appendChild(buildGuardCard());
      body.appendChild(buildSafetyCard());
    } else if (here === "log") {
      body.appendChild(buildLiveCard());
      body.appendChild(buildActivityCard());
      body.appendChild(buildDebugCard());
    } else {
      body.appendChild(buildChatCard());
      body.appendChild(buildAlertCard());
      body.appendChild(buildReachCard());
      body.appendChild(buildTransferCard());
    }
    root.appendChild(body);

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

  // ---- the control card, which never moves ----
  // Above the tabs, because the switch and the button are what somebody came
  // for, and hunting for the master switch on the tab it happens to live on is
  // the thing that makes a tabbed panel worse than a list.
  function buildHeader(): HTMLElement {
    const wrap = card();
    const top = el("div", "arf-row");
    const mark = el("span", "arf-mark");
    mark.innerHTML = refineIcon();
    const name = el("div", "arf-cardh arf-grow", "Auto Refine");
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
    const words = el("span", "", st.text);
    line.appendChild(dot);
    line.appendChild(words);
    wrap.appendChild(line);
    // Held so the running clock can be written straight into it. Repainting the
    // whole panel once a second to move one number would close every open
    // select and lose the caret in whatever box was being typed in.
    liveEls = { dot: dot, text: words };

    const row = el("div", "arf-row");
    const stop = whyNot();
    const now = button("Refine the latest reply", true);
    now.disabled = busy || !!stop;
    now.style.opacity = now.disabled ? "0.5" : "1";
    now.style.cursor = now.disabled ? "not-allowed" : "pointer";
    if (stop) now.title = stop;
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
    // Why the button is greyed out, said once rather than left to a tooltip
    // nobody sees on a phone. The master switch being off is not written out:
    // the switch is right there saying it.
    if (stop && cfg.enabled) wrap.appendChild(warn(stop));
    if (outsideAnyChat())
      wrap.appendChild(
        note(
          "Refining runs inside a chat. On the home screen or a character page there is nothing to refine yet, so the panel waits here.",
        ),
      );
    return wrap;
  }

  // The heart of the tab. After a refine you want to see what it did to your
  // writing and be able to disagree, and this is that, sitting above the tabs
  // so it is there whichever one you left open.
  type Undo = { chatId: any; messageId: any; before: string; after: string; at: number };

  // Every refine in this chat that can still be put back, newest first. It used
  // to show one, which meant a second refine took away the way back from the
  // first without saying so.
  function buildLastRefine(list: Undo[]): HTMLElement {
    const wrap = card(
      list.length === 1 ? "The last refine" : "Refines you can put back",
      undefined,
      list.length > 1 ? String(list.length) : undefined,
    );
    wrap.setAttribute("data-arf-last", "1");

    for (let i = 0; i < list.length; i++) {
      const one = list[i];
      // The newest is open; the rest are folded, or a busy chat buries the panel
      // under its own history.
      if (i === 0) wrap.appendChild(buildUndoRow(one));
      else
        wrap.appendChild(
          fold(new Date(one.at).toTimeString().slice(0, 5) + " refine", (body) => {
            body.appendChild(buildUndoRow(one));
          }),
        );
    }
    if (list.length > 1) {
      const all = el("div", "arf-row");
      const clear = button("Dismiss them all", false);
      clear.addEventListener("click", () => {
        for (const one of list) undoable.delete(undoKey(one.chatId, one.messageId));
        if (!undoHere().length) setBadge(null);
        paint();
      });
      all.appendChild(clear);
      wrap.appendChild(all);
    }
    return wrap;
  }

  function buildUndoRow(one: Undo): HTMLElement {
    const box = el("div", "arf-col");
    const pane = (title: string, text: string, dim: boolean) => {
      box.appendChild(el("div", "arf-note", title));
      box.appendChild(el("div", "arf-well arf-scroll" + (dim ? " arf-dim" : ""), text));
    };
    pane("Before", one.before, true);
    pane("After", one.after, false);
    const row = el("div", "arf-row");
    const back = button("Put it back", false);
    back.addEventListener("click", () => {
      send({
        type: "undo_refine",
        requestId: newId(),
        chatId: one.chatId,
        messageId: one.messageId,
      });
    });
    const seen = button("Dismiss", false);
    seen.addEventListener("click", () => {
      undoable.delete(undoKey(one.chatId, one.messageId));
      if (!undoHere().length) setBadge(null);
      paint();
    });
    row.appendChild(back);
    row.appendChild(seen);
    box.appendChild(row);
    return box;
  }

  function textBox(key: string, label: string, hint: string, rows: number): HTMLElement {
    const wrap = el("div", "arf-col");
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

  // ---- Prompt ----
  function buildTryCard(): HTMLElement {
    const wrap = card(
      "Try it",
      "Runs one refine on whatever is in the box and shows what comes back. Nothing is written to your chat.",
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
      if (noTurn()) {
        tryResult = {
          ok: false,
          text: "No block in your prompt has {{message}} in it, so there is nothing to rewrite.",
        };
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
        // The effort row appears and goes with this one, so the panel has to be
        // rebuilt rather than just saved.
        if (f.key === "thinkingMode") paint();
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
    if (f.hint) wrap.appendChild(note(f.hint));
    return wrap;
  }

  // ---- Prompt ----
  // The stored list when there is one, the default otherwise, with the two
  // locked blocks put back if a hand-edited or imported file has lost them.
  // Everything that draws or edits the layout goes through here, so a bad
  // stored value cannot take the section down with it.
  // Nothing is forced back into the list any more. A block list is the reader's
  // prompt, and putting a block back into somebody's prompt because this file
  // thinks it belongs there is the wrong kind of help. What a missing piece
  // costs is said out loud instead: no {{message}} anywhere is a warning on the
  // card and a refusal to refine.
  function blockList(): Block[] {
    const raw = Array.isArray(cfg.blocks) ? cfg.blocks : [];
    const list: Block[] = raw
      .filter((b: any) => b && typeof b === "object" && b.id)
      .slice(0, 60)
      .map((b: any) => ({
        id: String(b.id),
        on: b.on !== false,
        role: ROLE_OPTIONS.some((r) => r.value === String(b.role)) ? String(b.role) : "system",
        text: b.text == null ? "" : String(b.text),
        name: b.name == null ? "" : String(b.name),
      }));
    if (!list.length) return DEFAULT_BLOCKS.map((b) => ({ ...b }));
    return list;
  }

  function setBlocks(list: Block[], repaint?: boolean) {
    cfg.blocks = list;
    persist(true);
    if (repaint !== false) paint();
  }

  const blockLabel = (b: Block) => String(b.name || "").trim() || "Untitled block";

  function buildBlocksCard(): HTMLElement {
    const list = blockList();
    const on = list.filter((b) => b.on).length;
    const wrap = card(
      "Your prompt",
      "The refine is one request, and this is it. Blocks are sent top to bottom, and two next to each other with the same role are joined into one message. A block that comes out empty is left out.",
      on + " of " + list.length + " on",
    );
    if (noTurn())
      wrap.appendChild(
        bad("No block has " + TURN_MACRO + " in it, so the model would never see the message it is meant to rewrite. Nothing will be refined until one does."),
      );
    for (let i = 0; i < list.length; i++) wrap.appendChild(buildBlockRow(list, i));

    const acts = el("div", "arf-row");
    const add = button("Add a block", false);
    add.addEventListener("click", () => {
      const next = blockList();
      const made: Block = {
        id: "own-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6),
        name: "New block",
        on: true,
        role: "system",
        text: "<my_rule>\n\n</my_rule>",
      };
      // Above the turn rather than at the end. Anything after the message reads
      // as an instruction about it, which is rarely what a new rule is for.
      const turnAt = next.findIndex((b) => String(b.text || "").indexOf(TURN_MACRO) >= 0);
      next.splice(turnAt < 0 ? next.length : turnAt, 0, made);
      setBlocks(next);
    });
    const reset = button("Back to the default prompt", false);
    reset.className += " arf-danger";
    reset.addEventListener("click", () => {
      setBlocks(DEFAULT_BLOCKS.map((b) => ({ ...b })));
      log("put the prompt back to the default", true);
    });
    acts.appendChild(add);
    acts.appendChild(reset);
    wrap.appendChild(acts);
    return wrap;
  }

  function buildBlockRow(list: Block[], i: number): HTMLElement {
    const b = list[i];
    const holdsTurn = String(b.text || "").indexOf(TURN_MACRO) >= 0;

    const wrap = el("div", "arf-block" + (b.on ? "" : " arf-hushed"));
    wrap.setAttribute("data-arf-block", b.id);
    const top = el("div", "arf-between");

    const left = el("div", "arf-row arf-grow");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "arf-box";
    box.checked = b.on;
    box.setAttribute("aria-label", "Send " + blockLabel(b));
    box.addEventListener("change", () => {
      const next = blockList();
      next[i].on = !!box.checked;
      setBlocks(next);
    });
    left.appendChild(box);

    const nameIn = document.createElement("input");
    nameIn.type = "text";
    nameIn.className = "arf-field arf-grow";
    nameIn.value = b.name || "";
    nameIn.placeholder = "What to call it";
    nameIn.setAttribute("aria-label", "Name for this block");
    nameIn.setAttribute("data-arf-field", "blockname:" + b.id);
    nameIn.addEventListener("change", () => {
      const next = blockList();
      next[i].name = nameIn.value;
      setBlocks(next, false);
    });
    left.appendChild(nameIn);
    top.appendChild(left);

    const moves = el("div", "arf-row");
    const move = (to: number, label: string, sign: string) => {
      const btn = button(sign, false);
      btn.className += " arf-mini";
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
    moves.appendChild(move(i - 1, "Move up", "\u2191"));
    moves.appendChild(move(i + 1, "Move down", "\u2193"));
    top.appendChild(moves);
    wrap.appendChild(top);

    const ta = document.createElement("textarea");
    ta.rows = Math.min(12, Math.max(3, String(b.text || "").split("\n").length + 1));
    ta.className = "arf-field arf-mono";
    ta.value = b.text || "";
    ta.placeholder = "<my_rule>\nWhat you want it to do.\n</my_rule>";
    ta.setAttribute("aria-label", "Text for " + blockLabel(b));
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
      // Rebuilt on the way out, not compared against the state before the edit:
      // the input handler above has already written the new text into cfg, so
      // by the time this runs there is nothing left to compare against. One
      // edit can take {{message}} out of the whole prompt, which changes the
      // warning on this card and greys out the refine button, and both have to
      // be right the moment you leave the box.
      setBlocks(next);
    });
    wrap.appendChild(ta);

    const foot = el("div", "arf-row");
    foot.appendChild(el("span", "arf-note", "Sent as"));
    const sel = document.createElement("select");
    sel.className = "arf-field";
    sel.style.maxWidth = "140px";
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
    foot.appendChild(sel);
    if (holdsTurn) foot.appendChild(el("span", "arf-pill", "holds the turn"));
    const drop = button("Delete", false);
    drop.className += " arf-danger";
    drop.setAttribute("aria-label", "Delete " + blockLabel(b));
    drop.addEventListener("click", () => {
      const next = blockList();
      next.splice(i, 1);
      setBlocks(next);
    });
    foot.appendChild(drop);
    wrap.appendChild(foot);
    return wrap;
  }

  // What a block can say, and who answers it. Worth having on screen rather
  // than in a document: the whole point of the block editor is writing these,
  // and a macro you cannot remember the name of is a macro you do not use.
  function buildMacroCard(): HTMLElement {
    const wrap = card(
      "Macros you can use",
      "Anything in double braces is filled in at the moment of the refine. Tap one to copy it.",
    );
    wrap.appendChild(
      fold("The list", (body) => {
        for (const m of MACROS) {
          const row = el("div", "arf-col");
          const head = el("div", "arf-row");
          const tag = button(m.tag, false);
          tag.className += " arf-mono";
          tag.setAttribute("aria-label", "Copy " + m.tag);
          tag.addEventListener("click", () => {
            copyText(m.tag);
            toast("Copied " + m.tag, true);
          });
          head.appendChild(tag);
          if (!m.ours) head.appendChild(el("span", "arf-pill", "Lumiverse"));
          row.appendChild(head);
          row.appendChild(note(m.what));
          body.appendChild(row);
        }
        body.appendChild(
          note(
            "The ones marked Lumiverse are the host's own, so anything you already use in a character card or a preset works here too. A macro nobody can answer is left as you typed it rather than being blanked.",
          ),
        );
      }),
    );
    return wrap;
  }

  function buildContextCard(): HTMLElement {
    const wrap = card("How much of the chat it sends");
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

  // The request itself, exactly as it goes out. Built by the backend with the
  // same function a real refine uses, so this cannot become a nice description
  // of something the extension does not actually send.
  function buildPreviewCard(): HTMLElement {
    const wrap = card(
      "See what gets sent",
      "Builds the request for the reply you are looking at and shows it, message by message, without calling a model. Nothing is sent and nothing is charged.",
    );
    const row = el("div", "arf-row");
    const go = button(preview ? "Build it again" : "Show me the request", false);
    go.disabled = previewBusy;
    go.style.opacity = previewBusy ? "0.5" : "1";
    go.addEventListener("click", () => {
      previewBusy = true;
      preview = null;
      const id = newId();
      previewWaiting = id;
      send({
        type: "preview_prompt",
        requestId: id,
        chatId: lastChatId,
        messageId: lastMessageId,
      });
      paint();
    });
    row.appendChild(go);
    if (preview) {
      const copy = button("Copy it", false);
      copy.addEventListener("click", () => {
        copyText(previewAsText(preview));
        toast("Copied.", true);
      });
      row.appendChild(copy);
    }
    wrap.appendChild(row);

    if (previewBusy) {
      wrap.appendChild(note("Building..."));
      return wrap;
    }
    if (!preview) return wrap;
    if (!preview.ok) {
      wrap.appendChild(el("div", "arf-well arf-dim", String(preview.why || "It could not be built.")));
      return wrap;
    }

    const msgs = Array.isArray(preview.messages) ? preview.messages : [];
    let chars = 0;
    for (const m of msgs) chars += String((m && m.content) || "").length;
    wrap.appendChild(
      note(
        msgs.length +
          (msgs.length === 1 ? " message, " : " messages, ") +
          chars.toLocaleString() +
          " characters" +
          (preview.real ? "" : ", with a stand-in where your reply would go, since no reply was found on screen"),
      ),
    );
    for (const m of msgs) {
      const one = el("div", "arf-block");
      const head = el("div", "arf-between");
      head.appendChild(el("span", "arf-lab arf-mono", String((m && m.role) || "system")));
      head.appendChild(
        el("span", "arf-pill arf-mono", String((m && m.content) || "").length + " chars"),
      );
      one.appendChild(head);
      one.appendChild(el("div", "arf-well arf-scroll arf-mono", String((m && m.content) || "")));
      wrap.appendChild(one);
    }
    // The rest of the call, which is part of what gets sent and is otherwise
    // spread across two other tabs.
    const extras: string[] = [];
    extras.push(
      "Connection: " +
        (preview.connectionId
          ? (connections.find((c) => c.id === preview.connectionId) || ({} as any)).name ||
            preview.connectionId
          : "the one you are chatting with"),
    );
    extras.push(
      "Thinking: " +
        (!preview.reasoning
          ? "whatever your connection is set to"
          : preview.reasoning.source === "off"
            ? "off"
            : "on, " + String(preview.reasoning.effort || "medium") + " effort"),
    );
    extras.push(
      "Samplers: " +
        (preview.parameters
          ? Object.keys(preview.parameters)
              .map((k) => k + " " + preview.parameters[k])
              .join(", ")
          : "left to the connection"),
    );
    wrap.appendChild(el("div", "arf-well arf-dim arf-mono", extras.join("\n")));
    return wrap;
  }

  function previewAsText(p: any): string {
    const msgs = Array.isArray(p && p.messages) ? p.messages : [];
    return msgs
      .map((m: any) => "[" + String((m && m.role) || "") + "]\n" + String((m && m.content) || ""))
      .join("\n\n");
  }

  // ---- Model ----
  function buildConnectionCard(): HTMLElement {
    const wrap = card(
      "Which model refines",
      "A refine is a second model call on every reply, so these decide what it costs. They default to the cheap answer.",
    );
    for (const f of COST_FIELDS) {
      if (f.needs && cfg.thinkingMode !== f.needs) continue;
      wrap.appendChild(fieldRow(f));
    }
    return wrap;
  }

  function buildSamplerCard(): HTMLElement {
    const set = SAMPLER_FIELDS.filter(
      (s) => cfg.samplers && cfg.samplers[s.id] != null && cfg.samplers[s.id] !== "",
    ).length;
    const wrap = card(
      "Samplers",
      "Left blank, the connection's own preset decides, which is what you want unless you have a reason. Fill one in and it is sent with the refine and only with the refine: your chat is not affected.",
      set ? set + " set" : "all default",
    );
    wrap.appendChild(
      fold("Sampler values", (body) => {
        for (const s of SAMPLER_FIELDS) body.appendChild(samplerRow(s));
        const clear = button("Clear them all", false);
        clear.addEventListener("click", () => {
          cfg.samplers = {};
          persist(true);
          paint();
        });
        const clearRow = el("div", "arf-row");
        clearRow.appendChild(clear);
        body.appendChild(clearRow);
      }),
    );
    return wrap;
  }

  function samplerRow(s: {
    id: string;
    label: string;
    min: number;
    max: number;
    step: string;
    hint: string;
  }): HTMLElement {
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

  // ---- Limits ----
  function buildProtectCard(): HTMLElement {
    const wrap = card(
      "Protecting what is not prose",
      "Ask a model to improve a paragraph and it will happily drop a colour tag, reflow a code block, or decide an image link was a typo. None of that is writing, and none of it is the model's to touch.",
    );
    wrap.appendChild(
      fieldRow({
        key: "protectOn",
        label: "Hide markup from the model",
        type: "bool",
        hint: "On by default. Tags, code and image links are lifted out and stood in for while the model works, then put back exactly as they were. If one does not come back, the rewrite is dropped rather than saved: asking a model to preserve something and checking that it did are different things.",
      }),
    );
    wrap.appendChild(
      fieldRow({
        key: "wrapOutput",
        label: "Ask for the answer in tags",
        type: "bool",
        hint: "On by default. The prompt asks for the rewrite between <refined> and </refined>, and only what is between them is used. A model that adds a sentence of its own around it is then harmless rather than dropped, and a rewrite cut off halfway is caught by the missing closing tag. Switching this off also empties the {{output_format}} macro.",
      }),
    );
    wrap.appendChild(
      fieldRow({
        key: "protectThinking",
        label: "Never send the model's thinking",
        type: "bool",
        hint: "On by default. A reasoning model's working is not your writing, and a rewrite of it would sit in a place nobody looks. It is cut off before the refine and put back after.",
      }),
    );
    if (!cfg.protectOn)
      wrap.appendChild(
        warn("With this off, a rewrite can quietly change or drop any formatting in your replies."),
      );
    return wrap;
  }

  function buildGuardCard(): HTMLElement {
    const wrap = card(
      "What it refuses to save",
      "A model asked to rewrite prose sometimes answers with something else. A rewrite that fails one of these is dropped and the reply is left exactly as it was, and the Log says which one fired.",
    );
    for (const f of LIMIT_FIELDS.filter((f) => f.key === "maxGrowthPct" || f.key === "minShrinkPct"))
      wrap.appendChild(fieldRow(f));
    return wrap;
  }

  function buildSafetyCard(): HTMLElement {
    const wrap = card("Before it writes");
    for (const f of LIMIT_FIELDS.filter(
      (f) => f.key !== "maxGrowthPct" && f.key !== "minShrinkPct" && f.key !== "toast",
    ))
      wrap.appendChild(fieldRow(f));
    return wrap;
  }

  // ---- Log ----
  // What is happening right now, which the panel could not say before: it knew
  // it was busy and nothing else, so a refine that took forty seconds looked
  // the same as one that had quietly failed.
  function buildLiveCard(): HTMLElement {
    const st = statusLine();
    const wrap = card("Right now", undefined, st.tone === "busy" ? "working" : st.text);
    const rows: Array<[string, string]> = [];
    rows.push(["Chat", lastChatId == null ? "none open" : String(lastChatId).slice(0, 8)]);
    rows.push(["Refines saved", String(tally.saved)]);
    rows.push(["Rewrites dropped", String(tally.dropped)]);
    rows.push(["Put back", String(tally.undone)]);
    if (lastRun)
      rows.push([
        "Last refine took",
        (lastRun.ms / 1000).toFixed(1) + "s, " + (lastRun.ok ? "saved" : "dropped"),
      ]);
    for (const [k, v] of rows) {
      const r = el("div", "arf-between");
      r.appendChild(el("span", "arf-note", k));
      r.appendChild(el("span", "arf-lab arf-mono", v));
      wrap.appendChild(r);
    }
    if (drops.size) {
      wrap.appendChild(el("div", "arf-rule"));
      wrap.appendChild(el("div", "arf-note", "Why rewrites were dropped"));
      const seen = Array.from(drops.entries()).sort((a, b) => b[1] - a[1]);
      for (const [why, n] of seen.slice(0, 6)) {
        const r = el("div", "arf-between");
        r.appendChild(el("span", "arf-note arf-grow", why));
        r.appendChild(el("span", "arf-pill arf-mono", String(n)));
        wrap.appendChild(r);
      }
    }
    return wrap;
  }

  function buildActivityCard(): HTMLElement {
    const wrap = card("What it has been doing", undefined, activity.length ? String(activity.length) : undefined);
    if (!activity.length) {
      wrap.appendChild(note("Nothing yet."));
      return wrap;
    }
    for (const a of activity) {
      const row = el("div", "arf-row arf-note arf-mono");
      row.appendChild(el("span", "arf-when", new Date(a.at).toTimeString().slice(0, 8)));
      row.appendChild(el("span", "arf-said arf-grow" + (a.good ? "" : " arf-dim"), a.text));
      wrap.appendChild(row);
    }
    return wrap;
  }

  function buildDebugCard(): HTMLElement {
    const wrap = card(
      "Reporting a problem",
      "Everything somebody would otherwise have to ask you for, in one paste. Your rules and your writing are not in it: it carries settings and counts, not text.",
    );
    const row = el("div", "arf-row");
    const copy = button("Copy debug info", false);
    copy.addEventListener("click", () => {
      copyText(debugText());
      toast("Copied.", true);
      log("copied debug info", true);
    });
    const clear = button("Clear the log", false);
    clear.addEventListener("click", () => {
      activity.length = 0;
      drops.clear();
      tally.saved = 0;
      tally.dropped = 0;
      tally.undone = 0;
      paint();
    });
    row.appendChild(copy);
    row.appendChild(clear);
    wrap.appendChild(row);
    wrap.appendChild(fold("What it says", (body) => {
      body.appendChild(el("div", "arf-well arf-scroll arf-mono", debugText()));
    }));
    return wrap;
  }

  // Settings and counts, never your writing. A bug report should be safe to
  // paste in public, and a rules box can hold anything.
  function debugText(): string {
    const lines: string[] = [];
    lines.push("Auto Refine " + VERSION);
    lines.push("when: " + new Date().toISOString());
    lines.push("");
    lines.push("on: " + (cfg.enabled ? "yes" : "no") + ", automatic: " + (cfg.refineOn ? "yes" : "no"));
    lines.push("chat open: " + (lastChatId == null ? "no" : "yes") + ", off in this chat: " + (chatIsOff(lastChatId) ? "yes" : "no"));
    lines.push("chats switched off: " + chatsOff.length);
    lines.push(
      "rules: " +
        String(cfg.rules || "").length +
        " chars, structure rules: " +
        String(cfg.structureRules || "").length +
        " chars",
    );
    lines.push("connection: " + (cfg.connectionId ? "picked" : "the chat's own") + ", connections seen: " + connections.length);
    lines.push(
      "thinking: " +
        cfg.thinkingMode +
        (cfg.thinkingMode === "custom" ? " (" + cfg.thinkingEffort + ")" : "") +
        ", timeout: " + cfg.timeoutSecs + "s",
    );
    lines.push("run-up messages: " + cfg.contextMessages);
    const list = blockList();
    lines.push("blocks: " + list.map((b) => b.id + (b.on ? "" : "(off)") + ":" + b.role).join(" > "));
    const set = SAMPLER_FIELDS.filter((s) => cfg.samplers && cfg.samplers[s.id] != null && cfg.samplers[s.id] !== "");
    lines.push("samplers: " + (set.length ? set.map((s) => s.id + "=" + cfg.samplers[s.id]).join(", ") : "all default"));
    lines.push(
      "limits: grow " + cfg.maxGrowthPct + "%, shrink " + cfg.minShrinkPct + "%, keep original " +
        (cfg.keepOriginal ? "yes" : "no") + ", ask first " + (cfg.confirmBeforeSave ? "yes" : "no"),
    );
    lines.push("your own messages: " + (cfg.refineUserMessages ? "button may refine them" : "never"));
    lines.push("input bar refine: " + (cfg.inputRefine ? "on" : "off") + ", widget: " + (cfg.widgetOn ? "on" : "off") + ", sound: " + (cfg.soundOn ? "on" : "off"));
    lines.push("");
    lines.push("saved: " + tally.saved + ", dropped: " + tally.dropped + ", put back: " + tally.undone);
    if (lastRun) lines.push("last refine: " + (lastRun.ms / 1000).toFixed(1) + "s, " + (lastRun.ok ? "saved" : "dropped: " + lastRun.why));
    if (drops.size) {
      lines.push("");
      lines.push("drops by reason:");
      for (const [why, n] of Array.from(drops.entries()).sort((a, b) => b[1] - a[1]))
        lines.push("  " + n + "x " + why);
    }
    if (activity.length) {
      lines.push("");
      lines.push("recent:");
      for (const a of activity.slice(0, 12))
        lines.push("  " + new Date(a.at).toTimeString().slice(0, 8) + " " + a.text);
    }
    return lines.join("\n");
  }

  function copyText(text: string) {
    try {
      const nav: any = (globalThis as any).navigator;
      if (nav && nav.clipboard && typeof nav.clipboard.writeText === "function") {
        nav.clipboard.writeText(text).catch(() => fallbackCopy(text));
        return;
      }
    } catch (_) {}
    fallbackCopy(text);
  }

  // For a page without the clipboard API, or one that refuses it because the
  // click was not close enough to a user gesture.
  function fallbackCopy(text: string) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;top:-1000px;left:-1000px;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      try {
        (document as any).execCommand("copy");
      } catch (_) {}
      document.body.removeChild(ta);
    } catch (_) {}
  }

  // ---- Setup ----
  function buildChatCard(): HTMLElement {
    const wrap = card("This chat");
    const top = el("div", "arf-between");
    top.appendChild(el("span", "arf-lab", "Auto Refine here"));
    const known = lastChatId != null;
    const off = chatIsOff(lastChatId);
    const act = button(off ? "Turn on here" : "Turn off here", false);
    act.disabled = !known;
    act.style.opacity = known ? "1" : "0.45";
    act.style.cursor = known ? "pointer" : "not-allowed";
    act.addEventListener("click", () => setChatOff(lastChatId, !off));
    top.appendChild(act);
    wrap.appendChild(top);
    // Which chat, by name where there is one. A chat id is not an answer to
    // "which chat is this", and a card the characters permission was refused
    // for is a different thing from a chat with no card on it.
    if (known) {
      const who = character
        ? "You are in " + character + "'s chat."
        : nameWithheld
          ? "This chat has a character on it. Its name needs the characters permission, which is not granted."
          : "This chat has no character card on it, which is fine: a refine just goes without that block.";
      wrap.appendChild(note(who));
    }
    wrap.appendChild(
      note(
        !known
          ? outsideAnyChat()
            ? "You are not in a chat. Open one and this switch comes back."
            : "Waiting to be told which chat you are in."
          : off
            ? "Auto Refine is switched off in this chat. Every other chat carries on as it is."
            : "Leave one chat completely alone while every other chat carries on.",
      ),
    );
    if (chatsOff.length) {
      const row = el("div", "arf-between");
      row.appendChild(el("span", "arf-note arf-grow", chatsOff.length + " chat" + (chatsOff.length === 1 ? "" : "s") + " switched off"));
      const all = button("Turn them all back on", false);
      all.addEventListener("click", () => {
        chatsOff = [];
        saveChatsOff();
        paint();
      });
      row.appendChild(all);
      wrap.appendChild(row);
    }
    return wrap;
  }

  function buildAlertCard(): HTMLElement {
    const wrap = card("When a refine lands", "How you find out, other than the tab's badge.");
    wrap.appendChild(
      fieldRow({
        key: "toast",
        label: "Show a pop-up",
        type: "bool",
        hint: "On by default. Turn it off if you would rather it worked quietly and you watched this tab instead.",
      }),
    );
    wrap.appendChild(
      fieldRow({
        key: "soundOn",
        label: "Play a sound",
        type: "bool",
        hint: "Off by default. The sound is yours: attach a file or paste a link below. Nothing is shipped with the extension, so this switch on its own is silent.",
      }),
    );
    if (cfg.soundOn) {
      if (!hasSound())
        wrap.appendChild(warn("No sound chosen yet, so nothing will play. Attach a file or paste a link."));

      const attached = /^data:/.test(String(cfg.soundUrl || ""));
      const picker = document.createElement("input");
      picker.type = "file";
      picker.accept = "audio/*";
      picker.style.display = "none";
      picker.addEventListener("change", () => {
        const file = picker.files && picker.files[0];
        picker.value = "";
        if (!file) return;
        if (file.size > SOUND_MAX) {
          soundSaid =
            "That file is " +
            Math.round(file.size / 1024) +
            "KB, over the " +
            Math.round(SOUND_MAX / 1024) +
            "KB limit. A short notification sound is well under it.";
          paint();
          return;
        }
        readFileAsDataUrl(file, (url) => {
          if (!url || !/^data:audio\//.test(url)) {
            soundSaid = "That file could not be read as audio.";
          } else {
            cfg.soundUrl = url;
            persist(true);
            soundSaid = "Attached " + file.name + ".";
          }
          paint();
        });
      });

      const row = el("div", "arf-row");
      const pick = button(attached ? "Attach another file" : "Attach a file", false);
      pick.addEventListener("click", () => {
        try {
          picker.click();
        } catch (_) {
          soundSaid = "The browser would not open a file picker.";
          paint();
        }
      });
      const tryIt = button("Play it", false);
      tryIt.disabled = !hasSound();
      tryIt.style.opacity = hasSound() ? "1" : "0.45";
      tryIt.addEventListener("click", () => {
        soundSaid = null;
        ping(true);
      });
      row.appendChild(pick);
      row.appendChild(tryIt);
      if (hasSound()) {
        const drop = button("Remove it", false);
        drop.addEventListener("click", () => {
          cfg.soundUrl = "";
          persist(true);
          soundSaid = "Removed.";
          paint();
        });
        row.appendChild(drop);
      }
      row.appendChild(picker);
      wrap.appendChild(row);
      wrap.appendChild(
        note(
          "An attached file is held with your settings as text, so it has to be small: " +
            Math.round(SOUND_MAX / 1024) +
            "KB at most. A link is not, and is the better answer for anything bigger.",
        ),
      );

      const link = document.createElement("input");
      link.type = "text";
      link.className = "arf-field";
      link.placeholder = "Or paste a link to a sound";
      link.setAttribute("aria-label", "Link to a sound");
      link.setAttribute("data-arf-field", "soundLink");
      link.value = attached ? "" : String(cfg.soundUrl || "");
      link.addEventListener("change", () => {
        const v = String(link.value || "").trim();
        if (!v) {
          if (!attached) {
            cfg.soundUrl = "";
            persist(true);
            soundSaid = null;
          }
          paint();
          return;
        }
        // Only a link a browser can actually load, and never one that runs
        // something: a sound is fetched, not executed.
        if (!/^https?:\/\//i.test(v) && !/^data:audio\//i.test(v)) {
          soundSaid = "That does not look like a link. It has to start with http:// or https://.";
          paint();
          return;
        }
        cfg.soundUrl = v;
        persist(true);
        soundSaid = "Using that link.";
        paint();
      });
      wrap.appendChild(link);
      if (attached) wrap.appendChild(note("A file is attached. Clear it above to use a link instead."));

      wrap.appendChild(
        fieldRow({
          key: "soundVolume",
          label: "How loud (%)",
          type: "num",
          min: 0,
          max: 100,
          hint: "",
        }),
      );
      if (soundSaid) wrap.appendChild(note(soundSaid));
    }
    return wrap;
  }

  // Ways in other than the drawer. Both are off until asked for, because an
  // extension that adds a floating button and an input bar row on install is
  // one that redecorated somebody's screen without asking.
  function buildReachCard(): HTMLElement {
    const wrap = card("Ways to reach it", "The drawer tab is always there. These are extra.");
    wrap.appendChild(
      fieldRow({
        key: "widgetOn",
        label: "A floating button",
        type: "bool",
        hint: "A small round button over the chat that refines the latest reply in one tap, and can be dragged where you want it. Needs the interface panels permission.",
      }),
    );
    if (cfg.widgetOn && widgetFailed)
      wrap.appendChild(
        bad("The floating button could not be created. Check that the ui_panels permission is granted."),
      );
    wrap.appendChild(
      fieldRow({
        key: "msgButton",
        label: "A button on every message",
        type: "bool",
        hint: "Puts a refine button in each message's own row of actions, next to Edit and Copy. After a refine the same button becomes an undo, so putting one back is where you are already looking.",
      }),
    );
    wrap.appendChild(
      fieldRow({
        key: "inputRefine",
        label: "Refine what I am typing",
        type: "bool",
        hint: "Adds a row to the chat input's Extras menu that rewrites the text sitting in your input box, before you send it. It changes the box you are typing in, so it is off until you ask for it.",
      }),
    );
    if (cfg.inputRefine || cfg.msgButton)
      wrap.appendChild(
        note(
          "These two reach into the page rather than going through an API, because Lumiverse does not offer one for the message row or the input box. They are the only parts of this extension that depend on how Lumiverse is laid out. If an update ever moves either, these stop working and nothing else does.",
        ),
      );
    return wrap;
  }

  // ---- carrying a setup somewhere else ----
  // One file with everything in it: the rules, the layout, the samplers, the
  // lot. Not the chats you switched off, which name chats that do not exist on
  // the machine reading the file.
  function buildTransferCard(): HTMLElement {
    const wrap = card(
      "Your whole setup",
      "A file with your rules, your prompt layout and your sampler settings in it. Importing replaces what you have here, so export first if you want a way back.",
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
    // The other half of the same subject: this card is about your setup as a
    // whole, and throwing it away belongs next to carrying it somewhere.
    buildResetInto(wrap);
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
            text: b.text == null ? "" : String(b.text),
            name: b.name == null ? "" : String(b.name),
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
      } else if (key === "soundUrl") {
        // A sound arrives as a data URL and could be anything. Only audio, and
        // only up to the same cap the picker enforces.
        if (typeof got !== "string") continue;
        cfg.soundUrl = /^data:audio\//.test(got) && got.length <= SOUND_MAX * 2 ? got : "";
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
    syncExtras();
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

  function readFileAsDataUrl(file: any, cb: (url: string | null) => void): void {
    try {
      const reader = new FileReader();
      reader.onload = () => cb(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => cb(null);
      reader.readAsDataURL(file);
    } catch (_) {
      cb(null);
    }
  }

  // ---- presets ----
  // A named copy of the refining setup, so somebody who writes one set of rules
  // for prose and another for dialogue can move between them without keeping
  // both in a text file somewhere.
  type Preset = { name: string; at: number; settings: Record<string, any> };
  let presets: Preset[] = [];
  let presetPick = "";
  let presetName = "";
  let presetSaid: string | null = null;

  // The two that ship with it, offered alongside your own. They are not stored
  // and cannot be renamed or deleted, so they are always there to go back to.
  function builtIn(): Preset[] {
    return BUILT_IN_PROMPTS.map((p) => ({
      name: p.name,
      at: 0,
      settings: { blocks: p.blocks.map((b) => ({ ...b })), thinkingMode: p.thinking },
    }));
  }
  const isBuiltIn = (name: string) => BUILT_IN.indexOf(name) >= 0;
  const allPresets = (): Preset[] => builtIn().concat(presets);

  function loadPresets() {
    try {
      if (typeof localStorage === "undefined") return;
      const raw = localStorage.getItem(PRESETS_KEY);
      const list = raw ? JSON.parse(raw) : [];
      if (Array.isArray(list))
        presets = list
          .filter((x: any) => x && typeof x === "object" && x.name)
          .slice(0, 60)
          .map((x: any) => ({
            name: String(x.name),
            at: Number(x.at) || 0,
            settings: x.settings && typeof x.settings === "object" ? x.settings : {},
          }));
    } catch (_) {
      presets = [];
    }
  }
  loadPresets();

  function savePresets() {
    try {
      if (typeof localStorage !== "undefined")
        localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
    } catch (_) {}
  }

  // Only the keys a preset owns, and each one copied rather than referenced, or
  // editing your rules would quietly edit the preset you saved them from.
  function presetFromNow(): Record<string, any> {
    const out: Record<string, any> = {};
    for (const k of PRESET_KEYS) {
      if (k === "blocks") out.blocks = blockList().map((b) => ({ ...b }));
      else if (k === "samplers") out.samplers = Object.assign({}, cfg.samplers || {});
      else out[k] = cfg[k];
    }
    return out;
  }

  function applyPreset(p: Preset): number {
    let took = 0;
    for (const k of PRESET_KEYS) {
      if (!(k in p.settings)) continue;
      const got = p.settings[k];
      if (k === "blocks") {
        if (!Array.isArray(got)) continue;
        cfg.blocks = got
          .filter((b: any) => b && typeof b === "object" && b.id)
          .slice(0, 40)
          .map((b: any) => ({
            id: String(b.id),
            on: b.on !== false,
            role: ROLE_OPTIONS.some((r) => r.value === String(b.role)) ? String(b.role) : "system",
            text: b.text == null ? "" : String(b.text),
            name: b.name == null ? "" : String(b.name),
          }));
        took++;
      } else if (k === "samplers") {
        if (!got || typeof got !== "object" || Array.isArray(got)) continue;
        const clean: Record<string, number> = {};
        for (const f of SAMPLER_FIELDS) {
          const v = Number(got[f.id]);
          if (got[f.id] === "" || got[f.id] == null || !Number.isFinite(v)) continue;
          clean[f.id] = Math.min(f.max, Math.max(f.min, v));
        }
        cfg.samplers = clean;
        took++;
      } else if (k === "contextMessages") {
        const v = Number(got);
        if (Number.isFinite(v)) {
          cfg.contextMessages = Math.min(40, Math.max(0, Math.round(v)));
          took++;
        }
      } else if (typeof got === "string") {
        cfg[k] = got;
        took++;
      }
    }
    if (took) persist(true);
    return took;
  }

  function buildPresetCard(): HTMLElement {
    const wrap = card(
      "Presets",
      "Four prompts ship with the extension and work as they stand: a short one and a detailed one, each in a version for a plain model and a version for a model that reasons. Saving your own keeps your prompt, your run-up count and your samplers under a name. Everything else stays as you have it, whichever you load. A connection is not saved, since an id from another account names nothing here.",
      presets.length ? presets.length + " yours" : BUILT_IN.length + " built in",
    );

    const sel = document.createElement("select");
    sel.className = "arf-field";
    sel.setAttribute("aria-label", "Saved presets");
    sel.setAttribute("data-arf-field", "presetPick");
    const none = document.createElement("option");
    none.value = "";
    none.textContent = "Pick a preset";
    sel.appendChild(none);
    for (const p of allPresets()) {
      const op = document.createElement("option");
      op.value = p.name;
      op.textContent = p.name;
      sel.appendChild(op);
    }
    sel.value = presetPick;
    sel.addEventListener("change", () => {
      presetPick = sel.value;
      presetName = sel.value;
      presetSaid = null;
      paint();
    });
    wrap.appendChild(sel);

    const nameIn = document.createElement("input");
    nameIn.type = "text";
    nameIn.className = "arf-field";
    nameIn.placeholder = "A name for this setup";
    nameIn.value = presetName;
    nameIn.setAttribute("aria-label", "Preset name");
    nameIn.setAttribute("data-arf-field", "presetName");
    nameIn.addEventListener("input", () => {
      presetName = nameIn.value;
    });
    wrap.appendChild(nameIn);

    const chosen = () => allPresets().find((p) => p.name === presetPick) || null;
    const chosenIsYours = () => !!presetPick && !isBuiltIn(presetPick);
    const row = el("div", "arf-row");

    const load = button("Load", false);
    load.setAttribute("data-arf-preset", "load");
    load.disabled = !chosen();
    load.style.opacity = load.disabled ? "0.45" : "1";
    load.addEventListener("click", () => {
      const p = chosen();
      if (!p) return;
      const took = applyPreset(p);
      presetSaid = took
        ? "Loaded " + p.name + "."
        : "There was nothing in that preset to load.";
      log("loaded the preset " + p.name, true);
      paint();
    });

    const asNew = button("Save as new", false);
    asNew.setAttribute("data-arf-preset", "new");
    asNew.addEventListener("click", () => {
      const name = String(presetName || "").trim();
      if (!name) {
        presetSaid = "Give it a name first.";
        paint();
        return;
      }
      if (isBuiltIn(name)) {
        presetSaid = "That is the name of one of the two that ship with the extension. Pick another.";
        paint();
        return;
      }
      if (presets.some((p) => p.name === name)) {
        presetSaid = "There is already a preset called that. Use Update selected, or pick another name.";
        paint();
        return;
      }
      presets.push({ name: name, at: Date.now(), settings: presetFromNow() });
      presets = presets.slice(-60);
      savePresets();
      presetPick = name;
      presetSaid = "Saved " + name + ".";
      paint();
    });

    const update = button("Update selected", false);
    update.setAttribute("data-arf-preset", "update");
    update.disabled = !chosenIsYours();
    update.style.opacity = update.disabled ? "0.45" : "1";
    update.addEventListener("click", () => {
      const p = chosen();
      if (!p || isBuiltIn(p.name)) return;
      p.settings = presetFromNow();
      p.at = Date.now();
      savePresets();
      presetSaid = "Updated " + p.name + ".";
      paint();
    });

    const rename = button("Rename selected", false);
    rename.setAttribute("data-arf-preset", "rename");
    rename.disabled = !chosenIsYours();
    rename.style.opacity = rename.disabled ? "0.45" : "1";
    rename.addEventListener("click", () => {
      const p = chosen();
      const name = String(presetName || "").trim();
      if (!p || isBuiltIn(p.name)) return;
      if (!name) {
        presetSaid = "Put the new name in the box first.";
        paint();
        return;
      }
      if (name !== p.name && (isBuiltIn(name) || presets.some((x) => x.name === name))) {
        presetSaid = "There is already a preset called that.";
        paint();
        return;
      }
      p.name = name;
      savePresets();
      presetPick = name;
      presetSaid = "Renamed.";
      paint();
    });

    const drop = button("Delete", false);
    drop.className += " arf-danger";
    drop.setAttribute("data-arf-preset", "delete");
    drop.disabled = !chosenIsYours();
    drop.style.opacity = drop.disabled ? "0.45" : "1";
    drop.addEventListener("click", () => {
      const p = chosen();
      if (!p || isBuiltIn(p.name)) return;
      presets = presets.filter((x) => x !== p);
      savePresets();
      presetPick = "";
      presetName = "";
      presetSaid = "Deleted " + p.name + ".";
      paint();
    });

    row.appendChild(load);
    row.appendChild(asNew);
    row.appendChild(update);
    row.appendChild(rename);
    row.appendChild(drop);
    wrap.appendChild(row);
    if (presetPick && isBuiltIn(presetPick)) {
      const which = BUILT_IN_PROMPTS.find((p) => p.name === presetPick);
      if (which) wrap.appendChild(note(which.what));
      wrap.appendChild(
        note(
          "One of the ones that ship with the extension. Load it, change it however you like, then save it under a name of your own.",
        ),
      );
    }
    if (presetSaid) wrap.appendChild(note(presetSaid));
    return wrap;
  }

  // ---- putting everything back ----
  function buildResetInto(wrap: HTMLElement) {
    wrap.appendChild(el("div", "arf-rule"));
    const head = el("div", "arf-row");
    head.appendChild(el("span", "arf-sign arf-bad-ink", "!"));
    head.appendChild(el("span", "arf-lab arf-grow", "Start again"));
    wrap.appendChild(head);
    wrap.appendChild(
      bad(
        "This cannot be undone. Your prompt goes back to the default one, which means every block you wrote and every rule in them is gone. Export first if there is any chance you want it back.",
      ),
    );
    const row = el("div", "arf-row");
    const go = button("Reset all settings", false);
    go.className += " arf-danger";
    go.addEventListener("click", () => resetAll(false));
    const all = button("Reset everything, presets too", false);
    all.className += " arf-danger";
    all.addEventListener("click", () => resetAll(true));
    row.appendChild(go);
    row.appendChild(all);
    wrap.appendChild(row);
    wrap.appendChild(
      note(
        "The first keeps your saved presets, so a prompt you saved is still there afterwards. The second takes those too.",
      ),
    );
    if (resetSaid) wrap.appendChild(resetArmed ? bad(resetSaid) : note(resetSaid));
  }

  let resetSaid: string | null = null;

  async function resetAll(alsoPresets: boolean) {
    // A confirmation, because this is the one control here that throws work
    // away. Everything else on the panel is a switch or a box you can put back.
    const title = alsoPresets ? "Reset everything?" : "Reset all settings?";
    const message = alsoPresets
      ? "Every setting goes back to its default and every saved preset is deleted. There is no undo."
      : "Every setting goes back to its default. Your presets are kept.";
    let yes = false;
    let asked = false;
    try {
      if (ctx.ui && typeof ctx.ui.showConfirm === "function") {
        const answer = await ctx.ui.showConfirm({
          title: title,
          message: message,
          variant: "danger",
          confirmLabel: "Reset",
        });
        asked = true;
        yes = !!(answer && answer.confirmed);
      }
    } catch (_) {
      asked = false;
    }
    if (!asked) {
      // A host with no confirm dialog, or one that refused. Ask in the panel
      // rather than resetting on a single tap, which is the outcome this whole
      // branch exists to prevent.
      if (!resetArmed) {
        resetArmed = true;
        resetSaid =
          "Press it again to confirm. Everything goes back to its default and there is no undo.";
        paint();
        setTimeout(() => {
          if (!resetArmed) return;
          resetArmed = false;
          resetSaid = null;
          paint();
        }, 8000);
        return;
      }
      yes = true;
    }
    if (!yes) {
      resetArmed = false;
      return;
    }
    resetArmed = false;
    // Which tab you were looking at is not a setting anybody means to reset,
    // and putting it back would throw you off the page you pressed the button
    // on, which reads as the panel breaking.
    const here = tabNow();
    for (const k of Object.keys(CONFIG)) cfg[k] = (CONFIG as any)[k];
    cfg.blocks = [];
    cfg.samplers = {};
    cfg.tab = here;
    if (alsoPresets) {
      presets = [];
      presetPick = "";
      presetName = "";
      savePresets();
    }
    preview = null;
    persist(true);
    resetSaid = alsoPresets ? "Everything is back to its defaults." : "Settings are back to their defaults.";
    log("reset the settings", true);
    paint();
  }
  let resetArmed = false;

  // ---- the sound ----
  // The sound is yours: a file you attach or a link you paste. Nothing is
  // shipped and nothing is synthesised, so the switch on its own is not a
  // sound, and the panel says so rather than being silently mute.
  const hasSound = () => !!String(cfg.soundUrl || "").trim();

  function ping(force?: boolean) {
    if (!cfg.soundOn && !force) return;
    const url = String(cfg.soundUrl || "").trim();
    if (!url) return;
    try {
      const vol = Math.min(1, Math.max(0, Number(cfg.soundVolume) / 100));
      const a: any = new (globalThis as any).Audio(url);
      a.volume = Number.isFinite(vol) ? vol : 0.6;
      a.addEventListener("error", () => {
        // A link that does not load, which is worth saying once: a sound that
        // never plays looks exactly like a switch that does not work.
        soundSaid = "That sound could not be played. Check the link, or attach a file instead.";
        if (force) paint();
      });
      const p = a.play();
      // A browser that has not seen a gesture on this page refuses to play.
      // That is a refusal rather than a fault, so it is only reported when you
      // pressed Play yourself and are waiting to hear something.
      if (p && typeof p.catch === "function")
        p.catch((e: any) => {
          if (!force) return;
          soundSaid =
            e && e.name === "NotAllowedError"
              ? "The browser blocked it. Interact with the page once, then try again."
              : "That sound could not be played.";
          paint();
        });
    } catch (_) {
      if (force) {
        soundSaid = "That sound could not be played.";
        paint();
      }
    }
  }

  // ---- refining what you are typing ----
  // The one part of this extension that reaches into the page. Everything else
  // goes through the host's own APIs; there is no API for the input box, so
  // this finds it, and this is what breaks if Lumiverse ever moves it.
  const INPUT_PICKS = [
    'textarea[data-component="ChatInput"]',
    '[data-component="ChatInput"] textarea',
    '[data-component="InputBar"] textarea',
    'form textarea',
    "textarea",
  ];

  function composer(): any | null {
    try {
      for (const pick of INPUT_PICKS) {
        const found = document.querySelectorAll(pick);
        // The last one on the page, since a panel of ours is also a textarea
        // and the chat input is below everything it could be confused with.
        for (let i = found.length - 1; i >= 0; i--) {
          const node: any = found[i];
          if (!node || node.disabled || node.readOnly) continue;
          // Never our own panel, whichever selector found it.
          if (node.closest && node.closest(".arf")) continue;
          const box = node.getBoundingClientRect ? node.getBoundingClientRect() : null;
          if (box && (!box.width || !box.height)) continue;
          return node;
        }
      }
    } catch (_) {}
    return null;
  }

  // Written through the native setter, then announced as an input event. A
  // plain assignment sets the DOM value and leaves the framework holding the
  // old one, so the box shows the new text and sends the old.
  function setComposer(node: any, text: string): boolean {
    try {
      const proto = Object.getPrototypeOf(node);
      const desc = Object.getOwnPropertyDescriptor(proto, "value");
      if (desc && desc.set) desc.set.call(node, text);
      else node.value = text;
      node.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    } catch (_) {
      return false;
    }
  }

  let inputWaiting: string | null = null;
  let inputNode: any = null;
  function refineInput() {
    const node = composer();
    if (!node) {
      toast("Could not find the input box on this page.", true);
      log("could not find the input box");
      return;
    }
    const text = String(node.value || "").trim();
    if (!text) {
      toast("There is nothing in the input box to refine.", true);
      return;
    }
    if (noTurn()) {
      toast("Your prompt has no {{message}} block, so there is nothing to rewrite.", true);
      return;
    }
    if (inputWaiting) return;
    inputNode = node;
    const id = newId();
    inputWaiting = id;
    log("refining what you are typing");
    // The same path the Try it box uses: nothing is saved to the chat, the
    // answer comes back and this puts it in the box. asUser is what tells the
    // model it is looking at the player's own voice.
    send({ type: "try_refine", requestId: id, text: text, asUser: true });
  }

  // ---- a button on each message ----
  // Lumiverse has no API for adding one yet, so this finds the action row and
  // puts a button in it. That makes it the second thing in the extension that
  // depends on the page's shape, and it is off until asked for.
  //
  // Rather than matching a CSS module class, which changes on every build, this
  // looks for the message wrapper by its data attribute and then for the action
  // bar by the one button that has always been in it. If a Lumiverse update
  // moves either, this quietly does nothing instead of throwing on every render.
  const MSG_SEL = "[data-message-id]";
  let msgWatch: any = null;

  function actionBarIn(msg: Element): Element | null {
    const named = msg.querySelector('[data-component="BubbleActions"]');
    if (named) return named;
    // Every layout has an Edit button, and it sits in the row we want.
    const edit = msg.querySelector('button[title="Edit"]');
    return edit && edit.parentElement ? edit.parentElement : null;
  }

  function messageIdOf(msg: Element): string {
    try {
      return String(msg.getAttribute("data-message-id") || "");
    } catch (_) {
      return "";
    }
  }

  // Whether this message has something to put back, which decides whether the
  // button refines or undoes.
  function undoableHere(id: string): boolean {
    if (lastChatId == null) return false;
    return undoable.has(undoKey(lastChatId, id));
  }

  function paintMsgBtn(btn: any, id: string) {
    const busyHere = msgBusy === id;
    const back = undoableHere(id);
    btn.innerHTML = busyHere ? spinIcon() : back ? undoIcon() : refineIcon();
    btn.title = busyHere ? "Refining" : back ? "Put this message back" : "Refine this message";
    btn.setAttribute("aria-label", btn.title);
    btn.disabled = busyHere;
    btn.style.opacity = busyHere ? "0.6" : "1";
  }

  let msgBusy: string | null = null;

  function addMsgButton(msg: Element) {
    try {
      if (!cfg.msgButton || !cfg.enabled) return;
      const id = messageIdOf(msg);
      if (!id) return;
      // Still streaming: the action row is not there yet, and a later pass
      // catches it.
      const part = msg.getAttribute("data-part");
      if (part === "streaming") return;
      const bar = actionBarIn(msg);
      if (!bar) return;
      const had = bar.querySelector("[data-arf-msg]");
      if (had) {
        paintMsgBtn(had, id);
        return;
      }
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("data-arf-msg", id);
      b.className = "arf-msgbtn";
      paintMsgBtn(b, id);
      b.addEventListener("click", (e: any) => {
        try {
          e.preventDefault();
          e.stopPropagation();
        } catch (_) {}
        if (undoableHere(id)) {
          send({ type: "undo_refine", requestId: newId(), chatId: lastChatId, messageId: id });
          return;
        }
        const why = whyNot();
        if (why) {
          toast(why, true);
          return;
        }
        msgBusy = id;
        markBusy(true);
        sweepMsgButtons();
        paint();
        send({ type: "refine_now", requestId: newId(), chatId: lastChatId, messageId: id });
      });
      bar.appendChild(b);
    } catch (_) {}
  }

  function sweepMsgButtons() {
    try {
      const all = document.querySelectorAll(MSG_SEL);
      for (let i = 0; i < all.length; i++) addMsgButton(all[i]);
    } catch (_) {}
  }

  function dropMsgButtons() {
    try {
      const all = document.querySelectorAll("[data-arf-msg]");
      for (let i = 0; i < all.length; i++) all[i].remove();
    } catch (_) {}
  }

  function watchMessages(on: boolean) {
    if (!on) {
      if (msgWatch) {
        try {
          msgWatch.disconnect();
        } catch (_) {}
        msgWatch = null;
      }
      dropMsgButtons();
      return;
    }
    if (msgWatch) {
      sweepMsgButtons();
      return;
    }
    try {
      msgWatch = new MutationObserver(() => sweepMsgButtons());
      msgWatch.observe(document.body, {
        childList: true,
        subtree: true,
        // A message is staged before it streams and the same element flips
        // data-part when streaming ends, with no child change to notice.
        attributes: true,
        attributeFilter: ["data-part"],
      });
      sweepMsgButtons();
    } catch (_) {
      msgWatch = null;
    }
  }
  disposers.push(() => watchMessages(false));

  // ---- the floating button and the input bar row ----
  let widget: any = null;
  let inputAction: any = null;

  function dropWidget() {
    try {
      widget && widget.destroy && widget.destroy();
    } catch (_) {}
    widget = null;
  }

  function raiseWidget() {
    if (widget) return;
    try {
      const d = 44;
      widget = (ctx as any).ui.createFloatWidget({
        width: d,
        height: d,
        initialPosition: { x: 16, y: 140 },
        snapToEdge: true,
        tooltip: "Refine the latest reply",
        chromeless: true,
      });
    } catch (_) {
      // ui_panels is not granted. The extension is fine without it; the button
      // is the only thing missing, and the panel says so rather than the
      // switch silently doing nothing.
      widget = null;
      widgetFailed = true;
      log("could not create the floating button. Check that the ui_panels permission is granted.");
      return;
    }
    widgetFailed = false;
    try {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-label", "Refine the latest reply");
      b.style.cssText =
        "width:100%;height:100%;border-radius:50%;cursor:pointer;display:flex;" +
        "align-items:center;justify-content:center;border:1px solid " +
        "var(--lumiverse-border,rgba(147,112,219,.12));" +
        "background:var(--lumiverse-bg-elevated,rgba(35,30,48,.9));" +
        "color:var(--lumiverse-text,rgba(255,255,255,.9));" +
        "box-shadow:var(--lumiverse-shadow-sm,0 2px 8px rgba(0,0,0,.2))";
      b.innerHTML = refineIcon();
      b.addEventListener("click", () => refineNow());
      widget.root.appendChild(b);
    } catch (_) {}
  }

  function syncExtras() {
    // The floating button.
    if (cfg.widgetOn && cfg.enabled) raiseWidget();
    else dropWidget();

    // The button on each message.
    watchMessages(!!cfg.msgButton && !!cfg.enabled);

    // The Extras row that refines what you are typing.
    const want = !!cfg.inputRefine && !!cfg.enabled;
    if (want && !inputAction) {
      try {
        if (ctx.ui && typeof ctx.ui.registerInputBarAction === "function") {
          inputAction = ctx.ui.registerInputBarAction({
            id: "auto-refine-input",
            label: "Refine what I am typing",
            iconSvg: refineIcon(),
          });
          if (inputAction && typeof inputAction.onClick === "function")
            inputAction.onClick(() => refineInput());
        }
      } catch (_) {
        inputAction = null;
      }
    } else if (!want && inputAction) {
      try {
        inputAction.destroy && inputAction.destroy();
      } catch (_) {}
      inputAction = null;
    }
  }
  disposers.push(() => {
    dropWidget();
    try {
      inputAction && inputAction.destroy && inputAction.destroy();
    } catch (_) {}
    inputAction = null;
  });

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
    const why = whyNot();
    if (why) {
      toast(why, true);
      log("nothing to refine: " + why.toLowerCase().replace(/\.$/, ""));
      return;
    }
    markBusy(true);
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
        // A null id here is the build saying you walked out, which is worth
        // believing: it is the only event that reports it directly.
        if (!p.chatId) leftTheChat();
        else sawChat(p.chatId);
        paint();
      }),
      ctx.events.on("CHAT_SWITCHED", (p: any) => {
        if (!p || typeof p.chatId === "undefined") return;
        if (!p.chatId) leftTheChat();
        else sawChat(p.chatId);
        paint();
      }),
      ctx.events.on("CHARACTER_MESSAGE_RENDERED", (p: any) => {
        if (!p) return;
        sawChat(p.chatId, p.messageId);
        paint();
      }),
      ctx.events.on("USER_MESSAGE_RENDERED", (p: any) => {
        if (!p) return;
        sawChat(p.chatId);
        paint();
      }),
      ctx.events.on("GENERATION_ENDED", (p: any) => {
        if (!p) return;
        sawChat(p.chatId, p.messageId);
        if (cfg.enabled && cfg.refineOn && !p.error && !chatIsOff(p.chatId)) {
          markBusy(true);
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
          if (msg.type === "active_chat") {
            // An answer for a question asked before the last chat change is
            // about a chat nobody is looking at any more.
            if (chatAsk && msg.requestId !== chatAsk) return;
            chatAsk = null;
            if (msg.resolved && !msg.chatId) {
              // It could look, and there is nothing open. The home screen, or a
              // character page with no chat started yet.
              leftTheChat();
              return;
            }
            if (msg.chatId) {
              // A chat the address bar has already moved on from is a stale
              // answer, not news.
              if (urlNamesChats && !urlHolds(msg.chatId)) return;
              sawChat(msg.chatId);
              character = msg.character ? String(msg.character) : null;
              // A chat with a card whose name did not come back is a chat the
              // characters permission was refused for, which is worth telling
              // apart from a chat that has no card.
              nameWithheld = !!msg.hasCharacter && !msg.character;
            }
            paint();
            return;
          }
          if (msg.type === "connections") {
            connections = Array.isArray(msg.list) ? msg.list : [];
            paint();
            return;
          }
          if (msg.type === "refined") {
            markBusy(false);
            msgBusy = null;
            tally.saved++;
            lastRun = { ms: lastRunMs, ok: true, why: "" };
            // A refine only happens in the chat the reader is in, so this is
            // also the chat. Adopted when nothing else has said so yet, or the
            // panel would hold a refine it could not show anybody.
            if (msg.chatId != null && lastChatId == null) lastChatId = msg.chatId;
            if (msg.chatId != null && msg.canUndo)
              {
                const k = undoKey(msg.chatId, msg.messageId);
                undoable.delete(k);
                undoable.set(k, {
                  chatId: msg.chatId,
                  messageId: msg.messageId,
                  before: String(msg.before || ""),
                  after: String(msg.after || ""),
                  at: Date.now(),
                });
                while (undoable.size > UNDO_MAX)
                  undoable.delete(undoable.keys().next().value as string);
              }
            // The badge is the point of the tab being closable: something
            // happened to your writing and you can see that without opening it.
            setBadge(String(undoHere().length || 1));
            log("refined a reply in " + (lastRunMs / 1000).toFixed(1) + "s", true);
            toast("Reply refined.");
            ping();
            paint();
            return;
          }
          if (msg.type === "refine_skipped") {
            markBusy(false);
            msgBusy = null;
            const why = String(msg.why || "no reason given");
            tally.dropped++;
            countDrop(why);
            lastRun = { ms: lastRunMs, ok: false, why: why };
            log("left a reply alone: " + why);
            paint();
            return;
          }
          if (msg.type === "refine_result") {
            markBusy(false);
            msgBusy = null;
            if (msg.ok) {
              lastRun = { ms: lastRunMs, ok: true, why: "" };
              log("refined a reply on request in " + (lastRunMs / 1000).toFixed(1) + "s", true);
              toast("Reply refined.", true);
            } else {
              const why = String(msg.why || "no reason given");
              tally.dropped++;
              countDrop(why);
              lastRun = { ms: lastRunMs, ok: false, why: why };
              log("could not refine: " + why);
              toast("Not refined: " + why, true);
            }
            paint();
            return;
          }
          if (msg.type === "try_result") {
            // The input bar and the Try it box use the same request, so the
            // waiting id is what says where the answer goes.
            if (inputWaiting === msg.requestId) {
              inputWaiting = null;
              const node = inputNode || composer();
              inputNode = null;
              if (!msg.ok) {
                const why = String(msg.why || "no reason given");
                countDrop(why);
                log("did not touch your draft: " + why);
                toast("Left your draft alone: " + why, true);
              } else if (!node) {
                log("the input box went away before the refine came back");
                toast("The input box went away before it came back.", true);
              } else if (setComposer(node, String(msg.after || ""))) {
                log("refined what you were typing", true);
                toast("Your draft was refined.");
                ping();
              } else {
                log("could not write to the input box");
                toast("Could not write to the input box.", true);
              }
              paint();
              return;
            }
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
              if (msg.messageId != null) undoable.delete(undoKey(msg.chatId, msg.messageId));
              if (!undoHere().length) setBadge(null);
              tally.undone++;
              log("put a reply back the way it was", true);
              toast("Put back.", true);
            } else {
              log("could not put it back: " + String(msg.why || "no reason given"));
            }
            paint();
            return;
          }
          if (msg.type === "confirm_refine") {
            markBusy(false);
            askToSave(msg);
            return;
          }
          if (msg.type === "prompt_preview") {
            if (previewWaiting !== msg.requestId) return;
            previewWaiting = null;
            previewBusy = false;
            preview = msg;
            paint();
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
  syncExtras();
  askActiveChat();
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
  MACROS,
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
