/*
 * Auto Refine backend.
 *
 * Takes a finished assistant reply, sends it to a model with the rules you
 * wrote, and saves what comes back over the original. That is the whole idea.
 * Everything else in this file exists because handing your prose to a model and
 * saving whatever it says is a dangerous thing to do casually, and most of the
 * work is in refusing to save the wrong thing.
 *
 * What it will not touch, ever:
 *
 * - The opening greeting. A person wrote that. It is not generated, and no
 *   setting turns this off.
 * - A message in a chat the reader switched off.
 * - A reply while a generation is still running in that chat.
 *
 * What it keeps: the text as it stood before each refine, so the reader can put
 * it back. A rewrite with no way back is the thing that makes people afraid to
 * turn a feature like this on.
 */

declare const spindle: any;
declare function setTimeout(fn: () => void, ms: number): any;
declare function clearTimeout(handle: any): void;

// ---- what the reader set ----
// Mirrors the panel. Everything here arrives over the bridge; nothing is read
// from storage on this side, because the read that would do it runs before any
// user is known and comes back empty.
let masterOn = true;
let refineOn = false;          // the automatic pass, off until asked for
let refineAgain = false;       // whether the pass returns to a reply it refined
let connectionId = '';         // empty means the reader's active connection
let thinkingMode = 'off';      // off | inherit | custom
let thinkingEffort = 'medium'; // only read when thinkingMode is custom
let timeoutSecs = 90;
// Who these settings came from, which is who the automatic pass runs as.
//
// A generation event carries the generation, the chat, the message, the content
// and the error. It has never carried an account and there is no build where it
// does. An install scoped to an operator refuses a model call that carries no
// account, so the automatic pass asked for a refine nobody was paying for and
// came back saying Lumiverse could not tell whose it was. The panel's own
// messages do carry an account, so the one that handed these settings over is
// the one whose rules are running, and it is the only account there is to use.
//
// One value, like the settings above it: this module holds one set of rules for
// the process, so on a server with several accounts the automatic pass belongs
// to whichever panel loaded last. Pressing the button is unaffected, since that
// message carries its own account.
let settingsUser: string | undefined;

// How the request is put together: which blocks go in, in what order, and what
// role each one is sent as. The reader owns this, which is the point of it
// being a list rather than a hardcoded prompt.
let blocks: Block[] = [];
// How much of the chat to show the model as context, in messages. The refine
// sees the message it is rewriting either way; this is what came before it.
let contextMessages = 4;
// Sampler values for the refine call, sent as parameters. Empty means the
// connection's own preset decides, which is the right default: a reader who
// has not asked for a temperature should get the one they already tuned.
let samplers: Record<string, any> = {};
let maxGrowthPct = 60;         // how much longer a refine may make a reply
let minShrinkPct = 40;         // and how much shorter before it looks wrong
// The smallest allowance each limit will give, in characters. Refining one
// sentence means judging a rewrite of a few words, where a percentage of the
// original is too small a number to write in.
//
// The two are not the same number because the two risks are not the same. A
// short passage coming back longer is ordinary: "it was fine" becoming "it
// seemed all right to him" is the rewrite working. A short passage coming back
// much shorter is a model answering with a stub, and the room for that has to
// stay tight or the check stops catching it. Set too high, a reply losing most
// of its writing reads as within the allowance, which is the check gone.
const GROW_FLOOR = 40;
const SHRINK_FLOOR = 16;
let keepOriginal = true;
let confirmBeforeSave = false;
let chatsOff = new Set<string>();

// Chats with a generation in flight. A reply is not refined while the next one
// is already being written: the rewrite would land under the reader mid-scene,
// and on some builds the save races the new message.
const generating = new Set<string>();

// The text each message had before the refine that changed it, so it can go
// back. Held in memory only, and capped, since this is a convenience rather
// than a record: the extension does not keep your writing after a reload.
// swipeAt is the index the refine was added at, when it was added as a reroll
// rather than written over the reply. Put it back then means taking that reroll
// off again and going back to the one before it, not writing the original over
// the top of it: a write would leave two rerolls saying the same thing and no
// way to tell which was which.
const before = new Map<string, { text: string; at: number; swipeAt?: number }>();
const BEFORE_MAX = 30;

// Messages this run has already refined, each against a mark of the text the
// refine left in it. Whether that stops a later one is the reader's to say, in
// Refine a reply that has been refined before.
//
// The mark, and not the id on its own. A swipe, a regenerate and a delete all
// write new text into the same message id, so an id alone says "refined" about
// a reply nobody has refined yet, and the automatic pass walks past every reply
// Auto Retry re-rolled. Comparing the mark asks the question that was meant:
// is this still the refine, or is it something new sitting where the refine
// was.
const refined = new Map<string, string>();
const REFINED_MAX = 400;

// A short stand-in for a piece of text, for telling two apart rather than for
// hiding one. Length first, since two rewrites of the same passage rarely land
// on the same length, then a rolling hash over the characters for the rest.
// Kept instead of the text itself: four hundred replies held whole is the chat
// twice over in memory, for a question a dozen characters can answer.
function markOf(text: any): string {
  const s = String(text == null ? '' : text);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return s.length + ':' + h.toString(36);
}

// Generations this run has already answered. A build that reports one
// generation as ended twice would otherwise hand the same reply over again and
// drift it further, and that holds whatever the setting above says: two events
// for one generation are one reply, not two. Kept apart from the message ids
// because a swipe is a second generation on the same message, and that really
// is a new reply.
const answered = new Set<string>();
const ANSWERED_MAX = 400;

// How many times the automatic pass has refined one message, whatever the text
// was each time. The content mark decides whether a reply is new writing, and
// it answers that question correctly: a swipe really is a different reply and
// really does deserve a refine. What it cannot see is a loop.
//
// One message being refined twenty times means something is cycling: another
// extension rewriting what this one wrote, a build re-announcing generations,
// or a chat somebody is swiping through fast enough that every arrival is new.
// None of those is worth twenty model calls, and the reader is paying for all
// of them. The ceiling is per message and lasts as long as the process does.
const passes = new Map<string, number>();
const PASSES_MAX = 400;
// Deliberately well above what any reader does by hand. This is not a budget,
// it is a stop on something that has gone wrong, and it has to sit far enough
// out that nobody meets it while using the extension normally.
const PASS_CEILING = 12;

// Writes this module made, so the edit event they raise is not mistaken for
// somebody else editing the reply.
const ourWrites = new Map<string, string>();
const OURS_MAX = 200;

const key = (c: any, m: any) => String(c) + ':' + String(m);

function remember<T>(map: Map<string, T>, k: string, v: T, cap: number) {
  map.set(k, v);
  while (map.size > cap) map.delete(map.keys().next().value as string);
}
function note(set: Set<string>, v: string, cap: number) {
  set.add(v);
  while (set.size > cap) set.delete(set.values().next().value as string);
}

// ---- storage that follows the account ----
// Settings belong to the account, not to the browser. Kept only in the browser,
// opening Lumiverse on a different one, or a different machine, presents a
// fresh install: every rule, preset and sampler gone.
//
// One backend process can serve every account on a server, and spindle.storage
// resolves to a single shared directory in that case, so writing through it
// would pool one reader's prompts where another reader could read them back.
// userStorage always resolves per user. On an ordinary single user install the
// id is inferred and this behaves exactly as the shared store did.
const SETTINGS_FILE = 'settings.json';
const PRESETS_FILE = 'presets.json';
// Named sets of the Model tab. Kept apart from presets because they are a
// different thing to want: which model runs the refine, rather than how it
// reads.
const SETUPS_FILE = 'setups.json';

function hasUserStorage(): boolean {
  try {
    return !!(spindle.userStorage && typeof spindle.userStorage.getJson === 'function');
  } catch (_) {
    return false;
  }
}

// Reads this user's copy. On the first read after upgrading, anything left in
// the old shared store is carried up rather than presenting empty settings to
// somebody who had them a minute ago.
async function readUserJson(file: string, userId?: string): Promise<any> {
  if (hasUserStorage()) {
    try {
      const v = await spindle.userStorage.getJson(file, { fallback: null, userId: userId });
      if (v != null) return v;
    } catch (_) { /* fall through to the old store */ }
    let legacy: any = null;
    try { legacy = JSON.parse(await spindle.storage.read(file)); } catch (_) { legacy = null; }
    if (legacy != null) {
      try { await spindle.userStorage.setJson(file, legacy, { userId: userId }); } catch (_) {}
    }
    return legacy;
  }
  try { return JSON.parse(await spindle.storage.read(file)); } catch (_) { return null; }
}

async function writeUserJson(file: string, value: any, userId?: string): Promise<void> {
  if (hasUserStorage()) {
    try {
      await spindle.userStorage.setJson(file, value, { userId: userId });
      return;
    } catch (_) { /* fall through, so a save is never silently lost */ }
  }
  await spindle.storage.write(file, JSON.stringify(value));
}

// Replying with no userId broadcasts to every connected reader on an operator
// scoped install, so every reply carries the id of whoever asked. A user scoped
// install ignores the argument.
function replyTo(userId: string | undefined, msg: any) {
  try {
    if (userId) spindle.sendToFrontend(msg, userId);
    else spindle.sendToFrontend(msg);
  } catch (_) {}
}

// Progress, which is never worth failing a refine over.
function tell(userId: string | undefined, msg: any) {
  try {
    replyTo(userId, msg);
  } catch (_) {}
}

function say(level: 'info' | 'warn', text: string) {
  try { spindle.log[level]('auto-refine: ' + text); } catch (_) {}
}

// ---- putting the request together ----
// The whole prompt is a list of blocks the reader wrote. Not a fixed prompt
// with a rules box bolted on: a prompt is the thing that decides what a refine
// does, so it is the thing to be able to edit, reorder and switch off.
//
// A block is a name, a role, and text. What makes the text worth anything is
// the macros in it, which are filled in at the moment of the refine.
//
// Two passes, because there are two kinds of macro:
//
//   1. Ours. The turn being refined, the run-up, the lorebook, whose message it
//      is. Nobody else knows these: they are about this refine, not this chat.
//   2. The host's, through spindle.macros.resolve. Character fields, the
//      persona, variables, the date. Lumiverse already resolves these for every
//      other prompt it builds, and a second implementation here would drift
//      from the one the chat itself uses.
//
// A block whose text comes out empty is left out rather than sent blank, so a
// chat with no lorebook does not send an empty <world> tag.

const ROLES = ['system', 'user', 'assistant'];

// The macro every prompt needs. Without it somewhere in the list, the model is
// never shown the thing it is meant to be rewriting, so the refine is refused
// rather than sent and quietly wasted.
const TURN_MACRO = '{{message}}';
// The three whose answers cost a call to the host. Named here so the check that
// decides whether to make that call and the resolver that answers it cannot
// drift into using different spellings of the same macro.
const HISTORY_MACRO = '{{history}}';
const LORE_MACRO = '{{lore}}';
const MEMORY_MACRO = '{{memories}}';
const OVERUSED_MACRO = '{{overused}}';

// Ours, and what each one says when there is nothing to put there. Empty means
// the block holding it collapses, which is what makes an unused block harmless
// rather than a stray heading in the prompt.
// A macro earns its place by carrying something only this extension can answer:
// the turn, the run-up, the lorebook, or a note that has to match machinery
// running elsewhere in the refine. Asking for the answer in tags is none of
// those. It is a sentence, it belongs to whoever wrote the prompt, and hiding it
// behind a macro meant it could not be reworded, moved, or asked to report what
// it changed. It is written out in the default prompt instead, where it can be
// edited like any other line.
const OURS = ['message', 'history', 'lore', 'memories', 'protect_notes', 'whole_reply', 'overused'];

interface Scene {
  character: string;
  context: string;
  lore: string;
  memory: string;
  name: string;
  chatId?: string;
  characterId?: string;
  // Only set when something was actually shielded, so a message with no markup
  // in it does not carry an instruction about tokens that are not there.
  shieldNote?: string;
  // Phrases this chat has worn out, one per line. Read from replies already in
  // hand, so it costs no call.
  worn?: string;
  // The whole reply with the selected part marked, set only when a refine was
  // asked for on a selection rather than on the message. Empty on every other
  // refine, which leaves the block carrying it out of the prompt entirely.
  wholeReply?: string;
}
const NO_SCENE: Scene = { character: '', context: '', lore: '', memory: '', name: '' };

interface Block {
  id: string;
  name?: string;
  on: boolean;
  role: string;
  text?: string;
}

// The prompt a fresh install ships with, and the one people copy to write their
// own. Second person throughout, because that is who the model is being spoken
// to as, and XML tags as headings with a closing tag at the end, because a
// model reads a tagged block as one instruction rather than as a paragraph that
// blurs into the next one.
// Reasoning models are told where to put their working. Sent as its own block
// so somebody who never turns thinking on never carries the instruction.
// Asking for the answer inside a tag, rather than asking for the answer on its
// own. A model that cannot help adding "Here is the rewritten message" still
// puts the rewrite between the tags, and taking what is between them is exact
// where reading around a preamble is guesswork.
let wrapOutput = true;
// The working so far, out of a half-written answer, without the tags around
// it. Only what is inside REFINE_NOTES, so a prompt that does not ask for
// working sends nothing at all and costs nothing.
//
// The end of it, because that is where the writing is happening, and capped so
// a model that thinks at length cannot turn this into the traffic the whole
// answer would have been.
const NOTES_TAIL = 2000;
function workingSoFar(text: string): string {
  const t = String(text || '');
  const open = /<\s*refine_notes\s*>/i.exec(t);
  if (!open) return '';
  const rest = t.slice(open.index + open[0].length);
  const close = /<\s*\/\s*refine_notes\s*>/i.exec(rest);
  const said = (close ? rest.slice(0, close.index) : rest).trim();
  return said.length > NOTES_TAIL ? said.slice(-NOTES_TAIL) : said;
}

// Whether to stream the refine so the panel can show it arriving. The answer is
// the same either way; this only decides whether anybody can watch it.
let streamProgress = true;
// Shouted, and matched case-insensitively below so a prompt written before this
// still works. A model skimming a long prompt for the shape of the answer finds
// a run of capitals before it finds a word, and this is the one thing in the
// prompt that has to be got exactly right.
const OUT_TAG = 'REFINED';

// Greedy on purpose. A rewrite can legitimately contain the closing tag as
// text, and the last one is the end of the answer.
const OUT_RE = new RegExp('<' + OUT_TAG + '[^>]*>([\\s\\S]*)<\\/' + OUT_TAG + '>', 'i');
const OUT_OPEN = new RegExp('<' + OUT_TAG + '[^>]*>', 'i');

// What the model actually meant to hand back. When the tags are there this is
// exact, and every check downstream then runs on the rewrite rather than on the
// rewrite plus whatever was said around it.
// outside is whatever the model wrote around the tags. It is never saved into
// the chat. A prompt is free to ask for a note on what was cut and what was
// left alone, and that note lands here, so it is carried back to the panel to
// be shown rather than dropped unread.
//
// The rewrite itself is left out of it. That is on the same card already,
// marked against what it replaced, so sending it a second time would be sending
// it twice. Capped, since a long reasoning answer is not worth pushing across
// the bridge in full.
//
// Nothing downstream reads this but the panel.
const NOTES_MAX = 20000;
function unwrapOutput(answer: string): { text: string; tagged: boolean; outside: string } {
  const hit = OUT_RE.exec(answer);
  if (hit && typeof hit[1] === 'string') {
    const around = (answer.slice(0, hit.index) + '\n' + answer.slice(hit.index + hit[0].length)).trim();
    return {
      text: hit[1].trim(),
      tagged: true,
      outside: around.length > NOTES_MAX ? around.slice(0, NOTES_MAX) : around,
    };
  }
  // An opening tag with nothing closing it: the answer was cut off mid-write.
  if (OUT_OPEN.test(answer)) return { text: '', tagged: true, outside: '' };
  return { text: answer, tagged: false, outside: '' };
}

// Your own messages get their own prompt. Refining what a character wrote and
// refining what you wrote are different jobs: one is polishing somebody else's
// prose, the other is tidying your own without turning it into the narrator's.
// One prompt doing both ends up hedged enough to do neither well.
//
// Empty means you have not written one, and the reply prompt is used instead,
// which is what it did before this existed.
let userBlocks: Block[] = [];

// The blocks as they will actually be sent. There is one prompt and the panel
// owns it: a copy kept here to fall back on was a second prompt nobody could
// see, and it had already drifted four blocks and an opening paragraph away
// from the one on the screen. A refine that ran on it would have said it used
// your prompt and used something else, including without the block that keeps
// markup out of the model's reach.
//
// Empty until the settings arrive, which is a window rather than a state: the
// refine is refused for that moment and says so, and the next one runs.
function activeBlocks(isUser?: boolean): Block[] {
  if (isUser && Array.isArray(userBlocks) && userBlocks.length) return userBlocks.slice();
  return Array.isArray(blocks) ? blocks.slice() : [];
}

// Whether the prompt shows the model the thing it is meant to rewrite. Asked
// before any model is called, so a prompt that could not possibly work is
// refused rather than paid for.
function promptHasTurn(isUser?: boolean): boolean {
  return promptWants(TURN_MACRO, isUser);
}

// Whether any block that is actually being sent asks for this. What a block
// that is switched off wants is nothing, since it is not sent.
//
// Read before the reads themselves. The lorebook, the memory and the card each
// cost a call to the host, and a block switched off was still paying for one:
// switching the memory block off left every refine retrieving the chat's memory
// and throwing it away. A macro nobody is going to see is a call nobody has to
// make.
function promptWants(macro: string, isUser?: boolean): boolean {
  for (const b of activeBlocks(isUser)) {
    if (!b || b.on === false) continue;
    if (String(b.text || '').indexOf(macro) >= 0) return true;
  }
  return false;
}

// ---- protecting what is not prose ----
// A rewrite is far more destructive than a word swap. Ask a model to improve a
// paragraph and it will happily drop a <font color> tag, reflow a code block,
// or decide an image link was a typo. None of that is prose and none of it is
// the model's to touch.
//
// So it never sees it. Each run of markup is lifted out and replaced with a
// short token, the model is told the tokens must come back untouched, and the
// real text is put back afterwards. What makes this worth having rather than
// hopeful is the last step: if a token did not come back, the rewrite is
// dropped. Asking a model to preserve something and checking that it did are
// different things, and only the second one is a guarantee.
let protectOn = true;
let protectThinking = true;
// Hiding <i> and <b> as well. Off, because a sentence with holes in it is
// harder to rewrite well than one with a couple of tags the model can read
// around, and the prompt already tells it to leave them alone.
let protectInline = false;

// Short, ASCII, and shaped like nothing in prose, so a model treats it as an
// opaque handle rather than as something to correct. Numbered rather than
// hashed: a reader looking at the preview should be able to count them.
const TOKEN = (n: number) => '[[AR' + n + ']]';
const TOKEN_ANY = /\[\[AR(\d+)\]\]/g;
// A token and nothing else. The rules below run one after another over text
// that already has tokens in it, and one of them is for wiki-style brackets,
// which is the exact shape of a token. So the shield ate its own work: a reply
// with a single piece of inline code came out with that code hidden as [[AR1]],
// the bracket rule then hid [[AR1]] as [[AR2]], and a model that copied every
// token back perfectly still had the refine turned down for dropping one piece
// of formatting. Every model, every time, on any reply carrying code, a link,
// an image or a comment.
const TOKEN_ONLY = /^\[\[AR\d+\]\]$/;

// Two kinds of markup, and they need opposite treatment.
//
// Anything opaque comes out: code, images, links, comments, and any tag
// carrying attributes, because a colour or an href is exactly what a rewrite
// mangles and none of it is prose.
//
// Bare inline formatting stays in. <i>, <b> and the rest wrap words mid
// sentence, and replacing them with tokens leaves the model reading a sentence
// with holes in it. It reads around them instead, and the prompt tells it to
// leave them alone. Hiding those was making the rewrite worse to protect
// something the model was never likely to break.
const INLINE_OK = /^<\/?(?:i|b|em|strong|u|s|small|sub|sup|mark|q|code)>$/i;

const GUARDED: RegExp[] = [
  /```[\s\S]*?```/g,                     // fenced code
  /~~~[\s\S]*?~~~/g,                     // the other fence some cards use
  // Braces are on purpose left alone. A macro in a reply is already safe,
  // because ours are filled in after the host's pass, so it reaches the model
  // as the characters somebody typed. Hiding it as well would take a visible
  // thing out of the prose for no gain, and anyone who wants it hidden can add
  // the pattern themselves.
  /`[^`\n]+`/g,                           // inline code
  /!\[[^\]]*\]\([^)]*\)/g,                 // an image
  /\[[^\]]*\]\([^)\s]+\)/g,                 // a link, target and all
  /<!--[\s\S]*?-->/g,                     // a comment
  /\[\[[^\]\n]{1,120}\]\]/g,               // wiki-style brackets
  /【[^】\n]{0,200}】/g,                    // the bracket a lot of trackers use
  /\|\|[^|\n]{1,200}\|\|/g,                 // a spoiler bar
  /^[ \t]*\|.*\|[ \t]*$/gm,               // a table row, which is a grid and not prose
  /&[a-zA-Z]{2,10};|&#\d{1,5};/g,         // an HTML entity, which models like to "fix"
  /\bhttps?:\/\/[^\s<>"')\]]+/g,           // a bare URL
  /<\/?[a-zA-Z][^<>]*>/g,                 // every other tag, checked below
];

// Extra patterns the reader wrote, and patterns that keep a region visible even
// when one of the above matched it.
//
// Added to the built-in list instead of replacing it. Replacing is how somebody
// ends up with one pattern of their own and none of the defaults, and finds out
// when a rewrite eats a code block. What is missing here is almost always one
// more shape, not a different set.
let shieldAdd: RegExp[] = [];
let shieldKeep: RegExp[] = [];

// Compiled here so a bad pattern is caught once, at the moment it is saved,
// instead of throwing on every refine. Anything that matches the empty string
// is dropped: it would match at every position and turn the message into
// tokens.
function makePatterns(raw: any, cap: number): { list: RegExp[]; bad: string[] } {
  const list: RegExp[] = [];
  const bad: string[] = [];
  for (const line of String(raw == null ? '' : raw).split(/\n/)) {
    const src = line.trim();
    if (!src) continue;
    if (list.length >= cap) break;
    if (src.length > 400) {
      bad.push(src.slice(0, 40) + ' (too long)');
      continue;
    }
    let re: RegExp;
    try {
      re = new RegExp(src, 'gi');
    } catch (e: any) {
      bad.push(src.slice(0, 40) + ' (' + ((e && e.message) || 'not a pattern') + ')');
      continue;
    }
    try {
      re.lastIndex = 0;
      const hit = re.exec('');
      if (hit && hit[0] === '') {
        bad.push(src.slice(0, 40) + ' (matches nothing, so it would match everywhere)');
        continue;
      }
    } catch (_) {}
    re.lastIndex = 0;
    list.push(re);
  }
  return { list: list, bad: bad };
}

interface Shield {
  text: string;
  parts: string[];
}

// Whether a match is one the reader asked to keep visible. An exclude pattern
// wins over every include, which is what makes it useful: the built-in tag rule
// is broad on purpose, and this is how somebody narrows it without losing it.
function keptVisible(hit: string): boolean {
  for (const re of shieldKeep) {
    try {
      re.lastIndex = 0;
      if (re.test(hit)) return true;
    } catch (_) {}
  }
  return false;
}

function shield(text: string): Shield {
  if (!protectOn) return { text: text, parts: [] };
  const parts: string[] = [];
  let out = text;
  // The reader's own go first. A pattern written for a particular card is more
  // specific than the general rules, and whichever matches first owns the
  // region, so specific before general is the order that does what was meant.
  for (const rule of shieldAdd.concat(GUARDED)) {
    out = out.replace(rule, (hit) => {
      // Never a token this function put there a moment ago.
      if (TOKEN_ONLY.test(hit)) return hit;
      // Bare inline formatting is left where it is, unless the reader asked
      // for it to be hidden too.
      if (!protectInline && INLINE_OK.test(hit)) return hit;
      if (keptVisible(hit)) return hit;
      // A cap, so a message that is mostly markup does not turn into a wall of
      // tokens the model cannot read around.
      if (parts.length >= 60) return hit;
      parts.push(hit);
      return TOKEN(parts.length);
    });
  }
  return { text: out, parts: parts };
}

// Puts the real text back, and says which tokens never came home. A missing one
// means the model deleted or rewrote something it was told to leave alone, and
// that rewrite is not safe to save.
function unshield(text: string, parts: string[]): { text: string; lost: number[] } {
  if (!parts.length) return { text: text, lost: [] };
  const seen = new Set<number>();
  let out = text;
  // Round after round, not one pass. A rule can match a region that already has
  // a token in it, a table row being the everyday case, which puts that token
  // inside the part rather than in the text. One pass would put the region back
  // with [[AR1]] still sitting in it as visible characters, and then report the
  // piece it just restored as missing. A part can only ever hold a token
  // numbered below its own, since that token was put there first, so this walks
  // down and stops.
  for (let round = 0; round <= parts.length; round++) {
    let moved = false;
    out = out.replace(TOKEN_ANY, (whole, n) => {
      const at = Number(n);
      if (!(at >= 1 && at <= parts.length)) return whole;
      seen.add(at);
      moved = true;
      return parts[at - 1];
    });
    if (!moved) break;
  }
  const lost: number[] = [];
  for (let i = 1; i <= parts.length; i++) if (!seen.has(i)) lost.push(i);
  return { text: out, lost: lost };
}

const SHIELD_NOTE =
  'Parts of this passage have been replaced with tokens shaped like [[AR1]], ' +
  '[[AR2]] and so on. Each stands in for formatting that has to survive the ' +
  'edit exactly as it is. Copy every one into your answer unchanged and in the ' +
  'same place, treating each as a single character you cannot spell.';

// The model's own working, which is not prose and is not the reader's writing.
// It is cut off before the refine and put back afterwards, so a rewrite can
// never quietly edit what a model worked out in a place nobody would check.
const THINK_TAGS = [
  'think',
  'thinking',
  'thought',
  'thoughts',
  'reasoning',
  'reflection',
  'scratchpad',
  'analysis',
];

// Names the reader added, because no built-in list can cover every model. A
// name here is not cosmetic: a reasoning block this fails to recognise is
// handed to the refiner as prose, rewritten, and saved into the chat in place
// of the reply. Getting it wrong loses somebody's writing rather than just
// missing a check.
let extraThinkTags: string[] = [];

function thinkNames(): string[] {
  return THINK_TAGS.concat(extraThinkTags);
}

// Anything that would change what the pattern means is dropped rather than
// escaped, since a tag name is letters, digits, underscores and hyphens and
// nothing else. A reader pasting "<think>" gets the name out of it.
function cleanTagName(raw: string): string {
  return String(raw == null ? '' : raw)
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 40);
}

function setThinkTags(raw: any): void {
  const lines = String(raw == null ? '' : raw).split(/[\n,]/);
  const out: string[] = [];
  for (const line of lines) {
    const name = cleanTagName(line);
    if (!name) continue;
    const low = name.toLowerCase();
    if (THINK_TAGS.indexOf(low) >= 0) continue;
    if (out.indexOf(low) >= 0) continue;
    out.push(low);
    if (out.length >= 20) break;
  }
  extraThinkTags = out;
}

// The four shapes a model wraps its working in. Built per call from the current
// list rather than once at load, because the reader can add a name at any time.
function thinkWraps(): RegExp[] {
  const alt = thinkNames().join('|');
  return [
    // <think> ... </think>, attributes allowed on the opener.
    new RegExp('^\\s*<(' + alt + ')(?:\\s[^>]*)?>[\\s\\S]*?<\\/\\1\\s*>\\s*', 'i'),
    // [thinking] ... [/thinking]
    new RegExp('^\\s*\\[(' + alt + ')(?:\\s[^\\]]*)?\\][\\s\\S]*?\\[\\/\\1\\s*\\]\\s*', 'i'),
    // <|think|> ... <|/think|>, and the variants that put the pipe the other
    // way round. Builds disagree about which way it goes, so either closes
    // either.
    new RegExp('^\\s*<\\|(?:' + alt + ')\\|?>[\\s\\S]*?<\\|?\\/?(?:' + alt + ')\\|?>\\s*', 'i'),
    // The named pair some builds use instead of a tag name.
    /^\s*<\|begin_of_thought\|>[\s\S]*?<\|end_of_thought\|>\s*/i,
  ];
}

// The same wrappers, taken out of the model's own answer wherever they sit.
//
// Different job from splitThinking, which holds back the working already in the
// passage. This one is about the refiner's: a model that reasons often opens
// with a think block, and while the <REFINED> tags catch that by ignoring
// everything outside them, two cases got through. With the tags switched off
// the whole answer is the rewrite, working and all. And a model that puts its
// working inside the tags had it saved into the chat.
let stripAnswerThinking = true;

function stripThinkingFrom(text: string): string {
  if (!stripAnswerThinking) return text;
  const alt = thinkNames().join('|');
  let t = String(text);
  try {
    // Closed pairs first, in each of the four shapes.
    if (t.indexOf('</') >= 0)
      t = t.replace(new RegExp('<(' + alt + ')(?:\\s[^>]*)?>[\\s\\S]*?<\\/\\1\\s*>', 'gi'), '');
    if (t.indexOf('[/') >= 0)
      t = t.replace(
        new RegExp('\\[(' + alt + ')(?:\\s[^\\]]*)?\\][\\s\\S]*?\\[\\/\\1\\s*\\]', 'gi'),
        '',
      );
    if (t.indexOf('|>') >= 0)
      t = t.replace(
        new RegExp('<\\|(?:' + alt + ')\\|?>[\\s\\S]*?<\\|?\\/?(?:' + alt + ')\\|?>', 'gi'),
        '',
      );
    t = t.replace(/<\|begin_of_thought\|>[\s\S]*?<\|end_of_thought\|>/gi, '');
    // An opener with nothing closing it, which is working that ran to the end.
    // Only from the front: cutting from an opener in the middle would throw
    // away a rewrite that merely mentions the word.
    t = t.replace(new RegExp('^\\s*<\\|?(?:' + alt + ')\\|?>[\\s\\S]*$', 'i'), '');
  } catch (_) {
    return text;
  }
  return t.trim();
}

function splitThinking(text: string): { head: string; body: string } {
  if (!protectThinking) return { head: '', body: text };
  for (const rule of thinkWraps()) {
    const hit = rule.exec(text);
    if (hit && hit.index === 0) return { head: hit[0], body: text.slice(hit[0].length) };
  }
  return { head: '', body: text };
}

// Ours, turned into something the host's resolver will not touch and nothing in
// a chat message could collide with. Case is ignored and inner spaces are
// allowed, because {{ Message }} is what somebody types.
function maskOurs(text: string): { text: string } {
  return {
    text: String(text).replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (whole, name) => {
      const id = String(name).toLowerCase();
      return OURS.indexOf(id) >= 0 ? '\u0000ARF:' + id + '\u0000' : whole;
    }),
  };
}

// Pass three: our masks, filled in with content that is never scanned again.
function fillOurs(
  text: string,
  p: {
    message: string;
    history: string;
    lore: string;
    memory: string;
    shieldNote?: string;
    wholeReply?: string;
    worn?: string;
  },
): string {
  return String(text).replace(/\u0000ARF:([a-z_]+)\u0000/g, (whole, name) => {
    const id = String(name).toLowerCase();
    if (OURS.indexOf(id) < 0) return whole;
    if (id === 'message') return p.message;
    if (id === 'history') return p.history;
    if (id === 'lore') return p.lore;
    if (id === 'memories') return p.memory;
    if (id === 'protect_notes') return p.shieldNote || '';
    if (id === 'whole_reply') return p.wholeReply || '';
    if (id === 'overused') return p.worn || '';
    return '';
  });
}

// Pass two: everything left, handed to Lumiverse. It knows the card, the
// persona, the variables and the date, and it is already the thing that
// resolves them for the chat itself.
async function fillHost(text: string, scene: Scene, userId?: string): Promise<string> {
  if (text.indexOf('{{') < 0) return text;
  try {
    if (!spindle.macros || typeof spindle.macros.resolve !== 'function') return text;
    const out = await spindle.macros.resolve(text, {
      chatId: scene.chatId,
      characterId: scene.characterId,
      userId: userId,
    });
    // Some builds answer with the string, some with an object carrying it.
    if (typeof out === 'string') return out;
    if (out && typeof out.content === 'string') return out.content;
    if (out && typeof out.text === 'string') return out.text;
    return text;
  } catch (_) {
    // No macros API, or it refused. The block goes as written rather than the
    // refine failing over a macro nobody may have used.
    return text;
  }
}

// ---- phrases this chat has worn out ----
//
// A refine judges one reply at a time, so a phrase reads as fine every time it
// is met. Used in eleven of the last fifteen replies it is the model's crutch,
// and nobody notices because nobody reads fifteen replies at once.
//
// What this is not: a list of phrases that are bad. A written list catches known
// slop on first use and a prompt block is the place for one. This catches what no
// list can hold, which is the drift of one particular chat.

// Words that carry no sense on their own. A run made only of these is grammar,
// not a habit, so "out of the" and "one of the" are not findings.
const PLAIN_WORDS =
  ('a an and as at be been but by for from had has have he her here hers him his ' +
   'i if in into is it its me my no not of on one or our out she so that the their ' +
   'them then there they this to up us was were what when which who will with you your')
    .split(' ');
const PLAIN = new Set(PLAIN_WORDS);

// How many words a phrase has to be. Two is a pairing anybody writes; a single
// word is vocabulary rather than a habit.
const PHRASE_MIN = 3;
const PHRASE_MAX = 6;
// How many to put in the prompt. A list of forty is a list a model skims; the
// ones worth saying are the ones at the top of it.
const WORN_SHOWN = 12;

// Narration only. A character repeating a phrase is characterisation, and
// flagging somebody's catchphrase as slop would be telling them off for writing.
// Everything between one quotation mark and the next comes out.
function narrationOf(text: string): string {
  const s = String(text == null ? '' : text);
  let out = '';
  let inside = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === '\u201c' || c === '\u201d') {
      inside = !inside;
      out += ' ';
      continue;
    }
    out += inside ? ' ' : c;
  }
  return out;
}

// Down to the words a phrase is made of. Markup, punctuation and case all go,
// because "her hand, shaking," and "her hand shaking" are the same habit.
function wordsOf(text: string, skip: Set<string>): string[] {
  return String(text == null ? '' : text)
    .toLowerCase()
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/[*_~>#\[\]()]/g, ' ')
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !skip.has(w));
}

interface Worn {
  phrase: string;
  count: number;
  replies: number;
}

// The phrases worn out across these replies, longest first.
//
// Counted by how many different replies carry one rather than by how many times
// it appears. Five times in one reply is a choice that reply made; five times
// across five replies is a habit, and only the second is worth saying.
function overusedIn(
  replies: string[],
  opts?: { least?: number; names?: string[] },
): Worn[] {
  const least = Math.max(2, Math.floor(Number(opts && opts.least) || 3));
  // Names are in every reply by definition, so a phrase carrying one says
  // nothing about the writing.
  const skip = new Set<string>();
  for (const name of (opts && opts.names) || [])
    for (const w of String(name || '').toLowerCase().split(/\s+/)) if (w) skip.add(w);

  // phrase -> which replies it turned up in, and how often in total.
  const seen = new Map<string, { times: number; where: Set<number> }>();
  for (let r = 0; r < replies.length; r++) {
    const words = wordsOf(narrationOf(replies[r]), skip);
    for (let n = PHRASE_MIN; n <= PHRASE_MAX; n++) {
      for (let i = 0; i + n <= words.length; i++) {
        const run = words.slice(i, i + n);
        // Grammar rather than a habit.
        if (run.every((w) => PLAIN.has(w))) continue;
        const phrase = run.join(' ');
        let hit = seen.get(phrase);
        if (!hit) {
          hit = { times: 0, where: new Set<number>() };
          seen.set(phrase, hit);
        }
        hit.times++;
        hit.where.add(r);
      }
    }
  }

  const worn: Worn[] = [];
  seen.forEach((hit, phrase) => {
    if (hit.where.size >= least) worn.push({ phrase: phrase, count: hit.times, replies: hit.where.size });
  });

  // Longest first, because a long phrase is the finding and the short runs
  // inside it are the same habit counted again.
  worn.sort((a, b) =>
    b.phrase.length - a.phrase.length || b.replies - a.replies || a.phrase.localeCompare(b.phrase),
  );
  const kept: Worn[] = [];
  for (const one of worn) {
    // Inside something already reported, and appearing no more often than it
    // does: the same habit, said once already.
    const swallowed = kept.some(
      (had) => had.phrase.indexOf(one.phrase) >= 0 && had.replies >= one.replies,
    );
    if (!swallowed) kept.push(one);
  }
  kept.sort((a, b) => b.replies - a.replies || b.count - a.count || a.phrase.localeCompare(b.phrase));
  return kept;
}

// ---- finding a selection in the text it was rendered from ----
// A selection is made in rendered markdown and has to be written back into the
// raw source. The two are different strings: emphasis markers style the text
// rather than appearing in it, so an offset counted on screen lands in the wrong
// place in the source. Rather than do arithmetic on that difference, the source
// is walked once and two things are recorded: the characters a reader can
// actually select, and the source index each of them came from.
function renderMap(raw: string): { seen: string; from: number[] } {
  const seen: string[] = [];
  const from: number[] = [];
  const n = raw.length;
  let i = 0;
  while (i < n) {
    const c = raw[i];
    // A fenced block is shown as written, so its markers are selectable.
    if (raw.startsWith('```', i)) {
      const end = raw.indexOf('```', i + 3);
      const stop = end < 0 ? n : end + 3;
      for (let k = i; k < stop; k++) {
        seen.push(raw[k]);
        from.push(k);
      }
      i = stop;
      continue;
    }
    if (c === '`') {
      const end = raw.indexOf('`', i + 1);
      if (end > 0) {
        for (let k = i + 1; k < end; k++) {
          seen.push(raw[k]);
          from.push(k);
        }
        i = end + 1;
        continue;
      }
    }
    // One or two of either emphasis marker, which style the run rather than
    // being part of it.
    //
    // An underscore with a word character either side of it is not emphasis and
    // is drawn as typed, so my_long_name is text a reader can select rather than
    // a styled run. Taking it out here would make that selection unfindable.
    // Stars have no such rule and can open emphasis inside a word.
    //
    // Where this is wrong it is wrong in the safe direction. A marker taken out
    // that the host kept means the selection will not match, which is refused
    // and said out loud; a marker kept that the host took out would shift every
    // offset after it, which is the kind of wrong that writes to the wrong place.
    const wordish = (ch: string | undefined) => !!ch && /[A-Za-z0-9]/.test(ch);
    const literalUnderscore = c === '_' && wordish(raw[i - 1]) && wordish(raw[i + 1]);
    if (!literalUnderscore && (c === '*' || c === '_') && raw[i + 1] === c) {
      i += 2;
      continue;
    }
    if (!literalUnderscore && (c === '*' || c === '_')) {
      i += 1;
      continue;
    }
    seen.push(c);
    from.push(i);
    i += 1;
  }
  return { seen: seen.join(''), from: from };
}

// Whitespace does not survive the trip identically: block elements join with one
// newline in a DOM range and with a blank line in the source. Both sides are
// compared with runs of whitespace flattened to one space, and the flattened
// form keeps its own map back so a match can still be located exactly.
function loosen(s: string): { text: string; at: number[] } {
  const out: string[] = [];
  const at: number[] = [];
  let gap = false;
  for (let k = 0; k < s.length; k++) {
    if (/\s/.test(s[k])) {
      gap = true;
      continue;
    }
    if (gap && out.length) {
      out.push(' ');
      at.push(k);
    }
    gap = false;
    out.push(s[k]);
    at.push(k);
  }
  return { text: out.join(''), at: at };
}

// Emphasis markers come in pairs. A span that starts or ends between a pair
// takes one marker with it, and replacing it leaves the other one stranded,
// which turns the rest of the message italic. The span is widened outward to
// whichever marker it is inside, so the pair travels together.
function balanced(raw: string, start: number, end: number): { start: number; end: number } | null {
  let from = start;
  let to = end;
  // Runs of one or two markers, in source order, so a span can be tested
  // against the pair it falls between.
  const runs: Array<{ at: number; len: number; mark: string }> = [];
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c !== '*' && c !== '_') continue;
    const len = raw[i + 1] === c ? 2 : 1;
    runs.push({ at: i, len: len, mark: c });
    i += len - 1;
  }
  // Paired off in order, which is how a reader reads them and how the host
  // renders them.
  for (let k = 0; k + 1 < runs.length; k += 2) {
    const open = runs[k];
    const shut = runs[k + 1];
    if (open.mark !== shut.mark || open.len !== shut.len) continue;
    const inside = open.at + open.len;
    const outside = shut.at;
    // One end of the span inside this pair and the other outside it: take the
    // whole pair, markers and all, or the one left behind turns the rest of the
    // reply into emphasis.
    //
    // A span can never begin or end inside the markers themselves. Both ends
    // come from the map of characters a reader can select, and a marker is not
    // one of those.
    const startsInside = from >= inside && from <= outside;
    const endsInside = to >= inside && to <= outside;
    if (startsInside !== endsInside) {
      from = Math.min(from, open.at);
      to = Math.max(to, shut.at + shut.len);
    }
  }
  if (from < 0 || to > raw.length || from >= to) return null;
  return { start: from, end: to };
}

// How many identical runs came before the selection. Worked out here rather than
// in the panel so there is one set of matching rules: the panel sends the text in
// front of what was picked and this counts through it with the same flattening
// the span itself is found with. Two implementations of that would drift, and the
// failure would be a refine landing on the wrong sentence.
function ordinalOf(before: string, picked: string): number {
  const hay = loosen(renderMap(String(before == null ? '' : before)).seen).text;
  const needle = loosen(String(picked == null ? '' : picked)).text;
  if (!needle) return 0;
  let n = 0;
  let at = hay.indexOf(needle);
  while (at >= 0) {
    n++;
    at = hay.indexOf(needle, at + 1);
  }
  return n;
}

// picked is what the selection read as. ordinal says how many identical runs came
// before it, so a phrase used twice in one reply is not ambiguous. Null means it
// could not be found, which is a selection that no longer matches the message.
function pickedSpan(
  raw: string,
  picked: string,
  ordinal?: number,
): { start: number; end: number } | null {
  const want = Number(ordinal) > 0 ? Math.floor(Number(ordinal)) : 0;
  const map = renderMap(String(raw == null ? '' : raw));
  const hay = loosen(map.seen);
  const needle = loosen(String(picked == null ? '' : picked)).text;
  if (!needle) return null;
  let at = -1;
  for (let k = 0; k <= want; k++) {
    at = hay.text.indexOf(needle, at + 1);
    if (at < 0) return null;
  }
  const firstSeen = hay.at[at];
  const lastSeen = hay.at[at + needle.length - 1];
  if (firstSeen == null || lastSeen == null) return null;
  const start = map.from[firstSeen];
  const end = map.from[lastSeen];
  if (start == null || end == null) return null;
  return balanced(raw, start, end + 1);
}

// A block that is nothing but empty tags once its macros came back empty. A
// chat with no lorebook should not send <world></world>, which reads to a model
// as "this world is empty" rather than as "nothing was said about the world".
function isHollow(text: string): boolean {
  const bare = text
    .replace(/<\/?[a-z0-9_\-]+\s*\/?>/gi, '')
    .replace(/\s+/g, '');
  return bare.length === 0;
}

// parts, when given, is filled with what each block came to after its macros
// were resolved. Blocks that sit next to each other with the same role are
// joined into one message, so counting the messages alone reports every rule as
// a single lump. What a reader wants to know is which block is costing them.
async function buildPrompt(
  text: string,
  isUser: boolean,
  scene: Scene,
  userId?: string,
  parts?: Array<{ name: string; text: string }>,
): Promise<any[]> {
  const piece = {
    message: text,
    history: scene.context,
    lore: scene.lore,
    memory: scene.memory,
    shieldNote: scene.shieldNote,
    wholeReply: scene.wholeReply,
    worn: scene.worn,
  };
  const out: any[] = [];
  for (const b of activeBlocks(isUser)) {
    if (!b || !b.on) continue;
    // Ours are masked, not filled, so the host pass runs over the block's own
    // wording and never over the reply. Filling first would hand the reply's
    // text to the macro resolver, and a message that happens to contain
    // {{persona}} would quietly expand into somebody's prompt. Masked, then
    // resolved, then filled: the reply goes in last and is never scanned.
    const masked = maskOurs(String(b.text || ''));
    const resolved = await fillHost(masked.text, scene, userId);
    const body = fillOurs(resolved, piece).trim();
    // Empty, or nothing but the tags somebody wrapped a macro in.
    if (!body || isHollow(body)) continue;
    if (parts) parts.push({ name: String(b.name || 'a block with no name'), text: body });
    const role = ROLES.indexOf(String(b.role)) >= 0 ? String(b.role) : 'system';
    // Blocks that land next to each other with the same role are joined rather
    // than sent as separate messages. Providers differ on how they treat two
    // system messages in a row, and one is what the reader meant by putting
    // them together.
    const last = out.length ? out[out.length - 1] : null;
    if (last && last.role === role) last.content += '\n\n' + body;
    else out.push({ role: role, content: body });
  }
  return out;
}

// ---- reading the answer ----
// A model told to reply with only the rewritten message will sometimes reply
// with something else, and saving that is the failure that matters. Each check
// below is a shape that was going to be written into somebody's chat.
const PREAMBLE =
  /^\s*(?:here(?:'|’)?s?\s+(?:is\s+)?(?:the\s+)?(?:your\s+)?(?:rewritten|revised|refined|edited|polished|updated)\b|sure[,!.]|certainly[,!.]|of course[,!.]|i(?:'|’)?ve\s+(?:rewritten|revised|refined|edited|polished)\b|(?:rewritten|revised|refined|edited|polished)\s+(?:message|version|text)\s*:)/i;

// A model declining the job, which must never be saved over the reply.
// A model declining to do the rewrite, which is the one answer that must never
// be saved over somebody's reply.
//
// The lists below are Auto Retry's, copied across rather than written again.
// That extension exists to notice a model refusing and its lists have been
// filled out against real answers over a long time; this one had a single
// pattern covering about eight wordings, so it read past most of them and saved
// the refusal as though it were the rewrite.
//
// The lists come over and the machinery around them does not. Auto Retry reads
// a roleplay reply, where a refusal has to be told apart from a character
// saying the same words in dialogue, so it has rules about quotation, about
// where in the reply a line falls, and about dialogue tags. What is judged here
// is a short answer to "rewrite this passage", where none of that applies: the
// length cap below is the whole of the equivalent.
const REFUSAL_STRONG: RegExp[] = [
  // Model naming itself as an AI.
  /\bas an? (?:ai|a\.i\.|language model|large language model|ai (?:model|assistant))\b/i,
  /\bI(?:'m| am)(?: just| only)? an? (?:ai|a\.i\.|language model|large language model|ai assistant)\b/i,
  // Policy / guideline framing. The adjective slot is what "my safety
  // guidelines" and "my content policies" need: without it the pattern only
  // matched when the noun followed the possessive directly, so the two most
  // common wordings of the most common refusal in the list went unmatched.
  /\b(?:against|violates?|violating|goes? against|contrary to) (?:my|our|the|its) (?:safety |content |usage |ethical |core |operating |current )?(?:guidelines|programming|policy|policies|principles|rules|instructions)\b/i,
  // Refusal opener + a task-word a character never says (request, prompt,
  // content, message, scenario, roleplay). This meta object separates "the model
  // refusing a task" from "a character refusing a person," so declining an
  // invitation, a duel, or a marriage proposal in-scene will NOT match.
  /\bI(?: (?:can(?:no|')?t|cannot|will not|won'?t|must not|must|have to|need to|refuse to|decline to|am (?:not able|unable) to|am going to have to)|'m (?:not able|unable) to|'m going to have to)\b[^.?!\n]{0,30}?\b(?:this|that|your|the) (?:request|prompt|content|message|scenario|roleplay)\b/i,
  // Assistant-only verbs (assist / comply / fulfill) that almost never
  // appear in first-person roleplay dialogue.
  // The object matters: a refusal is aimed at "that" or "this request", never at
  // a concrete thing in the scene. Without this, a servant or aide saying "I
  // can't assist you with the horses today" reads as the model refusing.
  /\bI(?: (?:can(?:no|')?t|cannot|will not|won'?t|am (?:not able|unable) to)|'m (?:not able|unable) to) (?:be able to )?(?:assist|comply|fulfil|fulfill)\b(?:[^.?!\n]{0,30}?\b(?:that|this|it|your request|this request|the request|your prompt)\b|(?:\s+you)?\s*[.!?,"'\u201d\u2019]|(?:\s+you)?\s*$)/i,
  // Out-of-character comfort hedge, only in the assistant-action sense.
  /\bI don'?t feel comfortable (?:continuing|writing|creating|generating|producing|proceeding|providing|helping|assisting)\b/i,
  // Common modern refusal openers and bodies: "I'm sorry, but I can't create/generate...",
  // "that's not something I can help with", "I'm not going to generate that". Anchored on
  // assistant-action verbs so an in-character line like "I can't marry you" stays safe.
  /\bI(?:'m| am) sorry,? but I(?: can'?t| cannot| won'?t|'m (?:not able|unable) to| am (?:not able|unable) to) (?:create|generate|write|produce|provide|assist|comply|fulfil|fulfill|help you with|engage with)\b/i,
  // "that's not something I can help with" and "that isn't something I can
  // help with" are the same sentence, and only the first was matched. Written
  // as three explicit alternatives rather than an optional "not", so it can
  // never match the opposite sentence ("that's something I can help with").
  /\b(?:that|this)(?:'s not|\s+is not|\s+isn'?t) something I(?: can| am able to|'m able to| could) (?:help with|assist with|create|generate|provide|write|do|engage with|write about)\b/i,
  // The plain future has to end the clause where it lands. "This isn't
  // something I'll write" is the model; "that is not something I would write in
  // a letter to him" is somebody in the scene, and the words after the verb are
  // the only thing telling them apart.
  /\b(?:that|this)(?:'s not|\s+is not|\s+isn'?t) something I(?:'ll| will) (?:write|create|generate|produce|engage with|do)\s*[.!?,;]/i,
  /\bI(?:'m| am) not going to (?:create|generate|produce|write) (?:that|this|such|content|explicit|sexual|those)\b/i,
  // Refusing a category of content rather than a request, which is how a model
  // names what it will not write when the subject is self-harm or suicide.
  /\bI(?: (?:can(?:no|')?t|cannot|will not|won'?t)|'m (?:not able|unable) to) (?:assist with|provide|create|generate|write|produce) content (?:that|which) (?:promotes|depicts|involves|encourages|facilitates|glorifies)\b/i,
  // The disclaimer a reply attaches instead of writing the scene.
  /\bgiven the (?:sensitive|serious) nature of (?:this|that|the) (?:topic|subject|request|content)\b/i,
  // Refusing a category of writing rather than a request or a subject. The
  // pattern above this one reads the word straight after the verb, so
  // "generate sexually explicit content" walked past it: the list held
  // "sexual" and the reply said "sexually". This leaves room for the adverbs
  // and adjectives that stack up in front of the noun, and the noun itself has
  // to be one a model uses about its own output.
  /\bI(?: (?:can(?:no|')?t|cannot|will not|won'?t|do not|don'?t|am (?:not able|unable) to|am not going to)|'m (?:not able|unable) to|'m not going to) (?:be able to )?(?:generate|create|write|produce|provide|depict|describe)\b[^.?!\n]{0,30}?\b(?:explicit|graphic|sexual\w*|erotic\w*|pornograph\w*|nsfw|adult|detailed|realistic|extreme|gratuitous|violent|gory) (?:content|material|descriptions?|depictions?)\b/i,
  // The counter-offer that comes with it: the same scene with the objectionable
  // part left out. Nobody in a scene talks about continuing the narrative.
  /\bcontinue the (?:narrative|story|scene|roleplay) with a focus on\b/i,
  /\bwithout (?:the )?(?:explicit|graphic) (?:anatomical|sexual|physical) (?:details?|descriptions?)\b/i,
  // The model deciding a character is too young, which is a refusal aimed at
  // your cast rather than at your request. Nobody in a scene says a character
  // reads as underage.
  /\b(?:appears? to be|reads as|is described as|seems to be|may be) (?:a |an )?(?:minor|underage|child)\b/i,
  // The same thing with the reason in front of the refusal. The refusal has to
  // follow it, because "that would be illegal, he said, and went back to
  // picking the lock" is a scene.
  /\b(?:that|this|it) would be (?:illegal|unlawful)\b[^.?!\n]{0,30}?\bso I (?:can(?:no|')?t|won'?t|will not)\b/i,
  // Declining on the grounds that it would be against the law. The writing verb
  // has to sit between the refusal and the word, so a character refusing to do
  // something illegal in a scene is left alone.
  /\bI(?: (?:can(?:no|')?t|cannot|will not|won'?t)|'m not going to)\b[^.?!\n]{0,30}?\b(?:write|create|generate|produce|depict|help with|assist with)\b[^.?!\n]{0,30}?\b(?:illegal|unlawful|against the law|violates? the law)\b/i,
  // The flat no. Some models do not soften it at all: the reply opens with the
  // word and then says what it will not do. Anchored to the start of the reply,
  // because a "No." in the middle of a scene is somebody answering a question,
  // and it still needs an object no character has. The writing verbs are kept
  // next to what they write, so "No. I can't tell you that story" stays safe
  // and "No. I won't write a scene like that" does not.
  /^no[\s.,!\u2014\u2013-]*(?:I(?:'m| am) not going to|I won'?t|I can(?:no|')?t|I cannot|I will not)\b[^.?!\n]{0,60}?(?:\b(?:content|request|prompt|roleplay|role-?play|scenario)\b|\b(?:engage|participate) with (?:this|that|it)\b|\b(?:write|generate|create|produce|depict|continue) (?:a |an |any |the |this )?(?:scene|story|passage|narrative)\b)/i,
  // The same refusal without the opening no, aimed at what it was asked to
  // write rather than at "that". A character declines to write a letter, never
  // a scene or a passage.
  /\bI(?:'m| am) not going to (?:write|create|generate|produce|describe|depict) (?:a |an |any |the )?(?:scene|story|passage|narrative|response|reply)\b/i,
  // The refusal stated as a boundary rather than as an inability: "what I won't
  // do is write that scene". It reads as the model setting terms, which is why
  // none of the patterns above see it: there is no "I can't" in the sentence at
  // all. A character can open a line the same way, so the meta object is doing
  // all the work here. "What I won't do is leave you here" has none of them.
  /\bwhat I(?: (?:won'?t|will not|can(?:no|')?t|cannot|am not going to)|'m not going to) do is\b[^.?!\n]{0,40}?\b(?:write|generate|create|produce|depict|simulate|roleplay|role-?play|content|this scene|that scene|this story)\b/i,
  // The other half of the same reply: what it will do instead. Offered in
  // help-desk register, with the thing it is offering to write named.
  /\b(?:here(?:'s| is) what I (?:can|will) do|what I can (?:do|offer) (?:instead )?is)\b[^.?!\n]{0,60}?\b(?:write|scene|story|content|roleplay|role-?play|instead)\b/i,
  // The doubled refusal: "I cannot and will not engage with content that...".
  // Every pattern above expects the verb straight after the modal, so the
  // conjunction hid the most emphatic refusal there is. A meta object is still
  // required, because "I cannot and will not marry him" is a line from a scene.
  /\bI (?:can(?:no|')?t|cannot|will not|won'?t) and (?:will not|won'?t|cannot|can(?:no|')?t) (?:engage|participate|assist|comply|help|create|generate|produce|write|continue)\b[^.?!\n]{0,40}?\b(?:content|request|prompt|scenario|roleplay|role-?play|this|that)\b/i,
  // "I'm not going to fulfil that request", "I'm not going to comply with that
  // request", "I'm not going to assist with that". The refusal opener list
  // above starts at "I can't" and never covered this shape.
  /\bI(?:'m| am) not going to (?:assist|comply|help|engage)\b[^.?!\n]{0,24}?\b(?:that|this|it|your request|the request)\b/i,
  /\bI(?:'m| am) not going to (?:fulfil|fulfill|process|answer)\b[^.?!\n]{0,24}?\b(?:that|this|your|the) (?:request|prompt|message|one)\b/i,
  // "I can't generate that", "I cannot generate that content", "I'm not able to
  // generate that". The object has to follow the verb directly. Allowing
  // anything in between caught "I can't generate enough heat with this flint",
  // because "this" turned up further along the sentence.
  /\bI(?: (?:can(?:no|')?t|cannot|will not|won'?t|am (?:not able|unable) to|do not|don'?t)|'m (?:not able|unable) to) (?:be able to )?generate (?:that|this|it|those|such|content|explicit|sexual|a response)\b/i,
  // "I don't create content like that", "I don't generate that kind of
  // content". The object is content, which is what a model calls its output.
  /\bI (?:do not|don'?t) (?:create|generate|produce|write|make) (?:(?:that|this) (?:kind|sort|type) of content|content(?: like that| of that (?:kind|sort|nature))?)\b/i,
  // "I can't process that request", "I can't provide advice on that". Process
  // and provide are both things a character can say, so a meta object is
  // required: a request, a prompt, instructions, guidance or advice.
  /\bI(?: (?:can(?:no|')?t|cannot|will not|won'?t|am (?:not able|unable) to)|'m (?:not able|unable) to) (?:process|handle)\b[^.?!\n]{0,24}?\b(?:that|this|your|the) (?:request|prompt|message|query)\b/i,
  /\bI(?: (?:can(?:no|')?t|cannot|will not|won'?t|am (?:not able|unable) to)|'m (?:not able|unable) to) provide (?:that |the |any )?(?:information|instructions?|guidance|advice|assistance|details)\b/i,
  // "I can't help with illegal activities", "I can't assist with harmful
  // requests", "I can't help with requests of this nature".
  /\bI(?: (?:can(?:no|')?t|cannot|will not|won'?t|am (?:not able|unable) to)|'m (?:not able|unable) to) (?:help|assist|engage) with\b[^.?!\n]{0,24}?(?:\b(?:illegal|harmful|dangerous|unethical|explicit|violent) (?:activit(?:y|ies)|requests?|content|material)\b|\brequests? of (?:this|that) (?:nature|kind|sort|type)\b)/i,
  // Refusal tied to specific prohibited content policies.
  /\bI(?: (?:can(?:no|')?t|cannot|will not|won'?t|am (?:not able|unable) to)|'m (?:not able|unable) to) (?:participate|engage) in (?:this |the |any )?(?:roleplay|role-?playing) or (?:create|generate|produce|write) (?:content|stories|scenes|text) depicting (?:sexual violence|non-?consensual (?:sexual )?(?:acts|situations|scenarios|content))\b/i,
  // Refusal aimed at roleplay itself. The verb list above is assistant-only
  // (assist / comply / fulfill); this covers "participate" and "engage", which a
  // character could say, so a meta object is required: roleplay, a scenario, or
  // qualified content. "I cannot participate in this duel" has none of those and
  // stays safe. Bare "content" is left out, since "he said, content
  // to wait" would otherwise match.
  /\bI(?: (?:can(?:no|')?t|cannot|will not|won'?t|do not|don'?t|am (?:not able|unable) to)|'m (?:not able|unable) to) (?:participate|engage)\b[^.?!\n]{0,40}?\b(?:role-?play(?:ing|s)?|scenarios?|(?:sexual|explicit|adult|nsfw|romantic|such|this|that) content)\b/i,
  // Fiction disclaimer. Nobody writes this inside a scene; it only appears when
  // the model is explaining that being fictional does not change its answer.
  /\beven (?:in|within) (?:a |an |the )?(?:fictional|fiction|hypothetical|imaginary|make-?believe|creative|roleplay) (?:context|setting|scenario|framing|situation)\b/i,
  // The same disclaimer said the other way round, which is the commoner half:
  // the refusal first and the fiction dismissed after it. Anchored on the word
  // fictional, because "no matter how you frame it" on its own is a line
  // somebody says in an argument.
  /\b(?:regardless of|despite|even with|no matter)\b[^.?!\n]{0,20}?\bfictional (?:framing|context|setting|scenario|premise)\b/i,
  // The same thing with the word fictional dropped, which is how both of the
  // replies that got past 4.9.0 wrote it. "Framing" as a bare noun is the
  // model's word for the wrapper around a request; nobody in a scene has one.
  /\b(?:won'?t|will not|can(?:no|')?t|cannot|do not|don'?t|not going to)\b[^.?!\n]{0,60}?\bregardless of (?:the |any |its )?framing\b/i,
  // Refusing the form rather than the subject. A character never says they do
  // not write roleplay, because a character does not know they are in one.
  /\bI (?:do not|don'?t) (?:write|do|create|generate|engage in) (?:roleplay|role-?play)\b/i,
  /\bI(?:'m| am) not going to (?:roleplay|role-?play)\b/i,
  // "That's something I won't write", which is the sentence the other way up
  // from "that's not something I'll write" and was matched by nothing. The verb
  // has to be one about producing text: "that's something I won't do" is a line
  // from a scene.
  /\b(?:that|this)(?:'s| is) something I (?:won'?t|will not|can(?:no|')?t|cannot) (?:write|create|generate|produce|engage with)(?:\s*[.!?,;]|\s+(?:regardless|even|no matter|under any|in any)\b)/i,
  // Reading your message as a request, and saying which reading it declined.
  /\bif you meant it as a request\b/i,
  // The framing dismissed as a device rather than as a word. "Calling it
  // roleplay doesn't change what it is" is the model arguing with the premise,
  // which is not a thing that happens inside a scene.
  /\b(?:framing|calling|labell?ing|describing|presenting)\b[^.?!\n]{0,60}?\bdoes(?:n'?t| not) change (?:what it is|that|anything|the)\b/i,
  /\bregardless of how\b[^.?!\n]{0,30}?\bis (?:framed|worded|presented|phrased|described)\b/i,
  // The model talking about its own limits, and the offers it closes with.
  /\bI(?:'m| am) here for a genuine conversation\b/i,
  // The redirect offer that closes most refusals. Help-desk register plus a task
  // noun, so an in-scene offer of help does not reach it.
  /\bI(?:'m| am|'d be| would be) (?:available|happy|glad) to (?:assist|help)\b[^.?!\n]{0,60}?\b(?:writing tasks?|creative writing|analysis|queries|other requests?|other topics?|other directions?|another direction|other ideas|a story|a different story|a scene|alternatives)\b/i,
];

const REFUSED_SUBJECT =
  "(?:" +
  // Sexual writing as a category, in the words a model names it by.
  // Written with their endings, because a refusal about a backstory says
  // "a character is raped" rather than "rape", and the bare word missed it.
  // Spelled out rather than left to \\w*, so a rapeseed field is still a field.
  "sexual violence|sexual(?:ly)? (?:assault|abus)(?:e|ed|es|ing)?|sexualized? (?:violence|minors?)|" +
  "smut|erotica|porn\\w*|nsfw|sex scenes?|sexual acts?|sexual content|explicit content|" +
  // Consent, which is refused by name as often as by act.
  "non-?consensual\\w*|non-?consent\\w*|noncon|dubcon|dubious consent|questionable consent|" +
  "unclear consent|consent (?:is|being) (?:unclear|ambiguous|absent|dubious)|coerc\\w+|" +
  // Kink, which was the largest hole: none of this was recognised at all.
  // "choking" is left out on purpose, since a scene can choke on smoke.
  "bdsm|bondage|sadomasochis\\w*|sadis\\w*|masochis\\w*|degradation|humiliation|" +
  "breath ?play|impact play|age ?play|pet ?play|kinks?|fetish\\w*|power exchange|" +
  // Family framings a model reads as incest whether or not it is.
  "incest|step-?sibling\\w*|step-?brother|step-?sister|step-?parent|step-?father|" +
  "step-?mother|step-?son|step-?daughter|" +
  // The -ing forms drop the e, so they are written out rather than built from
  // the noun. A bare "rap" is not in here: it is a knock at a door.
  // Violence, in the forms a model refuses it by. "violence" on its own is not
  // here: "I can't describe the violence" is something a character says.
  "(?:graphic|extreme|gratuitous|realistic|detailed|explicit) violence|" +
  "violence against (?:children|minors|a child|animals)|violent deaths?|" +
  "gore|gory|mutilat\\w+|dismember\\w*|body horror|animal (?:cruelty|abuse)|" +
  "murder scenes?|stalking behaviou?r|depictions? of (?:violence|harm|injury|death)|" +
  "real (?:person|people|individuals?)|" +
  "rape(?:d|s)?|raping|bestiality|csam|child (?:sexual )?abuse|minors?|underage|" +
  "self-?harm(?:ed|ing|s)?|suicid(?:e|al)|torture(?:d|s)?|torturing" +
  ")";

const REFUSAL_SUBJECT: RegExp[] = [
  // A refusal verb, then the thing being refused, with room for the wrapper it
  // usually arrives in: "content depicting", "scenes involving", "stories about".
  new RegExp(
    "\\bI(?: (?:can(?:no|')?t|cannot|will not|won'?t|do not|don'?t|am not going to|refuse to)|'m not going to) " +
      "(?:write|create|generate|produce|depict|portray|roleplay|role-?play|participate in|engage (?:in|with)|continue with)\\b" +
      "[^.?!\\n]{0,40}?\\b" + REFUSED_SUBJECT + "\\b",
    "i",
  ),
  // The reason named after the fact: "I can't continue as this involves ...".
  // A refusal has to come first, so an ordinary sentence about what a plot
  // involves is untouched.
  new RegExp(
    "\\bI(?: (?:can(?:no|')?t|cannot|will not|won'?t)|'m not going to)\\b[^.?!\\n]{0,30}?" +
      "\\b(?:as|because|since) (?:this|that|it) (?:involves|depicts|features|contains)\\b" +
      "[^.?!\\n]{0,20}?\\b" + REFUSED_SUBJECT + "\\b",
    "i",
  ),
];

const REFUSAL_PHRASES = [
  "i can't help with that",
  "i cannot help with that",
  "i can't assist with that",
  "i cannot assist with that",
  "i'm unable to help with that",
  "i'm unable to assist with that",
  "i'm not able to help with that",
  "i can't comply with that",
  "i cannot comply with that",
  "i can't provide that information",
  "i cannot provide that information",
  "i can't provide instructions",
  "i can't provide guidance on that",
  "i can't fulfill that request",
  "i can't fulfil that request",
  "i can't support that request",
  "i won't be able to help with that",
  "i can't generate a response to that",
  "i can't provide a response to that",
  "i can't generate that content",
  "i can't engage with that request",
  "can't help with requests like this",
  "can't assist with requests like this",
  "violates our polic",
  "violates the safety polic",
  "violates the content polic",
  "for safety reasons",
  "due to safety concerns",
  "i have to prioritize safety",
  "i cannot create that content",
  "i cannot generate that content",
  "i can't create that content",
  "i'm unable to provide that",
  "i'm unable to complete that request",
  "i can't provide instructions for that",
  "i can't provide guidance for that",
  "i can't provide advice on that",
  "i can't provide assistance with that",
  "i can't assist with harmful requests",
  "i won't be able to assist with that",
  "i'm not able to assist with that",
  "i'm not able to create that content",
  "i can't produce that content",
  "i can't write that content",
  "i can't continue with this request",
  "i can't continue with that request",
  "i must decline this request",
  "i must decline that request",
  "i have to decline that request",
  "i'll have to decline that request",
  "that request goes against",
  "goes against my safety",
  "against my content polic",
  "i'm not able to comply",
  // "this" where the list only had "that". Models pick between the two by which
  // word the sentence before it used, so every entry that reads naturally both
  // ways needs both, and half of these were only ever listed one way.
  "i'm unable to help with this",
  "i can't help with this request",
  "i can't assist with this request",
  "i'm unable to assist with this request",
  "i can't engage with this request",
  "i can't continue with this conversation",
  "i can't provide instructions for this",
  "i'm not going to engage with this prompt",
  // The same sentence without the "not", which is a different sentence and was
  // never matched by the one above it.
  "that's something i can't help with",
  "i'm not able to provide information or help with that",
  "i can't provide information that could facilitate harm",
];

// Every phrase written out, so a check is one pass over three lists rather than
// three passes and a concat on every answer.
function looksLikeRefusal(text: string): boolean {
  const t = String(text == null ? '' : text);
  if (!t) return false;
  // Straight quotes and apostrophes, so a model writing a curly one is read the
  // same as one writing a typewriter one.
  const norm = t.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"');
  const lower = norm.toLowerCase();
  for (const re of REFUSAL_STRONG) if (re.test(norm)) return true;
  for (const re of REFUSAL_SUBJECT) if (re.test(norm)) return true;
  for (const p of REFUSAL_PHRASES) if (lower.indexOf(p) >= 0) return true;
  return false;
}

// ---- a rewrite that quietly sanitised the reply ----
// The failure the other checks cannot see. A softened reply is not a refusal,
// is the right length, and keeps every protected token: it just came back with
// the strong words taken out. Nothing catches that by looking at the rewrite alone,
// because there is nothing wrong with it. It is only wrong next to the original.
//
// So this compares the two. The signal is a strong word that was in the reply
// and is gone from the rewrite: explicit, violent or profane, the words a model
// takes out when it decides to tone something down. One word going is an edit;
// most of them going at once is what this is looking for, and that is the
// fraction below.
//
// Kept narrow on purpose. A check that fires on ordinary edits gets turned off
// within a day, and then it catches nothing at all.
// Kept short, and every word on it has to be hard
// to use innocently. An earlier draft of this list held hit, beat, bare, skin,
// chest, dead, pain and desire, which are the vocabulary of ordinary
// description: a refine that tightened a paragraph would have been called
// softening several times a session, and a check that cries wolf is a check
// somebody switches off, after which it catches nothing at all.
//
// The narrow list misses some real softening. That is the right way round: a
// missed softening leaves the reader where they already were, and a false one
// throws away a good rewrite and teaches them to distrust the whole feature.
const STRONG = [
  'blood', 'bloody', 'bleeding', 'wound', 'wounded', 'corpse',
  'stab', 'stabbed', 'strangle', 'strangled', 'choke', 'choked',
  'knife', 'blade', 'gun', 'gunshot',
  'naked', 'nude', 'breast', 'breasts', 'nipple', 'nipples',
  'thigh', 'thighs', 'groin', 'arousal', 'aroused', 'lust',
  'moan', 'moaned', 'moaning', 'whimper', 'whimpered',
  'rape', 'raped', 'torture', 'tortured', 'mutilate', 'mutilated',
  'slur', 'obscene', 'filthy',
  'fuck', 'fucked', 'fucking', 'shit', 'bastard', 'bitch', 'cunt', 'cock',
];

// The reader's own, on top of the built-in list. Somebody writing a particular
// kind of story knows better than any list what softening looks like in it.
let extraStrong: string[] = [];

function setStrong(raw: any): void {
  const out: string[] = [];
  for (const line of String(raw == null ? '' : raw).split(/[\n,]/)) {
    const w = String(line).trim().toLowerCase().replace(/[^a-z0-9'-]/g, '');
    if (!w || w.length < 2) continue;
    if (STRONG.indexOf(w) >= 0 || out.indexOf(w) >= 0) continue;
    out.push(w);
    if (out.length >= 200) break;
  }
  extraStrong = out;
}

let guardSoften = true;
// How many of the strong words may go before it counts as softening. A
// refine legitimately cuts a word or two, so this is a fraction rather than a
// count, and it is the reader's to set.
let softenPct = 60;

function strongIn(text: string): Record<string, number> {
  const seen: Record<string, number> = {};
  const words = String(text).toLowerCase().match(/[a-z0-9'-]+/g);
  if (!words) return seen;
  const list = STRONG.concat(extraStrong);
  for (const w of words) if (list.indexOf(w) >= 0) seen[w] = (seen[w] || 0) + 1;
  return seen;
}

// Returns the words that went, or an empty list when nothing did.
function softenedAway(original: string, rewrite: string): string[] {
  if (!guardSoften) return [];
  const was = strongIn(original);
  const names = Object.keys(was);
  if (!names.length) return [];
  const now = strongIn(rewrite);
  const gone: string[] = [];
  let hadTotal = 0;
  let lostTotal = 0;
  for (const w of names) {
    hadTotal += was[w];
    const lost = was[w] - (now[w] || 0);
    if (lost > 0) {
      lostTotal += lost;
      gone.push(w);
    }
  }
  if (!lostTotal) return [];
  // Below this there are too few of them to say anything was taken out. One strong word in a reply, gone from the rewrite, is an edit,
  // and reading that as sanitising would fail a good refine over one word.
  if (hadTotal < 3) return [];
  const pct = (lostTotal / hadTotal) * 100;
  const bar = Number.isFinite(softenPct) ? Math.min(100, Math.max(1, softenPct)) : 60;
  return pct >= bar ? gone : [];
}

let guardRefusal = true;
let guardPreamble = true;
// How many extra asks a failed check is worth. Zero by default: every retry is
// another call, and somebody who never opened this setting has not agreed to
// pay for three refines where they asked for one.
let retryRefine = 0;
// How many times a refine will wait out a provider that would not take the
// call. On by default, unlike the retry above, because a refused call costs
// nothing: the model never read anything, so waiting and asking again buys the
// refine that was already asked for rather than a second one.
let rateWaits = 2;
// Whether a refine is added as a reroll beside the reply rather than written
// over it. Off by default: it changes what the chat holds rather than what it
// says, and a reader who has not asked for that should not find their swipe
// count going up on every reply.
let asSwipe = false;
// Phrases this chat has worn out, and how far back to look for them. Off by
// default: it reads the chat's replies, which is a call to Lumiverse nobody asked
// for until they put the macro in a block.
let wornOn = false;
let wornBack = 60;
let wornLeast = 3;
// Phrases to leave alone. A repeated line can be the point: a motif, a ritual, a
// thing a story is about.
let wornFine: string[] = [];

// Which failures a second ask could plausibly fix. A refusal, a preamble, a
// softened rewrite and an answer cut off mid-write are all the model having a
// bad turn. A rewrite refused for its length is the model meaning it, and one
// that dropped a protection token has already been re-read once; asking again
// buys the same answer at the same price.
// An answer that came back word for word the same is not in here. The prompt
// asks for exactly that of a passage that already reads well, so asking again is
// asking the model to change something it has just said needs no change, at the
// same price. That one is decided by the verdict's own flag rather than by its
// wording, which is what a reader sees and what a rewording would quietly
// change the meaning of.
function worthRetrying(why: string): boolean {
  return /declined to rewrite|wrote about the edit|softened the reply|sent nothing back|cut off before it finished/i.test(
    String(why || ''),
  );
}

// ---- a call that never happened ----
// A rate limit is a different thing from a bad answer, and the difference is
// what it costs. A bad answer was paid for; asking again buys a second one. A
// 429 was refused before the model read anything, so waiting and asking again
// costs nothing but the wait. That is why this is on by default and the retry
// above is not.
//
// Free tiers and shared keys meter per minute, and a local server answers 503
// while it is loading a model. Both are the common case for anybody not paying
// per token, and both clear on their own.
const RATE_LIMITED =
  /\b(?:408|429|500|502|503|504|522|524)\b|rate.?limit|too many requests|quota|overloaded|capacity|try again later|temporarily unavailable|connection reset|socket hang up|econnrefused|fetch failed/i;

// Errors waiting cannot fix. A wrong key stays wrong, and a model that does not
// exist does not start existing. Checked first, because a message can carry
// both a number and a word from the list above.
const NOT_WORTH_WAITING =
  /\b(?:400|401|402|403|404|405|413|422)\b|invalid.?api.?key|authentication|unauthorized|forbidden|not found|does not exist|insufficient (?:balance|credit|funds)|context length|too long|billing/i;

function rateLimited(err: any): boolean {
  const s = String(err == null ? '' : err);
  if (!s) return false;
  if (NOT_WORTH_WAITING.test(s)) return false;
  return RATE_LIMITED.test(s);
}

// How long the provider said to wait, in milliseconds, or 0 when it said
// nothing. The header's own form first, which is a whole number of seconds
// against the words and no unit; then the wordings written into an error body.
// It is the only figure here that is not a guess, so it wins over the backoff.
const RETRY_AFTER = /retry[-_ ]?after["'\s:=]*(\d+(?:\.\d+)?)(?![.\d]*\s*[a-z])/i;
const STATED_WAIT =
  /(?:retry|try|again|wait|resets?|available)[^0-9]{0,24}?(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|secs?|seconds?|m|mins?|minutes?)\b/i;
const WAIT_SCALE: Record<string, number> = {
  ms: 1, millisecond: 1, milliseconds: 1,
  s: 1000, sec: 1000, secs: 1000, second: 1000, seconds: 1000,
  m: 60000, min: 60000, mins: 60000, minute: 60000, minutes: 60000,
};
// An hour is the ceiling. A provider naming a longer one is naming a daily
// quota, and sitting on a timer for that is worse than saying so and stopping.
const WAIT_CEILING = 3600000;

function statedWait(err: any): number {
  const s = String(err == null ? '' : err);
  if (!s) return 0;
  const bare = RETRY_AFTER.exec(s);
  if (bare) {
    const secs = Number(bare[1]);
    if (Number.isFinite(secs) && secs > 0) return Math.min(WAIT_CEILING, secs * 1000);
  }
  const hit = STATED_WAIT.exec(s);
  if (!hit) return 0;
  const ms = Number(hit[1]) * (WAIT_SCALE[String(hit[2]).toLowerCase()] || 0);
  return Number.isFinite(ms) && ms > 0 ? Math.min(WAIT_CEILING, ms) : 0;
}

// The first wait, doubling, with a little spread on it so a pause everybody is
// serving does not end for everybody in the same instant. A figure the provider
// named wins outright: waiting less than it is spending a try to be told the
// same thing.
const RATE_WAIT_MS = 15000;
const RATE_WAIT_MAX = 120000;

function rateWait(attempt: number, err: any): number {
  const said = statedWait(err);
  if (said > 0) return said + Math.round(Math.random() * 1000);
  const grown = Math.min(RATE_WAIT_MAX, RATE_WAIT_MS * Math.pow(2, Math.max(0, attempt - 1)));
  return Math.round(grown * (0.85 + Math.random() * 0.3));
}

// Wrapping the whole answer in quotes, which a model does when it reads the
// message as a quotation rather than as the thing it is editing.
function unwrapQuotes(t: string): string {
  const s = t.trim();
  if (s.length < 2) return s;
  const open = s[0];
  const close = s[s.length - 1];
  const pairs: Record<string, string> = { '"': '"', '“': '”', '`': '`' };
  if (pairs[open] && close === pairs[open]) {
    const inner = s.slice(1, -1);
    // Only when there is no other mark of the same kind inside, or a reply that
    // legitimately opens and closes on dialogue would lose its quotation marks.
    if (inner.indexOf(open) < 0 && inner.indexOf(close) < 0) return inner.trim();
  }
  return s;
}

// Fenced code, which a model adds when it decides the message is a document.
function unfence(t: string): string {
  const m = t.match(/^\s*```[a-zA-Z]*\n([\s\S]*?)\n```\s*$/);
  return m ? m[1] : t;
}

interface Verdict {
  ok: boolean;
  text: string;
  why: string;
  // What the model wrote around the tags, when it wrote anything. Shown, never
  // saved.
  notes?: string;
  // The answer came back word for word the same. Nothing to save, and nothing
  // wrong either: the prompt asks for exactly this of a passage that already
  // reads well, so it is reported as an outcome rather than as a refusal and is
  // not counted among the ones that were turned down.
  same?: boolean;
}

// What a refine attempt comes back with. notes rides along whether it worked or
// not: a prompt that asks for a report on what was cut wants that report even on
// the pass that was refused for being too long.
interface RefineOutcome {
  ok: boolean;
  why: string;
  notes?: string;
  // The answer came back word for word the same, which the prompt asks for of a
  // passage that already reads well. Carried through so the panel can say so
  // rather than reporting the extension's own instruction as a refusal.
  same?: boolean;
  // Nothing was sent to a model. The pass looked at this reply and decided it
  // was not its turn: another generation is running, or the reply is still
  // holding the refine it was already given. The panel clears its spinner and
  // writes a line, and counts nothing, because a refine that never started is
  // not a refine that was turned down.
  stood?: boolean;
}

// The one place that decides whether an answer is safe to save. Every reason
// is named, because "it did nothing" with no reason is the complaint this
// feature would otherwise generate.
// The whole read of an answer: unwrap it first, then judge what was inside. A
// model that wrapped its rewrite correctly is never failed for the sentence it
// wrote around the tags, and one cut off mid-rewrite is caught by the opening
// tag with nothing closing it rather than saved half-written.
function judge(answer: any, original: string): Verdict {
  const got = unwrapOutput(String(answer == null ? '' : answer));
  if (wrapOutput && got.tagged && !got.text)
    return { ok: false, text: '', why: 'the rewrite was cut off before it finished', notes: got.outside };
  const out = judgeInner(got.text, original);
  if (got.outside) out.notes = got.outside;
  return out;
}

function judgeInner(answer: any, original: string): Verdict {
  const raw = String(answer == null ? '' : answer);
  const text = unwrapQuotes(unfence(stripThinkingFrom(raw))).trim();
  const orig = original.trim();

  if (!text) return { ok: false, text: '', why: 'the model sent nothing back' };
  // Not a failure. The prompt says a passage that already reads well comes back
  // exactly as it was, so a model that hands it back is doing what it was told:
  // calling that "the model changed nothing" reported the extension's own
  // instruction as a fault, and on a short piece of writing, which is most of
  // what an input box holds, it was the usual answer.
  if (text === orig)
    return { ok: false, text: '', why: 'it already read well, so nothing was changed', same: true };
  if (guardPreamble && PREAMBLE.test(text))
    return { ok: false, text: '', why: 'the model wrote about the edit instead of making it' };
  // Only a short answer. A long one that happens to carry the words is a scene
  // rather than a refusal, which is the same call Auto Retry makes with its own
  // character cap.
  if (guardRefusal && text.length < 600 && looksLikeRefusal(text))
    return { ok: false, text: '', why: 'the model declined to rewrite it' };
  const soft = softenedAway(orig, text);
  if (soft.length)
    return {
      ok: false,
      text: '',
      why:
        'the rewrite softened the reply, dropping ' +
        soft.slice(0, 4).join(', ') +
        (soft.length > 4 ? ' and ' + (soft.length - 4) + ' more' : ''),
    };

  // Length. A refine that doubles a reply has written new scene, and one that
  // halves it has thrown writing away. Both are judged against what the reader
  // set, and both leave the reply as it was.
  //
  // A share of a short passage is a handful of characters, and refining one
  // sentence out of a reply hands over a short passage. Sixty per cent of eleven
  // characters is six, which refuses every rewrite of "it was fine" that is not
  // the same length as it. So the allowance is the share or a floor in
  // characters, whichever is larger: a passage long enough for the share to
  // matter is judged by the share exactly as before, and a short one is judged
  // by something that leaves room to write.
  const room = Math.max(GROW_FLOOR, (orig.length * maxGrowthPct) / 100);
  const cut = Math.max(SHRINK_FLOOR, (orig.length * minShrinkPct) / 100);
  const by = text.length - orig.length;
  const grew = orig.length > 0 ? (by / orig.length) * 100 : 0;
  if (maxGrowthPct > 0 && by > room)
    return {
      ok: false,
      text: '',
      why: 'the rewrite was ' + Math.round(grew) + '% longer, over the limit you set',
    };
  if (minShrinkPct > 0 && -by > cut)
    return {
      ok: false,
      text: '',
      why: 'the rewrite was ' + Math.round(-grew) + '% shorter, over the limit you set',
    };

  return { ok: true, text: text, why: '' };
}

// ---- what the model is told about the scene ----
// A rewrite with no idea who is speaking or what just happened is the reason
// refinement goes wrong: it smooths the prose and loses the person. So the card
// and the run-up go in the prompt. Both are optional. Either lookup can be
// refused, come back empty, or belong to a chat with no card at all, and a
// refine still has to work in all three cases, so nothing here throws upward.

// The parts of a card worth sending. A card holds more than this, but a greeting
// and an example exchange are writing samples, and sending those to a model told
// to rewrite invites it to copy them into the reply.
const CARD_FIELDS: Array<[string, string]> = [
  ['name', 'Name'],
  ['description', 'Description'],
  ['personality', 'Personality'],
  ['scenario', 'Scenario'],
];
const CARD_MAX = 4000;      // per field, in characters

function clip(s: any, max: number): string {
  const t = String(s == null ? '' : s).trim();
  return t.length > max ? t.slice(0, max).trimEnd() + '…' : t;
}

// The character card as plain text, and the name on its own so the history can
// label who is talking. Empty on any refusal, which is the normal case for a
// reader who has not granted the characters permission.
async function gatherCard(
  chatId: string,
  userId?: string,
): Promise<{ text: string; name: string; id: string }> {
  const empty = { text: '', name: '', id: '' };
  try {
    if (!spindle.chats || typeof spindle.chats.get !== 'function') return empty;
    const chat = await spindle.chats.get(chatId, userId);
    // A chat can hold several cards; character_id names the one it belongs to,
    // and that is the one being rewritten.
    const cardId = chat && chat.character_id;
    if (!cardId) return empty;
    if (!spindle.characters || typeof spindle.characters.get !== 'function') return empty;
    const card = await spindle.characters.get(cardId, userId);
    if (!card) return empty;
    const lines: string[] = [];
    for (const pair of CARD_FIELDS) {
      const v = clip(card[pair[0]], CARD_MAX);
      if (v) lines.push(pair[1] + ': ' + v);
    }
    return { text: lines.join('\n\n'), name: String(card.name || '').trim(), id: String(cardId) };
  } catch (_) {
    // No permission, no such chat, or the host said no. The refine goes ahead
    // without a card rather than failing over one.
    return empty;
  }
}

// The messages leading up to the one being rewritten, oldest first, labelled so
// the model can tell the two voices apart. The message itself is not in here:
// it arrives as its own block, and sending it twice teaches the model that
// repeating it is what the answer looks like.
async function gatherHistory(
  msgs: any[],
  at: number,
  charName: string,
  userId?: string,
): Promise<string> {
  const want = Math.max(0, Math.min(40, Number(contextMessages) || 0));
  if (!want || at <= 0) return '';
  const them = charName || 'Character';
  const out: string[] = [];
  // Backwards from the message being refined, because the turn just before it
  // matters more than one twenty turns ago, and the budget runs out from the
  // far end rather than the near one.
  for (let i = at - 1; i >= 0 && out.length < want; i--) {
    const m = msgs[i];
    if (!m || (m.role !== 'assistant' && m.role !== 'user')) continue;
    const body = String(m.content == null ? '' : m.content).trim();
    if (!body) continue;
    // The label the prompts use for the reader, so the run-up and the prompt
    // above it never name the same person two ways.
    out.push((m.role === 'user' ? 'Co-author' : them) + ': ' + body);
  }
  const kept = await fitToBudget(out, maxHistoryTokens, userId);
  return kept.reverse().join('\n\n');
}

// The lorebook entries the host says are active for this chat. Read through the
// host rather than matched here: it already decides which entries a chat has
// switched on and which of those the recent messages triggered, and a second
// opinion on that would quietly disagree with the one the chat itself uses.
const LORE_ENTRIES_MAX = 24;
// Budgets in tokens, which is the unit a context window is actually measured
// in. Characters were a stand-in for it and a poor one: the same 8000
// characters is wildly different depending on the language and the formatting.
let maxLoreTokens = 2500;
let maxHistoryTokens = 4500;

// The host's own tokeniser when it will answer, and the usual estimate when it
// will not. Roughly four characters a token is close enough for a budget, and
// being approximate here costs a few tokens either way rather than anything
// that matters.
async function countTokens(text: string, userId?: string): Promise<number> {
  const guess = Math.ceil(String(text || '').length / 4);
  try {
    if (!spindle.tokens || typeof spindle.tokens.countText !== 'function') return guess;
    const got = await spindle.tokens.countText(text, { userId: userId });
    const n = got && Number(got.total_tokens);
    return Number.isFinite(n) && n > 0 ? n : guess;
  } catch (_) {
    return guess;
  }
}

// What the refine running right now has put through the model, added up across
// however many asks it took. Keyed by account, because one backend serves every
// account on the server and a shared total would report somebody else's spend.
const usedRun = new Map<string, { sent: number; back: number; counted: boolean }>();
function startUsed(userId?: string) {
  usedRun.set(String(userId || ''), { sent: 0, back: 0, counted: true });
}

// The same count, carrying the news of where the number came from. A count and
// a guess are different things to act on, so anything that puts a token figure
// in front of a reader has to be able to say which of the two it is holding.
async function countSaying(
  text: string,
  userId?: string,
): Promise<{ n: number; counted: boolean }> {
  const guess = Math.ceil(String(text || '').length / 4);
  try {
    if (!spindle.tokens || typeof spindle.tokens.countText !== 'function')
      return { n: guess, counted: false };
    const got = await spindle.tokens.countText(text, { userId: userId });
    const n = got && Number(got.total_tokens);
    return Number.isFinite(n) && n > 0 ? { n: n, counted: true } : { n: guess, counted: false };
  } catch (_) {
    return { n: guess, counted: false };
  }
}

// A whole request, message by message. One message answered from the estimate
// makes the total an estimate: a number that is three quarters counted is still
// not one to read as exact.
async function countRequest(
  texts: string[],
  userId?: string,
): Promise<{ per: number[]; total: number; counted: boolean }> {
  const per: number[] = [];
  let counted = true;
  let total = 0;
  for (const one of texts) {
    const got = await countSaying(one, userId);
    if (!got.counted) counted = false;
    per.push(got.n);
    total += got.n;
  }
  return { per: per, total: total, counted: counted };
}

// Adds pieces until the budget runs out. Whole pieces only: half a lorebook
// entry or half a message is worse than one fewer of them.
async function fitToBudget(
  pieces: string[],
  budget: number,
  userId?: string,
): Promise<string[]> {
  if (budget <= 0) return [];
  const out: string[] = [];
  let used = 0;
  for (const one of pieces) {
    const cost = await countTokens(one, userId);
    if (used + cost > budget) break;
    used += cost;
    out.push(one);
  }
  return out;
}

// What Lumiverse remembers of this chat beyond the messages in the run-up.
// Handed over already written out by the host, which is the point of asking for
// it rather than assembling something here: formatted is built from the
// reader's own header and chunk templates, so what a refine is shown is what
// their chat is shown.
//
// Asked for through chats rather than through memories. The two are documented
// as the same call, and this one is covered by a permission the extension
// already holds: the other would put a second approval in front of every reader
// for a thing they have already said yes to.
//
// How many pieces to fetch is not passed. The count is the reader's own chat
// memory setting, and overriding it here would mean their chat and their refine
// were working from different amounts of the same thing.
// The phrases this chat has worn out, written out for a prompt. Read from replies
// already in hand, so this costs no call of its own.
//
// Your own messages are left out. This is about the model's habits, and your
// writing is not the thing being rewritten here.
function gatherWorn(msgs: any[], upTo: number, name?: string): string {
  if (!wornOn) return '';
  const replies: string[] = [];
  const until = upTo >= 0 ? upTo : msgs.length;
  for (let i = until - 1; i >= 0 && replies.length < wornBack; i--) {
    const m = msgs[i];
    if (!m || m.role === 'user') continue;
    const body = String(m.content == null ? '' : m.content).trim();
    if (body) replies.push(body);
  }
  if (replies.length < wornLeast) return '';
  const worn = overusedIn(replies, { least: wornLeast, names: name ? [name] : [] });
  const lines: string[] = [];
  for (const one of worn) {
    if (wornFine.indexOf(one.phrase) >= 0) continue;
    lines.push(one.phrase + ' (' + one.replies + ' replies)');
    if (lines.length >= WORN_SHOWN) break;
  }
  return lines.join('\n');
}

async function gatherMemory(chatId: string, userId?: string): Promise<string> {
  try {
    const chats = spindle.chats;
    if (!chats || typeof chats.getMemories !== 'function') return '';
    const got = await chats.getMemories(chatId, { userId: userId });
    // Switched off for this chat is not the same as nothing to say, and neither
    // is worth a heading around nothing, so both answer the same way here.
    if (!got || got.enabled === false) return '';
    return String(got.formatted == null ? '' : got.formatted).trim();
  } catch (_) {
    // Memory switched off, no embedding set up, or a Lumiverse without it. A
    // refine reads perfectly well without this, so it goes ahead.
    return '';
  }
}

async function gatherLore(chatId: string, userId?: string): Promise<string> {
  try {
    const books = spindle.world_books;
    if (!books || typeof books.getActivated !== 'function') return '';
    const on = await books.getActivated(chatId, userId);
    if (!Array.isArray(on) || !on.length) return '';
    const out: string[] = [];
    for (const hit of on.slice(0, LORE_ENTRIES_MAX)) {
      if (!hit || !hit.id) continue;
      let entry: any = null;
      try {
        entry = books.entries && typeof books.entries.get === 'function'
          ? await books.entries.get(hit.id, userId)
          : null;
      } catch (_) {
        // One entry that will not load is not a reason to send no lore at all.
        continue;
      }
      const body = String(
        (entry && (entry.content != null ? entry.content : entry.text)) || '',
      ).trim();
      if (!body) continue;
      const name = String((entry && (entry.name || entry.comment)) || '').trim();
      out.push(name ? name + ': ' + body : body);
    }
    // Trimmed to the budget rather than to a character count, whole entries at
    // a time.
    return (await fitToBudget(out, maxLoreTokens, userId)).join('\n\n');
  } catch (_) {
    // No permission, or a host without lorebooks. Refine without it.
    return '';
  }
}

// How much thinking the refine asks for. Three answers, and the middle one is
// the reader saying "whatever I already set", which is why it sends nothing at
// all rather than a value that would override it.
const EFFORTS = ['auto', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

function reasoningFor(): any {
  if (thinkingMode === 'off') return { source: 'off' };
  if (thinkingMode === 'custom')
    return {
      source: 'custom',
      effort: EFFORTS.indexOf(thinkingEffort) >= 0 ? thinkingEffort : 'medium',
    };
  return null;
}

// ---- sampler values ----
// An allow-list rather than passing the panel's object straight through. The
// bounds are the sane range for each one, and a value outside it is clamped
// rather than dropped: somebody who typed 5 into temperature meant the top of
// the range, and silently sending nothing would look like the setting is
// broken. Anything not on this list never reaches the request.
const SAMPLERS: Array<{ id: string; min: number; max: number; whole?: boolean }> = [
  { id: 'temperature', min: 0, max: 2 },
  { id: 'top_p', min: 0, max: 1 },
  { id: 'top_k', min: 0, max: 500, whole: true },
  { id: 'min_p', min: 0, max: 1 },
  { id: 'max_tokens', min: 1, max: 200000, whole: true },
  // What the provider is told the window is. Passed through under the name
  // most of them use; one that calls it something else ignores it, which is
  // the same thing that happens to any sampler a provider does not take.
  { id: 'max_context', min: 512, max: 2000000, whole: true },
  { id: 'frequency_penalty', min: -2, max: 2 },
  { id: 'presence_penalty', min: -2, max: 2 },
  { id: 'repetition_penalty', min: 0, max: 2 },
];

function cleanSamplers(): Record<string, number> | null {
  const out: Record<string, number> = {};
  let any = false;
  const src = samplers && typeof samplers === 'object' ? samplers : {};
  for (const s of SAMPLERS) {
    const raw = src[s.id];
    // Blank is the reader leaving it to the connection, and is not the same as
    // zero. Only a value they actually typed is sent.
    if (raw === '' || raw == null) continue;
    let n = Number(raw);
    if (!Number.isFinite(n)) continue;
    n = Math.min(s.max, Math.max(s.min, n));
    if (s.whole) n = Math.round(n);
    out[s.id] = n;
    any = true;
  }
  return any ? out : null;
}

// ---- stopping one ----
// The refines in flight, per reader, so a stop can reach the one that is
// running. The controller was only ever wired to the timeout, which meant a
// refine could be waited out but never called off: a slow model held the button
// spinning for the full ninety seconds with nothing to do about it.
//
// Keyed by reader rather than globally, or one person's stop would abort
// somebody else's refine on a server with several accounts on it.
const running = new Map<string, Set<any>>();

function holdRun(userId: string | undefined, controller: any): void {
  if (!controller) return;
  const k = String(userId == null ? '' : userId);
  const set = running.get(k) || new Set<any>();
  set.add(controller);
  running.set(k, set);
}

function dropRun(userId: string | undefined, controller: any): void {
  if (!controller) return;
  const k = String(userId == null ? '' : userId);
  const set = running.get(k);
  if (!set) return;
  set.delete(controller);
  if (!set.size) running.delete(k);
}

// Readers who have asked a sweep of the whole chat to stop. Separate from the
// controllers above, which end one call: a sweep is a queue, and aborting the
// call it happens to be on would only send it to the next message. This is read
// between messages, so the sweep ends where nothing is half written.
const stopAll = new Set<string>();

// Returns how many were stopped, so the panel can say nothing was running
// rather than claiming it stopped something.
function stopRuns(userId: string | undefined): number {
  const k = String(userId == null ? '' : userId);
  let set = running.get(k);
  // Nothing under the reader's own key. The automatic pass runs under whatever
  // id the generation event carried, and not every build puts one on it, so its
  // refine is held unattributed. An unattributed run has no other claimant, and
  // leaving it to the timeout is the only other answer: the reader who pressed
  // stop gets it.
  if ((!set || !set.size) && k !== '') set = running.get('');
  if (!set || !set.size) return 0;
  let n = 0;
  for (const c of Array.from(set)) {
    try {
      c.__arfWhy = 'stopped';
      c.abort();
      n++;
    } catch (_) {}
  }
  set.clear();
  return n;
}

// A wait, ended early by Stop. Held in the same place a call in flight is held,
// so the button that calls off a refine also calls off the pause in front of
// one: a reader watching "trying again in 40s" who presses stop means now, not
// in forty seconds.
//
// Answers true when the wait ran its course and false when it was cut short.
function pause(ms: number, userId?: string): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    let timer: any = null;
    let handle: any = null;
    const finish = (ranOut: boolean) => {
      if (done) return;
      done = true;
      try { clearTimeout(timer); } catch (_) {}
      dropRun(userId, handle);
      resolve(ranOut);
    };
    handle = { abort: () => finish(false) };
    holdRun(userId, handle);
    timer = setTimeout(() => finish(true), Math.max(0, ms));
  });
}

// ---- running one refine ----
async function askModel(
  text: string,
  isUser: boolean,
  scene: Scene,
  userId?: string,
): Promise<{ content: string; error: string }> {
  const controller: any = typeof (globalThis as any).AbortController === 'function'
    ? new (globalThis as any).AbortController()
    : null;
  const secs = Number(timeoutSecs);
  // Zero is off, and waits for as long as the model takes. A reasoning model on
  // a high effort level can think for minutes before it writes a character, and
  // a cap that fires mid-thought throws away work that was about to arrive.
  const ms = !Number.isFinite(secs)
    ? 90000
    : secs <= 0
      ? 0
      : Math.min(3600, Math.max(5, secs)) * 1000;
  let timer: any = null;
  if (controller) {
    controller.__arfWhy = '';
    // Held whether or not there is a timer, because this is also what Stop
    // reaches for, and with the timeout off it is the only way to end a run.
    holdRun(userId, controller);
    if (ms)
      timer = setTimeout(() => {
        try {
          controller.__arfWhy = 'timeout';
          controller.abort();
        } catch (_) {}
      }, ms);
  }
  try {
    const req: any = { messages: await buildPrompt(text, isUser, scene, userId) };
    // What this one refine put through the model, sent on once the answer is
    // in. Not awaited: counting is worth a line in the panel and is not worth
    // holding the rewrite behind, and a count that never arrives leaves the
    // panel showing the last one rather than showing nothing.
    const reportUsed = (answer: string) => {
      const asked = req.messages.map((m: any) => String((m && m.content) || '')).join('\n');
      // The run this answer belongs to, taken before the counting starts. A
      // count that comes back after the next refine has begun belongs to a
      // refine that is over, and adding it to the new one would report somebody
      // the previous reply's tokens on top of this one's.
      const key = String(userId || '');
      const run = usedRun.get(key);
      if (!run) return;
      Promise.all([countSaying(asked, userId), countSaying(answer, userId)])
        .then(([sent, back]) => {
          if (usedRun.get(key) !== run) return;
          run.sent += sent.n;
          run.back += back.n;
          if (!sent.counted || !back.counted) run.counted = false;
          tell(userId, {
            type: 'refine_used',
            at: Date.now(),
            sent: run.sent,
            back: run.back,
            counted: run.counted,
          });
        })
        .catch(() => {});
    };
    // Only the values the reader actually changed. An empty object is left out
    // so the connection's own preset stays in charge, which is what somebody
    // who never opened the sampler section expects.
    const params = cleanSamplers();
    if (params) req.parameters = params;
    // The connection the reader picked for refining, which is the point of
    // being able to pick one: a rewrite does not need the model you roleplay
    // with, and running it on a cheaper one is most of the saving.
    if (connectionId) req.connection_id = connectionId;
    // Who the call is for. Without it an operator-scoped install refuses the
    // whole request with "userId is required for operator-scoped extensions",
    // which is a refusal rather than a fault and read as a broken rule.
    if (userId) req.userId = userId;
    // Off by default. A rewrite is not a reasoning problem, and paying for
    // extended thinking on every reply is the cost nobody notices until the
    // bill arrives. Inherit leaves the field off entirely, which is what hands
    // the question back to the connection's own settings.
    const think = reasoningFor();
    if (think) req.reasoning = think;
    if (controller) req.signal = controller.signal;

    // Streamed when the host can, and not otherwise. Nothing about the refine
    // changes either way: the whole answer is judged when it is complete. What
    // streaming buys is the panel being able to say "writing, 300 characters"
    // instead of sitting silent for forty seconds, which is the difference
    // between slow and broken.
    const canStream =
      streamProgress &&
      spindle.generate &&
      typeof spindle.generate.quietStream === 'function';
    if (canStream) {
      let text = '';
      let said = 0;
      try {
        const flow = await spindle.generate.quietStream(req);
        for await (const bit of flow) {
          const piece =
            typeof bit === 'string'
              ? bit
              : String((bit && (bit.content || bit.delta || bit.text)) || '');
          if (!piece) continue;
          text += piece;
          // Reported at most a few times a second: a token-by-token message to
          // the frontend would cost more than the refine.
          const now = Date.now();
          if (now - said > 300) {
            said = now;
            // The length, and the working, and not the rewrite.
            //
            // The rewrite is what the card shows when the refine lands, marked
            // against what was there before, so streaming it as well would be
            // sending the same words twice. The working is different: it is
            // written before the rewrite and is gone by the time anything
            // lands, so if it is not sent while it is happening it cannot be
            // seen at all.
            tell(userId, {
              type: 'refine_progress',
              stage: 'writing',
              chars: text.length,
              notes: workingSoFar(text),
            });
          }
        }
        reportUsed(text);
        return { content: text, error: '' };
      } catch (e: any) {
        // A host that has the method but cannot stream this connection. Fall
        // through to the plain call rather than failing the refine.
        if (e && e.name === 'AbortError') throw e;
        say('warn', 'streaming failed, falling back: ' + ((e && e.message) || 'no reason given'));
      }
    }

    tell(userId, { type: 'refine_progress', stage: thinkingMode === 'off' ? 'asking' : 'thinking' });
    const result = await spindle.generate.quiet(req);
    const answer = String((result && result.content) || '');
    reportUsed(answer);
    return { content: answer, error: '' };
  } catch (e: any) {
    const msg = (e && e.message) || String(e);
    if (e && e.name === 'AbortError') {
      // Two things abort this, and they are not the same news. A timeout is the
      // model failing to answer; a stop is the reader deciding they did not
      // want it after all, which is not a fault and should not read as one.
      const why = controller && controller.__arfWhy;
      if (why === 'stopped') return { content: '', error: 'you stopped it' };
      return { content: '', error: 'the model did not answer within ' + Math.round(ms / 1000) + 's' };
    }
    if (typeof msg === 'string' && msg.indexOf('PERMISSION_DENIED:') === 0)
      return { content: '', error: 'the generation permission is not granted' };
    // A refusal that reads as a bug in your rules unless it is named.
    if (typeof msg === 'string' && msg.indexOf('userId is required') >= 0)
      return {
        content: '',
        error:
          'Lumiverse could not tell which account this refine was for. Reload the page, and if it keeps happening it is worth reporting.',
      };
    return { content: '', error: msg };
  } finally {
    if (timer != null) clearTimeout(timer);
    dropRun(userId, controller);
  }
}

// The greeting is the first message when it is the assistant's, and it is never
// refined. Read from the chat rather than assumed, because a chat that opens on
// a user message has no greeting at all.
function greetingIdOf(msgs: any[]): any {
  return msgs && msgs.length && msgs[0] && msgs[0].role === 'assistant' ? msgs[0].id : null;
}

// The last thing the character said, which is what "the latest reply" means.
// The greeting is skipped because it is never refined, so a chat holding only a
// greeting answers no rather than offering the one message that will always be
// refused.
function latestReply(msgs: any[], greetingId: any): any {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (!m || m.role !== 'assistant') continue;
    if (greetingId != null && m.id === greetingId) continue;
    if (!String(m.content == null ? '' : m.content).trim()) continue;
    return m;
  }
  return null;
}

async function refineMessage(
  chatId: string,
  messageId: any,
  userId?: string,
  byHand?: boolean,
  // Set when a refine was asked for on part of a reply rather than the whole of
  // it. text is what the selection read as on screen, ordinal says how many
  // identical runs came before it.
  pick?: { text: string; ordinal?: number },
): Promise<RefineOutcome> {
  if (!masterOn) return { ok: false, why: 'Auto Refine is switched off' };
  if (chatsOff.has(String(chatId)))
    return { ok: false, why: 'Auto Refine is switched off in this chat' };
  let msgs: any[] = [];
  try {
    msgs = await spindle.chat.getMessages(chatId);
  } catch (e: any) {
    return { ok: false, why: 'the chat could not be read: ' + ((e && e.message) || 'no reason given') };
  }
  if (!Array.isArray(msgs) || !msgs.length) return { ok: false, why: 'the chat came back empty' };

  const greetingId = greetingIdOf(msgs);
  // No id means "the latest reply", which is what the panel's button and the
  // floating button are both named. They send no id whenever nothing has
  // rendered since the page loaded, which on a chat you opened and did not add
  // to is every time. Left to fall through the lookup below it comes back as
  // "that message is not in this chat any more", so the button does nothing and
  // says something untrue about why.
  //
  // Resolved here rather than in the panel because this is the side holding the
  // messages. The panel only knows what it happened to watch arrive.
  const m =
    messageId == null || messageId === ''
      ? latestReply(msgs, greetingId)
      : msgs.find((x: any) => x && x.id === messageId) || null;
  if (!m)
    return {
      ok: false,
      why:
        messageId == null || messageId === ''
          ? 'there is no reply in this chat to refine yet'
          : 'that message is not in this chat any more',
    };
  if (m.id === greetingId)
    return { ok: false, why: 'the greeting is written by a person, so it is never refined' };
  if (m.role !== 'assistant' && m.role !== 'user')
    return { ok: false, why: 'only replies and your own messages can be refined' };
  // Never on the automatic pass. That pass fires off a reply arriving, and
  // rewriting what the reader just typed because the character answered it is
  // not something to do without being asked.
  //
  // By hand it goes ahead with no setting in the way. There was a switch here
  // and it was asking the same question twice: pressing the refine button on
  // your own message is already you asking for exactly this.
  if (m.role === 'user' && !byHand)
    return { ok: false, why: 'your own messages are only refined when you ask for one' };

  // Checked here rather than at the top, because which prompt is used depends
  // on whose message this is and the two can be in different states.
  // Told apart from a prompt that is there and wrong, because the answer is
  // different: this one clears itself the moment the panel is open.
  if (!activeBlocks(m.role === 'user').length)
    return {
      ok: false,
      why: 'your prompt has not reached the backend yet, so nothing was sent. Opening the Auto Refine tab hands it over',
    };
  if (!promptHasTurn(m.role === 'user'))
    return {
      ok: false,
      why:
        'no block in your ' +
        (m.role === 'user' ? 'own-messages prompt' : 'prompt') +
        ' contains {{message}}, so the model would never see it',
    };

  const original = String(m.content == null ? '' : m.content);
  if (!original.trim()) return { ok: false, why: 'that message is empty' };

  // Still holding the refine it was already given, so there is nothing new to
  // do with it. Asked here, against the text in front of us, rather than off
  // the message id: a swipe, a regenerate, a deleted swipe and an edit all
  // leave the id alone and put different words behind it, and every one of
  // those is a reply this pass has never seen. Auto Retry re-rolling a refusal
  // is that case, several times in a row.
  //
  // By hand goes ahead whatever the mark says. Pressing the button on a reply
  // is somebody asking for this one, now.
  if (!byHand && !refineAgain && refined.get(String(m.id)) === markOf(original))
    return { ok: false, stood: true, why: 'this reply is still holding the refine it was given' };

  // The ceiling above. Only the automatic pass counts against it: pressing the
  // button is somebody asking for this one, now, and a person pressing a button
  // twelve times is not a loop.
  if (!byHand && (passes.get(String(m.id)) || 0) >= PASS_CEILING)
    return {
      ok: false,
      stood: true,
      why:
        'this reply has been refined ' +
        PASS_CEILING +
        ' times already, so the automatic pass has stopped on it. Press the button if you want another',
    };


  // Who this is and what led up to it. Both are best-effort: a chat with no
  // card, or a reader who has not granted the two read permissions, refines
  // with the blocks left out rather than not refining at all.
  //
  // Only what the prompt is going to use. The card is read either way, because
  // its name is what the run-up is written with whether or not a block shows
  // the description.
  const isUser = m.role === 'user';
  const card = await gatherCard(chatId, userId);
  const at = msgs.findIndex((x: any) => x && x.id === m.id);
  let scene: Scene = {
    character: card.text,
    context: promptWants(HISTORY_MACRO, isUser) ? await gatherHistory(msgs, at, card.name, userId) : '',
    lore: promptWants(LORE_MACRO, isUser) ? await gatherLore(chatId, userId) : '',
    memory: promptWants(MEMORY_MACRO, isUser) ? await gatherMemory(chatId, userId) : '',
    worn: promptWants(OVERUSED_MACRO, isUser) ? gatherWorn(msgs, at, card.name) : '',
    name: card.name,
    chatId: chatId,
    characterId: card.id,
  };

  // The model's own working is cut off rather than sent. It is not prose, and a
  // rewrite of it would be invisible in the place people look.
  const split = splitThinking(original);
  // Where the selection sits in the body. Worked out against the body rather
  // than the whole message, because the model's own working is in front of it
  // and counting through that would put every offset out by its length.
  let pickAt: { start: number; end: number } | null = null;
  if (pick && String(pick.text || '').trim()) {
    pickAt = pickedSpan(split.body, String(pick.text), pick.ordinal);
    if (!pickAt)
      return {
        ok: false,
        why: 'what you selected is not in that reply any more, so nothing was sent',
      };
  }
  // What the model is actually given. A selection hands over the part you picked
  // and nothing else, so every check on the answer, its length included, is
  // measured against the part rather than the reply around it.
  const target = pickAt ? split.body.slice(pickAt.start, pickAt.end) : split.body;
  // Markup is lifted out and stood in for, so the model cannot mangle what it
  // was never meant to touch.
  const armed = shield(target);
  if (armed.parts.length) scene = { ...scene, shieldNote: SHIELD_NOTE };
  // The reply the selection came out of, with the part being rewritten marked,
  // so a prompt can show the model what surrounds the fragment it was given.
  // Left unset on an ordinary refine, which keeps the block carrying it out of
  // the prompt rather than sending an empty heading.
  if (pickAt)
    scene = {
      ...scene,
      wholeReply:
        split.body.slice(0, pickAt.start) +
        '<<<' +
        split.body.slice(pickAt.start, pickAt.end) +
        '>>>' +
        split.body.slice(pickAt.end),
    };

  // Asked, judged, and asked again when the answer failed a check. A refusal, a
  // preamble or a softened rewrite is usually the same model having a bad turn
  // rather than a settled opinion, and the same request often comes back clean.
  // Off by default, because every extra ask is another call on the bill.
  //
  // Only the checks a second try could fix are retried. A rewrite refused for
  // being too long is a rewrite the model meant, and asking again for the same
  // thing is spending money to be told the same answer.
  // Something is being written in this chat right now. The reply in front of us
  // is on its way out: Auto Retry swipes a refusal, the reader presses
  // regenerate, or the next turn has already started. Refining it would spend a
  // call on writing nobody is going to read.
  //
  // Asked here rather than at the top of this function. Everything above is
  // reads: the chat, the card, the run-up, the lorebook, the memory, several
  // round trips of them, and the swipe that makes this pointless usually lands
  // during those rather than before them. This is the last point before any
  // money is spent.
  if (!byHand && generating.has(String(chatId)))
    return { ok: false, stood: true, why: 'another reply is being written in this chat, so this one was left' };

  let verdict: Verdict = { ok: false, text: '', why: 'nothing was tried' };
  let notes = '';
  // A refine is allowed more than one call, so what it used is the run rather
  // than the last ask. Cleared here and added to by each one, or a panel would
  // report a retried refine at a quarter of what it cost.
  startUsed(userId);
  const tries = 1 + (Number.isFinite(retryRefine) ? Math.min(3, Math.max(0, retryRefine)) : 0);
  // Two counters, because they are two different things. asks is how many
  // answers there have been to judge, which is what the retry setting limits
  // and what the bill is made of. waits is how many times the provider refused
  // to answer at all, which cost nothing and are limited separately.
  let asks = 0;
  let waits = 0;
  while (true) {
    if (asks > 0) {
      tell(userId, { type: 'refine_progress', stage: 'retrying', attempt: asks + 1, of: tries });
      say('info', 'asking again after: ' + verdict.why);
    }
    tell(userId, { type: 'refine_progress', stage: thinkingMode === 'off' ? 'asking' : 'thinking' });
    const answer = await askModel(armed.text, m.role === 'user', scene, userId);
    if (answer.error) {
      // The provider would not take the call. Waiting is what fixes that, and
      // nothing has been spent, so it is worth waiting for: a free tier meters
      // per minute and a local server answers 503 while it loads a model, and
      // both clear on their own. A wrong key does not, and is not waited on.
      if (waits < rateWaits && rateLimited(answer.error)) {
        waits++;
        const ms = rateWait(waits, answer.error);
        say('info', 'the provider would not take the call, waiting ' + Math.round(ms / 1000) + 's: ' + answer.error);
        tell(userId, {
          type: 'refine_progress',
          stage: 'waiting',
          waitMs: ms,
          attempt: waits,
          of: rateWaits,
          why: String(answer.error),
        });
        if (!(await pause(ms, userId)))
          return { ok: false, stood: true, notes: notes, why: 'stopped while waiting out a rate limit' };
        continue;
      }
      // Anything else is the call failing rather than the answer being wrong,
      // and asking again would fail the same way. A stop especially: asking
      // again is the opposite of what was asked for.
      return { ok: false, why: answer.error, notes: notes };
    }
    asks++;
    tell(userId, { type: 'refine_progress', stage: 'checking' });

    // Judged against the text that was actually sent, so a message that is half
    // markup is not called "too short" for the tokens standing in for it.
    verdict = judge(answer.content, armed.text);
    // Whatever the model wrote around the tags travels with every answer from
    // here on, refused ones included. A prompt that asked for a report on what
    // was cut wants that report most on the pass that was turned down.
    if (verdict.notes) notes = verdict.notes;
    if (verdict.ok) break;
    if (verdict.same) break;
    if (!worthRetrying(verdict.why)) break;
    if (asks >= tries) break;
  }
  if (!verdict.ok)
    return { ok: false, why: verdict.why, notes: notes, same: !!verdict.same };

  // Asked again now the model has finished. The call takes seconds, and in
  // those seconds Auto Retry can decide the reply was a refusal and swipe it,
  // or the reader can press regenerate. Either way the rewrite in hand is a
  // rewrite of writing that is being replaced, and saving it would land under
  // whatever is arriving.
  if (generating.has(String(chatId)))
    return {
      ok: false,
      stood: true,
      notes: notes,
      why: 'another reply started while the rewrite was being written, so it was not saved',
    };

  const back = unshield(verdict.text, armed.parts);
  if (back.lost.length)
    return {
      ok: false,
      notes: notes,
      why:
        'the rewrite dropped ' +
        back.lost.length +
        (back.lost.length === 1 ? ' piece' : ' pieces') +
        ' of formatting it was told to keep',
    };
  // The thinking goes back exactly as it was, in front of the rewrite. A
  // selection puts the rewrite back where it came from, with the rest of the
  // reply either side of it untouched.
  const whole = pickAt
    ? split.head + split.body.slice(0, pickAt.start) + back.text + split.body.slice(pickAt.end)
    : split.head + back.text;

  if (confirmBeforeSave) {
    replyTo(userId, {
      type: 'confirm_refine',
      chatId: chatId,
      messageId: messageId,
      before: original,
      after: whole,
      notes: notes,
    });
    return { ok: false, why: 'waiting for you to say yes', notes: notes };
  }

  const saved = await saveRefined(chatId, m, original, whole, userId);
  if (notes) saved.notes = notes;
  return saved;
}

// What a message says right now, or null when it cannot be read. Null means
// proceed: a host that will not answer is not evidence that anything changed,
// and refusing every refine because a read failed is worse than the race.
async function currentContent(chatId: string, messageId: any): Promise<string | null> {
  try {
    const msgs = await spindle.chat.getMessages(chatId);
    if (!Array.isArray(msgs)) return null;
    const m = msgs.find((x: any) => x && x.id === messageId);
    if (!m) return null;
    return String(m.content == null ? '' : m.content);
  } catch (_) {
    return null;
  }
}

async function saveRefined(
  chatId: string,
  m: any,
  original: string,
  next: string,
  userId?: string,
): Promise<RefineOutcome> {
  const k = key(chatId, m.id);
  try {
    // The message is read, sent to a model, and written back, and the model
    // call takes seconds. Anything editing that message in the meantime would
    // be silently reverted by this write: the reader editing the reply while
    // waiting, or another extension writing on the same event.
    //
    // So the message is read again here and the write is refused if it moved.
    // A refine is worth less than somebody else's edit: the refine can be run
    // again on the new text, and the edit cannot be recovered.
    const fresh = await currentContent(chatId, m.id);
    if (fresh !== null && fresh !== original) {
      return {
        ok: false,
        why: 'that message changed while the rewrite was being written, so it was left alone',
      };
    }
    remember(ourWrites, k, next, OURS_MAX);
    remember(passes, String(m.id), (passes.get(String(m.id)) || 0) + 1, PASSES_MAX);
    const patch: any = { content: next };
    // A message can hold several swipes, and the one on screen is the one to
    // write. Writing content alone leaves the active swipe holding the old text
    // on a build that reads swipes first.
    const swipes = m && Array.isArray(m.swipes) ? m.swipes.slice() : null;
    const idx = m && typeof m.swipe_id === 'number' ? m.swipe_id : 0;
    // The rewrite as a reroll beside the reply rather than over it.
    //
    // Put it back is held in memory and gone on reload, which is the right
    // trade for an undo but a poor one for the writing itself: a refine you
    // liked less than the original, noticed a day later, has nothing behind it.
    // A swipe is Lumiverse's own way back, it survives a reload, and the arrows
    // for it are already on the message.
    //
    // Only where the build gives the message a swipe list. Where it does not
    // there is nothing to add to, and writing content alone is the old
    // behaviour, which is what this falls back to.
    let addedAt = -1;
    if (asSwipe && swipes) {
      swipes.push(next);
      addedAt = swipes.length - 1;
      patch.swipes = swipes;
      patch.swipe_id = addedAt;
    } else if (swipes && idx >= 0 && idx < swipes.length) {
      swipes[idx] = next;
      patch.swipes = swipes;
      patch.swipe_id = idx;
    }
    // Written down after the shape of the write is settled, so the way back
    // knows which kind it is undoing.
    if (keepOriginal)
      remember(
        before,
        k,
        addedAt >= 0
          ? { text: original, at: Date.now(), swipeAt: addedAt }
          : { text: original, at: Date.now() },
        BEFORE_MAX,
      );
    await spindle.chat.updateMessage(chatId, m.id, patch);
    remember(refined, String(m.id), markOf(next), REFINED_MAX);
    replyTo(userId, {
      type: 'refined',
      chatId: chatId,
      messageId: m.id,
      before: original,
      after: next,
      canUndo: keepOriginal,
    });
    return { ok: true, why: '' };
  } catch (e: any) {
    return { ok: false, why: 'the message could not be saved: ' + ((e && e.message) || 'no reason given') };
  }
}

// Everything the manifest asks for, so the panel can name what is missing
// rather than saying a permission is missing.
const NEEDED = [
  'generation',
  'chat_mutation',
  'chats',
  'characters',
  'world_books',
  'ui_panels',
];

// ---- the events ----
try {
  spindle.on('GENERATION_STARTED', (p: any) => {
    try { if (p && p.chatId) generating.add(String(p.chatId)); } catch (_) {}
  });
  spindle.on('GENERATION_STOPPED', (p: any) => {
    try { if (p && p.chatId) generating.delete(String(p.chatId)); } catch (_) {}
  });
  spindle.on('GENERATION_ENDED', async (p: any) => {
    try {
      if (!p || !p.chatId) return;
      generating.delete(String(p.chatId));

      // The account this pass is for. GenerationEndedPayloadDTO is the
      // generation, the chat, the message, the content and the error, and no
      // account at all, so there is nothing on the event to prefer over this
      // and no version of Lumiverse where there is. Read once, so the refine
      // and anything it has to say afterwards go to the same place.
      const who = settingsUser;

      // Every way out of this handler from here on says so. The panel turns its
      // spinner on the moment a reply lands, because waiting for this side to
      // answer before showing anything is a second of nothing happening on
      // every turn. That only works while every path answers: a path that
      // returned in silence left the panel spinning until its watchdog gave up
      // five seconds later and reported a backend that was not running, which
      // was untrue and counted against the reader's refused total.
      const stand = (why: string, messageId?: any) => {
        replyTo(who, {
          type: 'refine_stood_down',
          chatId: p.chatId,
          messageId: messageId == null ? null : messageId,
          why: why,
        });
      };

      if (p.error) return stand('the reply itself failed, so there was nothing to refine');
      if (!masterOn) return stand('Auto Refine is switched off');
      if (!refineOn) return stand('the automatic pass is switched off');
      if (chatsOff.has(String(p.chatId))) return stand('Auto Refine is switched off in this chat');

      let messageId = p.messageId;
      if (!messageId) {
        // Not every build puts the id on the end event, so the newest reply
        // stands in. The greeting is ruled out inside refineMessage either way.
        try {
          const msgs = await spindle.chat.getMessages(p.chatId);
          if (Array.isArray(msgs))
            for (let i = msgs.length - 1; i >= 0; i--)
              if (msgs[i] && msgs[i].role === 'assistant') { messageId = msgs[i].id; break; }
        } catch (_) {}
      }
      if (!messageId) return stand('this build named no reply on the event and the chat had none to find');
      // One generation is one reply, however many times it is announced. Where
      // a build names no generation the message id stands in, which is the
      // older guard and the only one available there.
      const run = p.generationId ? 'g:' + String(p.generationId) : 'm:' + String(messageId);
      if (answered.has(run)) return stand('this reply was announced twice, and it was taken the first time', messageId);
      note(answered, run, ANSWERED_MAX);

      let done: RefineOutcome;
      try {
        done = await refineMessage(p.chatId, messageId, who, false);
      } catch (e: any) {
        // Caught here, because a throw that escapes ends the whole handler and
        // leaves the panel sitting busy until the page is reloaded.
        done = { ok: false, why: 'something went wrong: ' + ((e && e.message) || String(e)) };
        say('warn', 'the automatic refine threw: ' + ((e && e.message) || String(e)));
      }
      // Nothing reached a model, so nothing is reported as refused. The reply
      // may well come back round: Auto Retry swipes a refusal and the next one
      // arrives as its own generation, with its own text, which this pass has
      // never seen and does not skip.
      if (done.stood) {
        stand(done.why, messageId);
      } else if (!done.ok && done.why) {
        replyTo(who, {
          type: 'refine_skipped',
          chatId: p.chatId,
          messageId: messageId,
          why: done.why,
          same: !!done.same,
          notes: done.notes || '',
        });
      }
      // A refine that worked still has a report to hand over when the prompt
      // asked for one, and the automatic pass has no other way to show it.
      else if (done.ok && done.notes) {
        replyTo(who, { type: 'refine_notes', chatId: p.chatId, messageId: messageId, notes: done.notes });
      }
    } catch (e: any) {
      say('warn', 'a reply could not be refined: ' + ((e && e.message) || String(e)));
    }
  });
} catch (_) {
  say('warn', 'could not listen for replies. Check that the generation permission is granted.');
}

// ---- the bridge ----
spindle.onFrontendMessage(async (payload: any, userId?: string) => {
  try {
    if (!payload) return;

    // The panel handing over what it has. Adopted and not written anywhere: the
    // account copy is the panel's to keep, and this module coming back up is no
    // reason to write over it.
    if (payload.type === 'set_settings' && payload.settings && typeof payload.settings === 'object') {
      const s = payload.settings;
      settingsUser = userId;
      masterOn = s.enabled !== false;
      refineOn = !!s.refineOn;
      refineAgain = !!s.refineAgain;
      connectionId = String(s.connectionId == null ? '' : s.connectionId);
      thinkingMode =
        s.thinkingMode === 'inherit' || s.thinkingMode === 'custom' ? s.thinkingMode : 'off';
      thinkingEffort = EFFORTS.indexOf(String(s.thinkingEffort)) >= 0 ? String(s.thinkingEffort) : 'medium';
      // Not `|| 90`. Zero is a setting here, meaning never give up, and the
      // short form would have quietly turned it back into a minute and a half.
      timeoutSecs = Number.isFinite(Number(s.timeoutSecs)) ? Number(s.timeoutSecs) : 90;
      maxGrowthPct = Number(s.maxGrowthPct);
      maxGrowthPct = Number.isFinite(maxGrowthPct) ? maxGrowthPct : 60;
      minShrinkPct = Number(s.minShrinkPct);
      minShrinkPct = Number.isFinite(minShrinkPct) ? minShrinkPct : 40;
      keepOriginal = s.keepOriginal !== false;
      confirmBeforeSave = !!s.confirmBeforeSave;
      // The prompt layout. Only a list of block-shaped things is taken; a
      // corrupted or half-written value falls back to the default rather than
      // building a prompt out of whatever came over the bridge.
      userBlocks = Array.isArray(s.userBlocks)
        ? s.userBlocks
            .filter((b: any) => b && typeof b === 'object' && b.id)
            .slice(0, 60)
            .map((b: any) => ({
              id: String(b.id),
              name: b.name == null ? undefined : String(b.name),
              on: b.on !== false,
              role: ROLES.indexOf(String(b.role)) >= 0 ? String(b.role) : 'system',
              text: b.text == null ? '' : String(b.text),
            }))
        : [];
      blocks = Array.isArray(s.blocks)
        ? s.blocks
            .filter((b: any) => b && typeof b === 'object' && b.id)
            .slice(0, 40)
            .map((b: any) => ({
              id: String(b.id),
              name: b.name == null ? undefined : String(b.name),
              on: b.on !== false,
              role: ROLES.indexOf(String(b.role)) >= 0 ? String(b.role) : 'system',
              text: b.text == null ? '' : String(b.text),
            }))
        : [];
      contextMessages = Number(s.contextMessages);
      contextMessages = Number.isFinite(contextMessages) ? contextMessages : 4;
      maxLoreTokens = Number(s.maxLoreTokens);
      maxLoreTokens = Number.isFinite(maxLoreTokens) && maxLoreTokens >= 0 ? maxLoreTokens : 2500;
      maxHistoryTokens = Number(s.maxHistoryTokens);
      maxHistoryTokens =
        Number.isFinite(maxHistoryTokens) && maxHistoryTokens >= 0 ? maxHistoryTokens : 4500;
      samplers = s.samplers && typeof s.samplers === 'object' ? s.samplers : {};
      protectOn = s.protectOn !== false;
      protectThinking = s.protectThinking !== false;
      setThinkTags(s.thinkTags);
      stripAnswerThinking = s.stripAnswerThinking !== false;
      {
        const add = makePatterns(s.shieldAdd, 30);
        const keep = makePatterns(s.shieldKeep, 30);
        shieldAdd = add.list;
        shieldKeep = keep.list;
        const bad = add.bad.concat(keep.bad);
        // Said once, when it is saved. A pattern that cannot compile is a typo
        // the reader can fix, and silently ignoring it is how somebody believes
        // a region is shielded when nothing is shielding it.
        if (bad.length) replyTo(userId, { type: 'shield_bad', patterns: bad });
      }
      guardRefusal = s.guardRefusal !== false;
      guardPreamble = s.guardPreamble !== false;
      guardSoften = s.guardSoften !== false;
      softenPct = Number(s.softenPct);
      softenPct = Number.isFinite(softenPct) ? softenPct : 60;
      setStrong(s.softenWords);
      retryRefine = Number(s.retryRefine);
      retryRefine = Number.isFinite(retryRefine) ? Math.min(3, Math.max(0, retryRefine)) : 0;
      rateWaits = Number(s.rateWaits);
      rateWaits = Number.isFinite(rateWaits) ? Math.min(5, Math.max(0, rateWaits)) : 2;
      asSwipe = !!s.asSwipe;
      wornOn = !!s.wornOn;
      wornBack = Number(s.wornBack);
      wornBack = Number.isFinite(wornBack) && wornBack > 0 ? Math.min(200, Math.floor(wornBack)) : 60;
      wornLeast = Number(s.wornLeast);
      wornLeast = Number.isFinite(wornLeast) && wornLeast >= 2 ? Math.floor(wornLeast) : 3;
      wornFine = Array.isArray(s.wornFine)
        ? s.wornFine.map((x: any) => String(x == null ? '' : x).trim().toLowerCase()).filter(Boolean)
        : [];
      protectInline = !!s.protectInline;
      wrapOutput = s.wrapOutput !== false;
      streamProgress = s.streamProgress !== false;
      // Written to the account as well as held here, so the next browser to
      // ask gets these rather than a fresh install. Failing to write is worth
      // saying out loud: settings that look saved and are not is the worst
      // shape this can take.
      try {
        await writeUserJson(SETTINGS_FILE, s, userId);
      } catch (e: any) {
        say('warn', 'settings could not be saved to the account: ' + ((e && e.message) || String(e)));
        replyTo(userId, { type: 'account_save_failed', what: 'settings' });
      }
      return;
    }

    // The panel asking for the account's copy on load. This is the only path
    // that can read it: the id arrives with a frontend message, and the read
    // that runs at startup has no user to resolve.
    if (payload.type === 'load_settings') {
      let saved: any = null;
      try {
        saved = await readUserJson(SETTINGS_FILE, userId);
      } catch (_) {
        saved = null;
      }
      replyTo(userId, { type: 'loaded_settings', requestId: payload.requestId, settings: saved });
      return;
    }

    if (payload.type === 'save_presets') {
      try {
        await writeUserJson(PRESETS_FILE, payload.presets, userId);
      } catch (e: any) {
        say('warn', 'presets could not be saved to the account: ' + ((e && e.message) || String(e)));
        replyTo(userId, { type: 'account_save_failed', what: 'presets' });
      }
      return;
    }

    if (payload.type === 'load_presets') {
      let saved: any = null;
      try {
        saved = await readUserJson(PRESETS_FILE, userId);
      } catch (_) {
        saved = null;
      }
      replyTo(userId, { type: 'loaded_presets', requestId: payload.requestId, presets: saved });
      return;
    }

    if (payload.type === 'save_setups') {
      try {
        await writeUserJson(SETUPS_FILE, payload.setups, userId);
      } catch (e: any) {
        say('warn', 'model setups could not be saved to the account: ' + ((e && e.message) || String(e)));
        replyTo(userId, { type: 'account_save_failed', what: 'model setups' });
      }
      return;
    }

    if (payload.type === 'load_setups') {
      let saved: any = null;
      try {
        saved = await readUserJson(SETUPS_FILE, userId);
      } catch (_) {
        saved = null;
      }
      replyTo(userId, { type: 'loaded_setups', requestId: payload.requestId, setups: saved });
      return;
    }

    // Stopping whatever is in flight for this reader. Answered even when there
    // was nothing to stop, so the panel can say so rather than claiming it
    // stopped something.
    // A scan of pasted text, with no model call behind it, so it costs nothing
    // to run and answers at once.
    // Every reply already in the chat, oldest first, one at a time.
    //
    // One at a time on purpose. Firing them together would be quicker and would
    // also mean a provider's rate limit turning half a chat into a row of
    // failures with no way to tell which half. In order means the count on
    // screen is true, a stop lands between two messages rather than inside one,
    // and a chat left half done is picked up from the top.
    if (payload.type === 'refine_all') {
      replyTo(userId, { type: 'refine_ack', requestId: payload.requestId });
      const who = String(userId == null ? '' : userId);
      stopAll.delete(who);
      let msgs: any[] = [];
      try {
        msgs = await spindle.chat.getMessages(payload.chatId);
      } catch (e: any) {
        replyTo(userId, {
          type: 'refine_all_done',
          requestId: payload.requestId,
          chatId: payload.chatId,
          saved: 0,
          skipped: 0,
          stopped: false,
          why: 'the chat could not be read: ' + ((e && e.message) || 'no reason given'),
        });
        return;
      }
      const greetingId = greetingIdOf(msgs);
      // Replies only, and never the greeting. Your own messages are refined
      // when you ask for that one, not swept up in a pass over the chat.
      const todo = (Array.isArray(msgs) ? msgs : []).filter(
        (x: any) =>
          x &&
          x.role === 'assistant' &&
          x.id !== greetingId &&
          String(x.content == null ? '' : x.content).trim(),
      );
      let saved = 0;
      let skipped = 0;
      const why: string[] = [];
      for (let i = 0; i < todo.length; i++) {
        // Checked between messages, so a stop ends the run at the next boundary
        // rather than abandoning a rewrite half written.
        if (stopAll.has(who)) break;
        replyTo(userId, {
          type: 'refine_all_progress',
          requestId: payload.requestId,
          chatId: payload.chatId,
          at: i + 1,
          of: todo.length,
          saved: saved,
          skipped: skipped,
        });
        const done = await refineMessage(payload.chatId, todo[i].id, userId, true);
        if (done.ok) saved++;
        else {
          skipped++;
          // The reasons, not one per message. A chat where forty replies all
          // failed the same check is one thing to read, not forty.
          if (done.why && why.indexOf(done.why) < 0 && why.length < 4) why.push(done.why);
        }
      }
      const wasStopped = stopAll.delete(who);
      replyTo(userId, {
        type: 'refine_all_done',
        requestId: payload.requestId,
        chatId: payload.chatId,
        saved: saved,
        skipped: skipped,
        stopped: wasStopped,
        why: why.join('; '),
      });
      return;
    }

    if (payload.type === 'cancel_refine') {
      // Both, because Stop is one button and a reader pressing it means the
      // whole thing: the call in flight, and the queue behind it if there is
      // one. Marked before the abort, or the sweep would move to the next
      // message on the way past.
      stopAll.add(String(userId == null ? '' : userId));
      const n = stopRuns(userId);
      replyTo(userId, { type: 'refine_stopped', requestId: payload.requestId, stopped: n });
      return;
    }

    if (payload.type === 'set_chats_off') {
      const list = Array.isArray(payload.chats) ? payload.chats : [];
      chatsOff = new Set(list.slice(0, 500).map((c: any) => String(c)));
      return;
    }

    // Refine one message on request, which is the path both buttons use.
    if (payload.type === 'refine_now') {
      replyTo(userId, { type: 'refine_ack', requestId: payload.requestId });
      const done = await refineMessage(payload.chatId, payload.messageId, userId, true);
      replyTo(userId, {
        type: 'refine_result',
        requestId: payload.requestId,
        chatId: payload.chatId,
        messageId: payload.messageId,
        ok: done.ok,
        why: done.why,
        same: !!done.same,
        stood: !!done.stood,
        notes: done.notes || '',
      });
      return;
    }

    // The confirmation coming back with a yes.
    // A refine asked for on part of a reply. The same pass as any other, and the
    // same refusals: the only difference is what the model is given and where the
    // answer goes back.
    if (payload.type === 'refine_selection') {
      const picked = String(payload.picked == null ? '' : payload.picked);
      // Nothing picked is not a reason to rewrite the whole reply. Falling
      // through to an ordinary refine here would rewrite the lot on a selection
      // that had already been cleared, which is the one answer nobody asked for.
      if (!picked.trim()) {
        replyTo(userId, {
          type: 'refine_result',
          requestId: payload.requestId,
          chatId: payload.chatId,
          messageId: payload.messageId,
          ok: false,
          why: 'nothing was selected, so nothing was sent',
        });
        return;
      }
      replyTo(userId, { type: 'refine_ack', requestId: payload.requestId });
      // ahead, not before: before already names the original content in
      // apply_refine, and one field meaning two things across two messages is a
      // trap for whoever reads this next.
      const ordinal = ordinalOf(String(payload.ahead == null ? '' : payload.ahead), picked);
      const done = await refineMessage(payload.chatId, payload.messageId, userId, true, {
        text: picked,
        ordinal: ordinal,
      });
      replyTo(userId, {
        type: 'refine_result',
        requestId: payload.requestId,
        chatId: payload.chatId,
        messageId: payload.messageId,
        ok: done.ok,
        why: done.why,
        same: !!done.same,
        stood: !!done.stood,
        notes: done.notes || '',
      });
      return;
    }

    if (payload.type === 'apply_refine') {
      try {
        const msgs = await spindle.chat.getMessages(payload.chatId);
        const m = Array.isArray(msgs)
          ? msgs.find((x: any) => x && x.id === payload.messageId)
          : null;
        if (!m) {
          replyTo(userId, { type: 'refine_result', requestId: payload.requestId, ok: false, why: 'that message is gone' });
          return;
        }
        // The text the rewrite was made from, as the panel had it, not
        // whatever the message holds now. saveRefined refuses a write onto a
        // message that moved, and handing it the current content as the
        // original asks it to compare a value against itself, which it always
        // passes: a reply swiped while the card sat waiting for a yes would
        // have had a rewrite of the swipe before it written over the new one.
        const from =
          typeof payload.before === 'string'
            ? payload.before
            : String(m.content == null ? '' : m.content);
        const done = await saveRefined(
          payload.chatId,
          m,
          from,
          String(payload.after || ''),
          userId,
        );
        replyTo(userId, { type: 'refine_result', requestId: payload.requestId, ok: done.ok, why: done.why });
      } catch (e: any) {
        replyTo(userId, { type: 'refine_result', requestId: payload.requestId, ok: false, why: (e && e.message) || 'it could not be saved' });
      }
      return;
    }

    // Put a refined message back the way it was.
    if (payload.type === 'undo_refine') {
      const k = key(payload.chatId, payload.messageId);
      const kept = before.get(k);
      // Which message this is about, on every answer, the failures included.
      //
      // The panel keys what it can put back by chat and message, so an answer
      // carrying neither leaves its delete skipped: the reply really is
      // restored, and the panel goes on offering to restore it, the floating
      // button stays an undo button, and Put it back looks like a button that
      // does nothing.
      const about = { chatId: payload.chatId, messageId: payload.messageId };
      if (!kept) {
        // gone marks the answers the panel cannot act on again. There is no
        // second attempt at any of these, so the row offering one comes off
        // the tab rather than sitting there for the rest of the session.
        replyTo(userId, { type: 'undo_result', requestId: payload.requestId, ...about, ok: false, gone: true, why: 'nothing was kept for that message' });
        return;
      }
      try {
        const msgs = await spindle.chat.getMessages(payload.chatId);
        const m = Array.isArray(msgs) ? msgs.find((x: any) => x && x.id === payload.messageId) : null;
        if (!m) {
          before.delete(k);
          refined.delete(String(payload.messageId));
          replyTo(userId, { type: 'undo_result', requestId: payload.requestId, ...about, ok: false, gone: true, why: 'that message is gone' });
          return;
        }
        // Only over the refine itself. Between the refine and this button the
        // reply can be swiped, regenerated or edited, and all three leave the
        // message id alone. Writing the kept text in regardless would put a
        // rewrite of one swipe on top of a different swipe, and there is no way
        // back from that: the text this was holding is the only copy.
        const mark = refined.get(String(payload.messageId));
        const holds = String(m.content == null ? '' : m.content);
        if (mark != null && markOf(holds) !== mark) {
          before.delete(k);
          refined.delete(String(payload.messageId));
          replyTo(userId, {
            type: 'undo_result',
            requestId: payload.requestId,
            ...about,
            ok: false,
            gone: true,
            why: 'that message has changed since the refine, so it was left as it is',
          });
          return;
        }
        remember(ourWrites, k, kept.text, OURS_MAX);
        const patch: any = { content: kept.text };
        const swipes = Array.isArray(m.swipes) ? m.swipes.slice() : null;
        const idx = typeof m.swipe_id === 'number' ? m.swipe_id : 0;
        // The refine was added as a reroll of its own, so putting it back is
        // taking that reroll off again rather than writing the original over
        // it. A write would leave two rerolls saying the same thing.
        //
        // Only when it is still the last one and still holds what the refine
        // wrote. Anything else means the reader has been swiping or rerolling
        // since, and cutting the end off a list somebody has been working in is
        // not an undo.
        const wroteAt = typeof kept.swipeAt === 'number' ? kept.swipeAt : -1;
        if (
          swipes &&
          wroteAt >= 0 &&
          wroteAt === swipes.length - 1 &&
          markOf(swipes[wroteAt]) === refined.get(String(payload.messageId))
        ) {
          swipes.pop();
          const back = Math.max(0, Math.min(swipes.length - 1, wroteAt - 1));
          patch.swipes = swipes;
          patch.swipe_id = back;
          patch.content = String(swipes[back] == null ? kept.text : swipes[back]);
        } else if (swipes && idx >= 0 && idx < swipes.length) {
          swipes[idx] = kept.text;
          patch.swipes = swipes;
          patch.swipe_id = idx;
        }
        await spindle.chat.updateMessage(payload.chatId, m.id, patch);
        before.delete(k);
        refined.delete(String(payload.messageId));
        replyTo(userId, { type: 'undo_result', requestId: payload.requestId, ...about, ok: true, text: kept.text });
      } catch (e: any) {
        replyTo(userId, { type: 'undo_result', requestId: payload.requestId, ...about, ok: false, why: (e && e.message) || 'it could not be put back' });
      }
      return;
    }

    // What the request actually looks like, without sending it anywhere. Built
    // by the same function a real refine uses, so it cannot drift into being a
    // pretty description of something else. No model is called and nothing is
    // written; this costs nothing but a chat read.
    if (payload.type === 'preview_prompt') {
      try {
        const stand = 'The message being refined would go here.';
        let text = stand;
        let scene: Scene = NO_SCENE;
        let real = false;
        let isUser = false;
        if (payload.chatId) {
          let msgs: any[] = [];
          try {
            msgs = await spindle.chat.getMessages(payload.chatId);
          } catch (_) {
            msgs = [];
          }
          if (Array.isArray(msgs) && msgs.length) {
            // The message asked for, or the newest one there is, so a preview
            // works on a chat the reader has only just opened.
            const want = payload.messageId
              ? msgs.find((x: any) => x && x.id === payload.messageId)
              : null;
            const m = want || msgs[msgs.length - 1];
            if (m && m.content) {
              text = String(m.content);
              isUser = m.role === 'user';
              real = true;
            }
            const card = await gatherCard(payload.chatId, userId);
            const at = m ? msgs.findIndex((x: any) => x && x.id === m.id) : -1;
            scene = {
              character: card.text,
              context: at > 0 ? await gatherHistory(msgs, at, card.name, userId) : '',
              lore: await gatherLore(payload.chatId, userId),
              memory: await gatherMemory(payload.chatId, userId),
              name: card.name,
              chatId: payload.chatId,
              characterId: card.id,
            };
          }
        }
        // The same two steps a real refine takes before it builds anything, in
        // the same order, because this is the card that claims to show what
        // gets sent. Without them it showed the passage with its markup still
        // in it and its reasoning still on it, neither of which a model ever
        // sees, and {{protect_notes}} resolved to nothing and vanished: the one
        // macro that puts words in the prompt was the one the preview never
        // showed.
        const split = splitThinking(text);
        const armed = shield(split.body);
        if (armed.parts.length) scene = { ...scene, shieldNote: SHIELD_NOTE };
        const blockParts: Array<{ name: string; text: string }> = [];
        const messages = await buildPrompt(armed.text, isUser, scene, userId, blockParts);
        const whichPrompt = isUser ? 'yours' : 'replies';
        // Counted here rather than in the panel, because the tokeniser lives on
        // this side and characters over four is the number this card exists to
        // stop somebody having to work out for themselves. A preview is a press
        // with a wait already attached, so the extra calls cost nothing anybody
        // notices.
        // Per block rather than per message, since blocks with the same role are
        // joined on the way out and counting the messages would report every
        // rule as one lump. The total is the sum of the parts, which is what a
        // breakdown that does not add up would otherwise cost somebody an
        // afternoon working out.
        const tokens = await countRequest(
          blockParts.map((b) => b.text),
          userId,
        );
        // The passage on its own, so the panel can reckon what comes back
        // without having to guess which message holds it. Blocks are the
        // reader's to reorder, so "the last one" is not the passage in every
        // layout, and a cost worked out from a rule block would be wrong with
        // nothing on screen to say so.
        const passage = await countSaying(armed.text, userId);
        replyTo(userId, {
          type: 'prompt_preview',
          requestId: payload.requestId,
          ok: true,
          real: real,
          which: whichPrompt,
          messages: messages,
          tokens: {
            total: tokens.total,
            counted: tokens.counted,
            passage: passage.n,
            parts: blockParts.map((b, i) => ({ name: b.name, tokens: tokens.per[i] || 0 })),
          },
          parameters: cleanSamplers(),
          wrapOutput: wrapOutput,
          connectionId: connectionId || '',
          reasoning: reasoningFor(),
        });
      } catch (e: any) {
        replyTo(userId, {
          type: 'prompt_preview',
          requestId: payload.requestId,
          ok: false,
          why: (e && e.message) || 'the preview could not be built',
        });
      }
      return;
    }

    // What the host is actually letting this extension do. Asked rather than
    // assumed: a permission can be granted or taken away while the extension is
    // running, and nothing restarts when it happens.
    if (payload.type === 'get_permissions') {
      let granted: string[] = [];
      try {
        if (spindle.permissions && typeof spindle.permissions.getGranted === 'function') {
          const got = await spindle.permissions.getGranted();
          if (Array.isArray(got)) granted = got.map((x: any) => String(x));
        } else if (spindle.permissions && typeof spindle.permissions.has === 'function') {
          // A host with only the local cache. Less authoritative and still an
          // answer.
          granted = NEEDED.filter((n) => {
            try {
              return spindle.permissions.has(n);
            } catch (_) {
              return false;
            }
          });
        }
      } catch (_) {
        // Could not ask. Answering with nothing would say every permission is
        // refused, which is a worse lie than saying it is not known.
        replyTo(userId, { type: 'permissions', requestId: payload.requestId, known: false, granted: [] });
        return;
      }
      replyTo(userId, {
        type: 'permissions',
        requestId: payload.requestId,
        known: true,
        granted: granted,
      });
      return;
    }

    // Which chat is open, asked rather than assumed. The panel cannot see this
    // for itself: it knows the last chat a reply arrived in, which is not the
    // same as the chat somebody is looking at now.
    if (payload.type === 'active_chat') {
      let chatId: any = payload.chatId || null;
      let resolved = false;
      let character: string | null = null;
      let hasCharacter = false;
      // Whether a chat actually came back. The panel reads an id out of the
      // address bar when a chat has just been made, since the server does not
      // call it the active one yet, and this is what tells that guess from a
      // real chat: an id that looks the part but names nothing is not a chat to
      // start refining into.
      let found = false;
      try {
        let chat: any = null;
        if (chatId && spindle.chats && typeof spindle.chats.get === 'function') {
          chat = await spindle.chats.get(chatId, userId);
          resolved = true;
        } else if (spindle.chats && typeof spindle.chats.getActive === 'function') {
          chat = await spindle.chats.getActive(userId);
          chatId = (chat && chat.id) || null;
          resolved = true;
        }
        found = !!(chat && chat.id);
        const cardId = chat && chat.character_id;
        // Whether the chat has a card at all, which is a different question
        // from what it is called: the name needs the characters permission and
        // the lookup below comes back empty without it.
        const cards = chat && chat.metadata && chat.metadata.character_ids;
        hasCharacter = !!cardId || (Array.isArray(cards) && cards.length > 0);
        if (cardId && spindle.characters && typeof spindle.characters.get === 'function') {
          const card = await spindle.characters.get(cardId, userId);
          const name = card && card.name;
          character = name ? String(name) : null;
        }
      } catch (_) {
        // No chats or characters permission. Answer with what is known, so the
        // panel can tell "nobody is in a chat" from "I was not allowed to look".
      }
      replyTo(userId, {
        type: 'active_chat',
        requestId: payload.requestId,
        chatId: chatId,
        character: character,
        hasCharacter: hasCharacter,
        resolved: resolved,
        found: found,
      });
      return;
    }

    // Refine a draft: text the panel holds rather than a saved message. The
    // answer goes back to the panel and nowhere near the chat.
    if (payload.type === 'try_refine') {
      replyTo(userId, { type: 'refine_ack', requestId: payload.requestId });
      const text = String(payload.text || '');
      if (!text.trim()) {
        replyTo(userId, { type: 'try_result', requestId: payload.requestId, ok: false, why: 'there is no text to refine' });
        return;
      }
      // A draft belongs to no saved message, so there is no card and no history
      // to send with it. The prompt for your own writing is the one that
      // applies: a draft is your hand, not the story's voice.
      //
      // One ask, and no retry loop around it, but the run still has to be
      // opened or nothing counts what this one costs.
      startUsed(userId);
      const answer = await askModel(text, true, NO_SCENE, userId);
      if (answer.error) {
        replyTo(userId, { type: 'try_result', requestId: payload.requestId, ok: false, why: answer.error });
        return;
      }
      const verdict = judge(answer.content, text);
      replyTo(userId, {
        type: 'try_result',
        requestId: payload.requestId,
        ok: verdict.ok,
        why: verdict.why,
        same: !!verdict.same,
        notes: verdict.notes || '',
        after: verdict.ok ? verdict.text : String(answer.content || ''),
      });
      return;
    }

    // The connections the reader can pick between, so the panel offers real
    // names rather than asking somebody to paste an id.
    if (payload.type === 'list_connections') {
      let list: any[] = [];
      try {
        const got = await spindle.connections.list(userId);
        if (Array.isArray(got))
          list = got.map((c: any) => ({
            id: String(c && c.id),
            name: String((c && c.name) || ''),
            provider: String((c && c.provider) || ''),
            model: String((c && c.model) || ''),
            isDefault: !!(c && c.is_default),
          }));
      } catch (_) { /* no permission, or none set up: the panel says so */ }
      replyTo(userId, { type: 'connections', requestId: payload.requestId, list: list });
      return;
    }
  } catch (e: any) {
    const why = (e && e.message) || String(e);
    say('warn', 'a message from the panel could not be handled: ' + why);
    // The panel is waiting. Swallowing this into a log line left it spinning
    // with no way to know the answer was never coming, so whatever it asked
    // for is answered with the failure.
    try {
      const kind =
        payload && payload.type === 'try_refine'
          ? 'try_result'
          : payload && payload.type === 'preview_prompt'
            ? 'prompt_preview'
            : payload && payload.type === 'undo_refine'
              ? 'undo_result'
              : payload && payload.type === 'active_chat'
                ? 'active_chat'
                : payload && payload.type === 'refine_all'
                  ? 'refine_all_done'
                  : 'refine_result';
      // A sweep that died has to leave the panel's counter behind it, or the
      // card sits there saying "reply 4 of 30" for the rest of the session.
      if (kind === 'refine_all_done') stopAll.delete(String(userId == null ? '' : userId));
      replyTo(userId, {
        type: kind,
        requestId: payload && payload.requestId,
        ok: false,
        saved: 0,
        skipped: 0,
        stopped: false,
        why: 'something went wrong inside the extension: ' + why,
      });
    } catch (_) {}
  }
});

// Said once this module is listening. A panel has no way to know the backend
// was not up yet, or has restarted since and forgotten everything it was told.
// Hearing this, it says it all again.
// A grant given or taken away while the extension is running changes what the
// panel should be saying, and nothing restarts when it happens.
try {
  if (spindle.permissions && typeof spindle.permissions.onChanged === 'function') {
    spindle.permissions.onChanged(() => {
      try {
        spindle.sendToFrontend({ type: 'permissions_changed' });
      } catch (_) {}
    });
  }
} catch (_) {}

try { spindle.sendToFrontend({ type: 'backend_ready' }); } catch (_) {}

try { spindle.log.info('Auto Refine backend loaded.'); } catch (_) {}

// No exports here on purpose. This file has no imports either, so Lumiverse
// evaluates it as a classic script, and one export would make it a module and
// change how it loads. The checks drive it the way the host does: they run the
// built file against a stub spindle and watch what it writes.
