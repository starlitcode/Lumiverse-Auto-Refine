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
let rules = '';
let structureRules = '';       // extra shape rules, for a model that reasons
let refineUserMessages = false;
let connectionId = '';         // empty means the reader's active connection
let thinkingMode = 'off';      // off | inherit
let timeoutSecs = 90;
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

function say(level: 'info' | 'warn', text: string) {
  try { spindle.log[level]('auto-refine: ' + text); } catch (_) {}
}

// ---- the prompt ----
// Written out here rather than assembled inline, because this is the part a
// reader would want to audit and the part most likely to need tuning. It is
// plain instruction, no cleverness: the model is told what it is holding, what
// to do to it, and what not to do.
//
// The three "do not" lines are doing the real work. A model asked to rewrite
// prose will, left alone, introduce itself, explain its edits, or wrap the
// answer in quotes. Every one of those would be saved into the chat as though
// the character had said it.
const BASE_RULES =
  'You are editing one message from an ongoing roleplay. Rewrite it so it ' +
  'follows the instructions below.\n\n' +
  'Keep the same events, the same speech, and the same meaning. You are ' +
  'polishing how it is written, not changing what happens. Do not add new ' +
  'actions, new dialogue, or new characters. Do not continue the scene past ' +
  'where it ends. Do not resolve anything the message leaves open.\n\n' +
  'Reply with the rewritten message and nothing else. No preamble, no ' +
  'explanation of what you changed, no quotation marks around the whole ' +
  'thing, no notes at the end.';

const REASONING_NOTE =
  'Think about the edit before you write it, then give only the rewritten ' +
  'message as your answer. Your reasoning must not appear in the answer.';

function buildPrompt(text: string, isUser: boolean): any[] {
  const parts = [BASE_RULES];
  const own = String(rules || '').trim();
  if (own) parts.push('The instructions to follow:\n\n' + own);
  const shape = String(structureRules || '').trim();
  if (shape) parts.push('Structure and formatting:\n\n' + shape);
  // Only when the reader has left thinking on. A model with no thinking to do
  // does not need to be told where not to put it.
  if (thinkingMode !== 'off') parts.push(REASONING_NOTE);
  parts.push(
    isUser
      ? 'The message is written by the human player, in their own voice. Keep ' +
        'their voice. Do not make it sound like the narrator or the character.'
      : 'The message is written by the character or narrator.',
  );
  return [
    { role: 'system', content: parts.join('\n\n') },
    { role: 'user', content: text },
  ];
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
}

// The one place that decides whether an answer is safe to save. Every reason
// is named, because "it did nothing" with no reason is the complaint this
// feature would otherwise generate.
function judge(answer: any, original: string): Verdict {
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

// ---- running one refine ----
async function askModel(text: string, isUser: boolean): Promise<{ content: string; error: string }> {
  const controller: any = typeof (globalThis as any).AbortController === 'function'
    ? new (globalThis as any).AbortController()
    : null;
  const secs = Number(timeoutSecs);
  const ms = Number.isFinite(secs) && secs > 0 ? Math.min(600, Math.max(5, secs)) * 1000 : 90000;
  let timer: any = null;
  if (controller) timer = setTimeout(() => { try { controller.abort(); } catch (_) {} }, ms);
  try {
    const req: any = { messages: buildPrompt(text, isUser) };
    // The connection the reader picked for refining, which is the point of
    // being able to pick one: a rewrite does not need the model you roleplay
    // with, and running it on a cheaper one is most of the saving.
    if (connectionId) req.connection_id = connectionId;
    // Off by default. A rewrite is not a reasoning problem, and paying for
    // extended thinking on every reply is the cost nobody notices until the
    // bill arrives.
    if (thinkingMode === 'off') req.reasoning = { source: 'off' };
    if (controller) req.signal = controller.signal;
    const result = await spindle.generate.quiet(req);
    return { content: String((result && result.content) || ''), error: '' };
  } catch (e: any) {
    const msg = (e && e.message) || String(e);
    if (e && e.name === 'AbortError')
      return { content: '', error: 'the model did not answer within ' + Math.round(ms / 1000) + 's' };
    if (typeof msg === 'string' && msg.indexOf('PERMISSION_DENIED:') === 0)
      return { content: '', error: 'the generation permission is not granted' };
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
): Promise<{ ok: boolean; why: string }> {
  if (!masterOn) return { ok: false, why: 'Auto Refine is switched off' };
  if (chatsOff.has(String(chatId)))
    return { ok: false, why: 'Auto Refine is switched off in this chat' };
  if (!String(rules || '').trim() && !String(structureRules || '').trim())
    return { ok: false, why: 'there are no rules to follow yet' };

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
  // Never on the automatic pass, whatever the setting says. That pass fires off
  // a reply arriving, and rewriting what the reader just typed because the
  // character answered it is not something to do without being asked. The
  // setting governs the button, which is somebody asking.
  if (m.role === 'user' && !byHand)
    return { ok: false, why: 'your own messages are only refined when you press the button' };
  if (m.role === 'user' && byHand && !refineUserMessages)
    return { ok: false, why: 'refining your own messages is switched off' };

  const original = String(m.content == null ? '' : m.content);
  if (!original.trim()) return { ok: false, why: 'that message is empty' };

  const answer = await askModel(original, m.role === 'user');
  if (answer.error) return { ok: false, why: answer.error };

  const verdict = judge(answer.content, original);
  if (!verdict.ok) return { ok: false, why: verdict.why };

  if (confirmBeforeSave) {
    replyTo(userId, {
      type: 'confirm_refine',
      chatId: chatId,
      messageId: messageId,
      before: original,
      after: verdict.text,
    });
    return { ok: false, why: 'waiting for you to say yes' };
  }

  return saveRefined(chatId, m, original, verdict.text, userId);
}

async function saveRefined(
  chatId: string,
  m: any,
  original: string,
  next: string,
  userId?: string,
): Promise<{ ok: boolean; why: string }> {
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

      const done = await refineMessage(p.chatId, messageId, p.userId, false);
      if (!done.ok && done.why) {
        replyTo(p.userId, {
          type: 'refine_skipped',
          chatId: p.chatId,
          messageId: messageId,
          why: done.why,
        });
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
      rules = String(s.rules == null ? '' : s.rules);
      structureRules = String(s.structureRules == null ? '' : s.structureRules);
      refineUserMessages = !!s.refineUserMessages;
      connectionId = String(s.connectionId == null ? '' : s.connectionId);
      thinkingMode = s.thinkingMode === 'inherit' ? 'inherit' : 'off';
      timeoutSecs = Number(s.timeoutSecs) || 90;
      maxGrowthPct = Number(s.maxGrowthPct);
      maxGrowthPct = Number.isFinite(maxGrowthPct) ? maxGrowthPct : 60;
      minShrinkPct = Number(s.minShrinkPct);
      minShrinkPct = Number.isFinite(minShrinkPct) ? minShrinkPct : 40;
      keepOriginal = s.keepOriginal !== false;
      confirmBeforeSave = !!s.confirmBeforeSave;
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

    // Try the rules on some text without saving anything. The panel's own
    // rehearsal: the answer comes back and goes nowhere near the chat.
    if (payload.type === 'try_refine') {
      replyTo(userId, { type: 'refine_ack', requestId: payload.requestId });
      const text = String(payload.text || '');
      if (!text.trim()) {
        replyTo(userId, { type: 'try_result', requestId: payload.requestId, ok: false, why: 'there is no text to try it on' });
        return;
      }
      const answer = await askModel(text, !!payload.asUser);
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
    say('warn', 'a message from the panel could not be handled: ' + ((e && e.message) || String(e)));
  }
});

// Said once this module is listening. A panel has no way to know the backend
// was not up yet, or has restarted since and forgotten everything it was told.
// Hearing this, it says it all again.
try { spindle.sendToFrontend({ type: 'backend_ready' }); } catch (_) {}

try { spindle.log.info('Auto Refine backend loaded.'); } catch (_) {}

// No exports here on purpose. This file has no imports either, so Lumiverse
// evaluates it as a classic script, and one export would make it a module and
// change how it loads. The checks drive it the way the host does: they run the
// built file against a stub spindle and watch what it writes.
