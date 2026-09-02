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
let connectionId = '';         // empty means the reader's active connection
let thinkingMode = 'off';      // off | inherit | custom
let thinkingEffort = 'medium'; // only read when thinkingMode is custom
let timeoutSecs = 90;
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
const before = new Map<string, { text: string; at: number }>();
const BEFORE_MAX = 30;

// Messages this run has already refined, so a re-render or a second event
// cannot refine the same reply twice and drift it further each time.
const refined = new Set<string>();
const REFINED_MAX = 400;

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
const OURS = ['message', 'history', 'lore', 'whose', 'refine_notes', 'protect_notes'];

interface Scene {
  character: string;
  context: string;
  lore: string;
  name: string;
  chatId?: string;
  characterId?: string;
  // Only set when something was actually shielded, so a message with no markup
  // in it does not carry an instruction about tokens that are not there.
  shieldNote?: string;
}
const NO_SCENE: Scene = { character: '', context: '', lore: '', name: '' };

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
const DEFAULT_BLOCKS: Block[] = [
  {
    id: 'system',
    name: 'The job',
    on: true,
    role: 'system',
    text:
      '<your_task>\n' +
      'You are editing one message from an ongoing story. Rewrite it so that it ' +
      'follows every rule you are given below.\n\n' +
      'Keep the same events, the same speech, and the same meaning. You are ' +
      'changing how it is written, not what happens in it. Do not add new ' +
      'actions, new dialogue, or new characters. Do not continue the scene past ' +
      'where it ends. Do not resolve anything the message leaves open.\n\n' +
      'Reply with the rewritten message and nothing else. No preamble, no ' +
      'explanation of what you changed, no notes at the end.\n' +
      '</your_task>',
  },
  {
    id: 'character',
    name: 'Who the character is',
    on: true,
    role: 'system',
    text: '<character>\n{{description}}\n</character>',
  },
  {
    id: 'persona',
    name: 'Who the player is',
    on: true,
    role: 'system',
    text: '<player>\n{{persona}}\n</player>',
  },
  {
    id: 'lore',
    name: 'What is true in this world',
    on: true,
    role: 'system',
    text: '<world>\n{{lore}}\n</world>',
  },
  {
    id: 'history',
    name: 'What has been happening',
    on: true,
    role: 'system',
    text: '<recent_scene>\n{{history}}\n</recent_scene>',
  },
  {
    id: 'cliches',
    name: 'Cliches',
    on: true,
    role: 'system',
    text:
      '<cliches>\n' +
      'Cut phrases that turn up in every story rather than in this one. You know ' +
      'the ones: a breath you did not know you were holding, a voice barely above ' +
      'a whisper, a heart hammering against ribs, something unspoken hanging in ' +
      'the air.\n\n' +
      'Replace each with what is actually happening to this person in this room. ' +
      'If nothing is actually happening, cut the line rather than replacing it.\n' +
      '</cliches>',
  },
  {
    id: 'sentences',
    name: 'Sentence rhythm',
    on: true,
    role: 'system',
    text:
      '<sentence_rhythm>\n' +
      'Vary your sentence lengths. Three medium sentences in a row is a rhythm a ' +
      'reader stops hearing.\n\n' +
      'Cut the sentence that restates the one before it in different words. Cut ' +
      'adverbs that only repeat what the verb already said.\n' +
      '</sentence_rhythm>',
  },
  {
    id: 'dialogue',
    name: 'Dialogue',
    on: true,
    role: 'system',
    text:
      '<dialogue>\n' +
      'Keep every line of speech saying what it said. You may change how it is ' +
      'said if the wording is stiff, but never what is meant.\n\n' +
      'Cut speech tags that explain the line: she said angrily, he asked ' +
      'curiously. If the line does not carry it, the line is the problem.\n' +
      '</dialogue>',
  },
  {
    id: 'answer',
    name: 'How to answer',
    on: true,
    role: 'system',
    text:
      '<how_to_answer>\n' +
      'Put the rewritten message between <refined> and </refined>. Only what is ' +
      'between those two tags is saved, so the tags are not optional.\n\n' +
      'Inside the tags, write the message and nothing else. No preamble, no ' +
      'heading, no note about what you changed.\n\n' +
      'Anything you write outside the tags is shown to me and never saved into ' +
      'the chat. Leave it empty unless something above asked you for it.\n' +
      '</how_to_answer>\n\n' +
      '{{protect_notes}}',
  },
  {
    id: 'turn',
    name: 'The turn to refine',
    on: true,
    role: 'user',
    text: '{{whose}}\n\n<turn_to_refine>\n{{message}}\n</turn_to_refine>',
  },
];

// Reasoning models are told where to put their working. Sent as its own block
// so somebody who never turns thinking on never carries the instruction.
// Asking for the answer inside a tag, rather than asking for the answer on its
// own. A model that cannot help adding "Here is the rewritten message" still
// puts the rewrite between the tags, and taking what is between them is exact
// where reading around a preamble is guesswork.
let wrapOutput = true;
// Whether to stream the refine so the panel can show it arriving. The answer is
// the same either way; this only decides whether anybody can watch it.
let streamProgress = true;
const OUT_TAG = 'refined';

// Greedy on purpose. A rewrite can legitimately contain the closing tag as
// text, and the last one is the end of the answer.
const OUT_RE = new RegExp('<' + OUT_TAG + '[^>]*>([\\s\\S]*)<\\/' + OUT_TAG + '>', 'i');
const OUT_OPEN = new RegExp('<' + OUT_TAG + '[^>]*>', 'i');

// What the model actually meant to hand back. When the tags are there this is
// exact, and every check downstream then runs on the rewrite rather than on the
// rewrite plus whatever was said around it.
// outside is whatever the model wrote around the tags. It is never saved into
// the chat, and it used to be dropped unread. A prompt is free to ask for a
// note on what was cut and what was left alone, and that note lands here, so it
// is carried back to the panel to be shown rather than thrown away.
function unwrapOutput(answer: string): { text: string; tagged: boolean; outside: string } {
  const hit = OUT_RE.exec(answer);
  if (hit && typeof hit[1] === 'string') {
    const before = answer.slice(0, hit.index);
    const after = answer.slice(hit.index + hit[0].length);
    return { text: hit[1].trim(), tagged: true, outside: (before + '\n' + after).trim() };
  }
  // An opening tag with nothing closing it: the answer was cut off mid-write.
  if (OUT_OPEN.test(answer)) return { text: '', tagged: true, outside: '' };
  return { text: answer, tagged: false, outside: '' };
}

const REASONING_NOTE =
  'Think about the edit before you write it, then give only the rewritten ' +
  'message as your answer. Your reasoning must not appear in the answer.';

// Your own messages get their own prompt. Refining what a character wrote and
// refining what you wrote are different jobs: one is polishing somebody else's
// prose, the other is tidying your own without turning it into the narrator's.
// One prompt doing both ends up hedged enough to do neither well.
//
// Empty means you have not written one, and the reply prompt is used instead,
// which is what it did before this existed.
let userBlocks: Block[] = [];

// The blocks as they will actually be sent: the reader's list when it has one,
// the default otherwise.
function activeBlocks(isUser?: boolean): Block[] {
  if (isUser && Array.isArray(userBlocks) && userBlocks.length) return userBlocks.slice();
  return Array.isArray(blocks) && blocks.length ? blocks.slice() : DEFAULT_BLOCKS.slice();
}

// Whether the prompt shows the model the thing it is meant to rewrite. Asked
// before any model is called, so a prompt that could not possibly work is
// refused rather than paid for.
function promptHasTurn(isUser?: boolean): boolean {
  for (const b of activeBlocks(isUser)) {
    if (!b || b.on === false) continue;
    if (String(b.text || '').indexOf(TURN_MACRO) >= 0) return true;
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
  /```[\s\S]*?```/g,               // fenced code
  /`[^`\n]+`/g,                     // inline code
  /!\[[^\]]*\]\([^)]*\)/g,           // an image
  /\[[^\]]*\]\([^)\s]+\)/g,           // a link, target and all
  /<!--[\s\S]*?-->/g,               // a comment
  /<\/?[a-zA-Z][^<>]*>/g,           // every other tag, checked below
];

interface Shield {
  text: string;
  parts: string[];
}

function shield(text: string): Shield {
  if (!protectOn) return { text: text, parts: [] };
  const parts: string[] = [];
  let out = text;
  for (const rule of GUARDED) {
    out = out.replace(rule, (hit) => {
      // Bare inline formatting is left where it is, unless the reader asked
      // for it to be hidden too.
      if (!protectInline && INLINE_OK.test(hit)) return hit;
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
  const out = text.replace(TOKEN_ANY, (whole, n) => {
    const at = Number(n);
    if (!(at >= 1 && at <= parts.length)) return whole;
    seen.add(at);
    return parts[at - 1];
  });
  const lost: number[] = [];
  for (let i = 1; i <= parts.length; i++) if (!seen.has(i)) lost.push(i);
  return { text: out, lost: lost };
}

const SHIELD_NOTE =
  'Some parts of the message have been replaced with tokens that look like ' +
  '[[AR1]], [[AR2]] and so on. They stand for formatting that must survive ' +
  'exactly as it is. Copy every one of them into your answer unchanged, in the ' +
  'same place. Do not edit them, translate them, split them across lines, or ' +
  'remove them.';

// The model's own working, which is not prose and is not the reader's writing.
// It is cut off before the refine and put back afterwards, so a rewrite can
// never quietly edit what a model worked out in a place nobody would check.
const THINK_WRAPS: RegExp[] = [
  /^\s*<(think|thinking|reasoning|thought)>[\s\S]*?<\/\1>\s*/i,
  /^\s*\[(?:thinking|thought)\][\s\S]*?\[\/(?:thinking|thought)\]\s*/i,
  /^\s*<\|(?:begin_of_thought|thinking)\|>[\s\S]*?<\|(?:end_of_thought|\/thinking)\|>\s*/i,
];

function splitThinking(text: string): { head: string; body: string } {
  if (!protectThinking) return { head: '', body: text };
  for (const rule of THINK_WRAPS) {
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
  p: { message: string; history: string; lore: string; isUser: boolean; shieldNote?: string },
): string {
  return String(text).replace(/\u0000ARF:([a-z_]+)\u0000/g, (whole, name) => {
    const id = String(name).toLowerCase();
    if (OURS.indexOf(id) < 0) return whole;
    if (id === 'message') return p.message;
    if (id === 'history') return p.history;
    if (id === 'lore') return p.lore;
    if (id === 'whose')
      return p.isUser
        ? 'This message was written by the player, in their own voice. Keep ' +
          'their voice. Do not rewrite it as the narrator or as the character.'
        : 'This message was written by the character or the narrator.';
    if (id === 'refine_notes') return thinkingMode !== 'off' ? REASONING_NOTE : '';
    if (id === 'protect_notes') return p.shieldNote || '';
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

// A block that is nothing but empty tags once its macros came back empty. A
// chat with no lorebook should not send <world></world>, which reads to a model
// as "this world is empty" rather than as "nothing was said about the world".
function isHollow(text: string): boolean {
  const bare = text
    .replace(/<\/?[a-z0-9_\-]+\s*\/?>/gi, '')
    .replace(/\s+/g, '');
  return bare.length === 0;
}

async function buildPrompt(
  text: string,
  isUser: boolean,
  scene: Scene,
  userId?: string,
): Promise<any[]> {
  const piece = {
    message: text,
    history: scene.context,
    lore: scene.lore,
    isUser: isUser,
    shieldNote: scene.shieldNote,
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
const REFUSAL =
  /\b(?:i(?:'|’)?m sorry,? but|i can(?:'|’)?t (?:help|assist|comply|do that)|i (?:will|won(?:'|’)?t) not (?:rewrite|continue|produce)|as an ai\b|i'm unable to (?:help|assist))/i;

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
}

// What a refine attempt comes back with. notes rides along whether it worked or
// not: a prompt that asks for a report on what was cut wants that report even on
// the pass that was refused for being too long.
interface RefineOutcome {
  ok: boolean;
  why: string;
  notes?: string;
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
  const text = unwrapQuotes(unfence(raw)).trim();
  const orig = original.trim();

  if (!text) return { ok: false, text: '', why: 'the model sent nothing back' };
  if (text === orig) return { ok: false, text: '', why: 'the model changed nothing' };
  if (PREAMBLE.test(text))
    return { ok: false, text: '', why: 'the model wrote about the edit instead of making it' };
  if (REFUSAL.test(text) && text.length < 600)
    return { ok: false, text: '', why: 'the model declined to rewrite it' };

  // Length. A refine that doubles a reply has written new scene, and one that
  // halves it has thrown writing away. Both are judged against what the reader
  // set, and both leave the reply as it was.
  const grew = orig.length > 0 ? ((text.length - orig.length) / orig.length) * 100 : 0;
  if (maxGrowthPct > 0 && grew > maxGrowthPct)
    return {
      ok: false,
      text: '',
      why: 'the rewrite was ' + Math.round(grew) + '% longer, over the limit you set',
    };
  if (minShrinkPct > 0 && grew < -minShrinkPct)
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
const CONTEXT_MSG_MAX = 1200;
const CONTEXT_TOTAL_MAX = 12000;

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
    out.push((m.role === 'user' ? 'Player' : them) + ': ' + body);
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
  const ms = Number.isFinite(secs) && secs > 0 ? Math.min(600, Math.max(5, secs)) * 1000 : 90000;
  let timer: any = null;
  if (controller) timer = setTimeout(() => { try { controller.abort(); } catch (_) {} }, ms);
  try {
    const req: any = { messages: await buildPrompt(text, isUser, scene, userId) };
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
            tell(userId, { type: 'refine_progress', stage: 'writing', chars: text.length });
          }
        }
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
    return { content: String((result && result.content) || ''), error: '' };
  } catch (e: any) {
    const msg = (e && e.message) || String(e);
    if (e && e.name === 'AbortError')
      return { content: '', error: 'the model did not answer within ' + Math.round(ms / 1000) + 's' };
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
  }
}

// The greeting is the first message when it is the assistant's, and it is never
// refined. Read from the chat rather than assumed, because a chat that opens on
// a user message has no greeting at all.
function greetingIdOf(msgs: any[]): any {
  return msgs && msgs.length && msgs[0] && msgs[0].role === 'assistant' ? msgs[0].id : null;
}

async function refineMessage(
  chatId: string,
  messageId: any,
  userId?: string,
  byHand?: boolean,
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
  const m = msgs.find((x: any) => x && x.id === messageId) || null;
  if (!m) return { ok: false, why: 'that message is not in this chat any more' };
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

  // Who this is and what led up to it. Both are best-effort: a chat with no
  // card, or a reader who has not granted the two read permissions, refines
  // with the blocks left out rather than not refining at all.
  const card = await gatherCard(chatId, userId);
  const at = msgs.findIndex((x: any) => x && x.id === m.id);
  let scene: Scene = {
    character: card.text,
    context: await gatherHistory(msgs, at, card.name, userId),
    lore: await gatherLore(chatId, userId),
    name: card.name,
    chatId: chatId,
    characterId: card.id,
  };

  // The model's own working is cut off rather than sent. It is not prose, and a
  // rewrite of it would be invisible in the place people look.
  const split = splitThinking(original);
  // Markup is lifted out and stood in for, so the model cannot mangle what it
  // was never meant to touch.
  const armed = shield(split.body);
  if (armed.parts.length) scene = { ...scene, shieldNote: SHIELD_NOTE };

  tell(userId, { type: 'refine_progress', stage: thinkingMode === 'off' ? 'asking' : 'thinking' });
  const answer = await askModel(armed.text, m.role === 'user', scene, userId);
  if (answer.error) return { ok: false, why: answer.error };
  tell(userId, { type: 'refine_progress', stage: 'checking' });

  // Judged against the text that was actually sent, so a message that is half
  // markup is not called "too short" for the tokens standing in for it.
  const verdict = judge(answer.content, armed.text);
  // Whatever the model wrote around the tags travels with every answer from
  // here on, refused ones included. A prompt that asked for a report on what
  // was cut wants that report most on the pass that was turned down.
  const notes = verdict.notes || '';
  if (!verdict.ok) return { ok: false, why: verdict.why, notes: notes };

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
  // The thinking goes back exactly as it was, in front of the rewrite.
  const whole = split.head + back.text;

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

async function saveRefined(
  chatId: string,
  m: any,
  original: string,
  next: string,
  userId?: string,
): Promise<RefineOutcome> {
  const k = key(chatId, m.id);
  try {
    if (keepOriginal) remember(before, k, { text: original, at: Date.now() }, BEFORE_MAX);
    remember(ourWrites, k, next, OURS_MAX);
    const patch: any = { content: next };
    // A message can hold several swipes, and the one on screen is the one to
    // write. Writing content alone leaves the active swipe holding the old text
    // on a build that reads swipes first.
    const swipes = m && Array.isArray(m.swipes) ? m.swipes.slice() : null;
    const idx = m && typeof m.swipe_id === 'number' ? m.swipe_id : 0;
    if (swipes && idx >= 0 && idx < swipes.length) {
      swipes[idx] = next;
      patch.swipes = swipes;
      patch.swipe_id = idx;
    }
    await spindle.chat.updateMessage(chatId, m.id, patch);
    note(refined, String(m.id), REFINED_MAX);
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
      if (!masterOn || !refineOn || p.error) return;
      if (chatsOff.has(String(p.chatId))) return;

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
      if (!messageId) return;
      if (refined.has(String(messageId))) return;

      let done: RefineOutcome;
      try {
        done = await refineMessage(p.chatId, messageId, p.userId, false);
      } catch (e: any) {
        // A throw here used to end the whole handler, so the panel sat busy
        // until the page was reloaded.
        done = { ok: false, why: 'something went wrong: ' + ((e && e.message) || String(e)) };
        say('warn', 'the automatic refine threw: ' + ((e && e.message) || String(e)));
      }
      if (!done.ok && done.why) {
        replyTo(p.userId, {
          type: 'refine_skipped',
          chatId: p.chatId,
          messageId: messageId,
          why: done.why,
          notes: done.notes || '',
        });
      }
      // A refine that worked still has a report to hand over when the prompt
      // asked for one, and the automatic pass has no other way to show it.
      else if (done.ok && done.notes) {
        replyTo(p.userId, { type: 'refine_notes', chatId: p.chatId, messageId: messageId, notes: done.notes });
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
      masterOn = s.enabled !== false;
      refineOn = !!s.refineOn;
      connectionId = String(s.connectionId == null ? '' : s.connectionId);
      thinkingMode =
        s.thinkingMode === 'inherit' || s.thinkingMode === 'custom' ? s.thinkingMode : 'off';
      thinkingEffort = EFFORTS.indexOf(String(s.thinkingEffort)) >= 0 ? String(s.thinkingEffort) : 'medium';
      timeoutSecs = Number(s.timeoutSecs) || 90;
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
      protectInline = !!s.protectInline;
      wrapOutput = s.wrapOutput !== false;
      streamProgress = s.streamProgress !== false;
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
        notes: done.notes || '',
      });
      return;
    }

    // The confirmation coming back with a yes.
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
        const done = await saveRefined(
          payload.chatId,
          m,
          String(m.content == null ? '' : m.content),
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
      if (!kept) {
        replyTo(userId, { type: 'undo_result', requestId: payload.requestId, ok: false, why: 'nothing was kept for that message' });
        return;
      }
      try {
        const msgs = await spindle.chat.getMessages(payload.chatId);
        const m = Array.isArray(msgs) ? msgs.find((x: any) => x && x.id === payload.messageId) : null;
        if (!m) {
          replyTo(userId, { type: 'undo_result', requestId: payload.requestId, ok: false, why: 'that message is gone' });
          return;
        }
        remember(ourWrites, k, kept.text, OURS_MAX);
        const patch: any = { content: kept.text };
        const swipes = Array.isArray(m.swipes) ? m.swipes.slice() : null;
        const idx = typeof m.swipe_id === 'number' ? m.swipe_id : 0;
        if (swipes && idx >= 0 && idx < swipes.length) {
          swipes[idx] = kept.text;
          patch.swipes = swipes;
          patch.swipe_id = idx;
        }
        await spindle.chat.updateMessage(payload.chatId, m.id, patch);
        before.delete(k);
        refined.delete(String(payload.messageId));
        replyTo(userId, { type: 'undo_result', requestId: payload.requestId, ok: true, text: kept.text });
      } catch (e: any) {
        replyTo(userId, { type: 'undo_result', requestId: payload.requestId, ok: false, why: (e && e.message) || 'it could not be put back' });
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
              name: card.name,
              chatId: payload.chatId,
              characterId: card.id,
            };
          }
        }
        const messages = await buildPrompt(text, isUser, scene, userId);
        const whichPrompt = isUser && userBlocks.length ? 'yours' : 'replies';
        replyTo(userId, {
          type: 'prompt_preview',
          requestId: payload.requestId,
          ok: true,
          real: real,
          which: whichPrompt,
          messages: messages,
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
      });
      return;
    }

    // Try the rules on some text without saving anything. The panel's own
    // rehearsal: the answer comes back and goes nowhere near the chat.
    if (payload.type === 'try_refine') {
      replyTo(userId, { type: 'refine_ack', requestId: payload.requestId });
      const text = String(payload.text || '');
      if (!text.trim()) {
        replyTo(userId, { type: 'try_result', requestId: payload.requestId, ok: false, why: 'there is no text to try it on' });
        return;
      }
      // Pasted text belongs to no chat, so there is no card and no history to
      // send. That is the honest version of a rehearsal: it shows what the
      // rules do on their own, which is the thing being tried out.
      const answer = await askModel(text, !!payload.asUser, NO_SCENE, userId);
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
                : 'refine_result';
      replyTo(userId, {
        type: kind,
        requestId: payload && payload.requestId,
        ok: false,
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
