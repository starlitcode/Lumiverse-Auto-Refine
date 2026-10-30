# What it refuses to save

This extension sends your writing to a model and saves what comes back. Most of it is about not saving the wrong thing.

Every check below leaves the reply exactly as it was, and writes a line in the panel saying which check it was. Nothing fails without telling you.

## The greeting

The opening message is written by a person, so it is not refined. The automatic pass skips it, the buttons skip it, and asking for it by name is refused.

**Refine the greeting**, on the Limits tab, changes this. It is off by default.

- On, the greeting can be refined like any reply, by a button, by a selection, or by **Refine every reply here**. A selection can also be taken out of it.
- The automatic pass never refines it, even when the greeting is swiped or regenerated. Only a press of a button changes it.
- A refine can change its formatting or what it says. **Put it back** undoes it while **Keep what a refine replaced** is on.

To change a greeting by hand, edit it on the character card.

## A reply that is a refusal

Sometimes the reply itself is the model refusing to write the scene. Rewriting it costs a call, and the best it can give back is another refusal.

- With **Leave a refusal as it is** on, the automatic pass does not refine a short reply that reads as a refusal. It is on by default.
- The panel says why the reply was left as it was.
- The refine button still works on it, if you want to refine it anyway.
- [Auto Retry](https://github.com/starlitcode/Lumiverse-Auto-Retry) can retry the reply instead. The reply it gets back is refined as usual.

## A reply Auto Retry is going to retry

[Auto Retry](https://github.com/starlitcode/Lumiverse-Auto-Retry) waits a few seconds before it retries a reply. It says so in the page when it sets a retry, and when it calls one off.

- The automatic pass leaves a reply that Auto Retry is going to retry. Refining it would pay for a rewrite of a reply that is about to be replaced.
- When a reply ends, the automatic pass waits for Auto Retry to say whether it will retry it, up to 3 seconds. Auto Retry decides at once, but its word reaches Auto Refine a moment after the reply ends. A chat Auto Retry is not watching is not waited on. This needs Auto Retry 5.24.2 or later.
- A refine already running when the retry is set stops before its next pass, and its rewrite is not saved.
- The reply Auto Retry gets back is refined as usual.
- If Auto Retry calls the retry off, such as when you press **Cancel**, the reply stays, so it is refined after all.
- A refine you start yourself, with a button or a selection, still runs.
- This needs Auto Retry 5.20.1 or later. With an older one, a refine stops once the retry's reply starts.

## The \* marks around actions

Many replies use \* marks around an action or a stressed word, such as \*she turns away\*. A model can drop these marks while it rewrites. With **Refuse a rewrite that loses \* marks** on, the rewrite is thrown away when:

- it has fewer \* marks than the reply, or
- the reply had every \* in a pair and the rewrite leaves one without its pair.

It is off by default. Cutting a sentence that held an \*action\* also takes its marks, so this check also refuses some good edits.

Another way to keep them is to add `\*+` to **Patterns of your own to hide**. Each run of \* marks is then hidden behind a token the model has to copy back. Only 60 pieces are hidden in one reply, so a reply with many \*actions\* is only partly covered.

## The model answered the wrong question

A rewrite is dropped when it is:

- **A preamble**, such as "Here is the rewritten message", "Sure!" or "I've polished this for you". The model wrote about the edit instead of making it. Saving it would put that line in your chat as if the character said it.
  - A short first line about the edit, on its own line above the rewrite, counts too. For example, a label such as "Revised selection:", or "Okay, here is the edit."
  - A first line your passage already started with is never a preamble. So a heading such as "Part two:" is kept, and so is a passage that starts with "Sure,".
- **An offer of another version.** Some models write the rewrite, then a line such as "If you would like a second version, here it is:", then the rewrite again. Only the first version is saved. The offer and what follows it are shown with the model's notes on the Log tab. A line that was already in your passage is never counted as an offer.
- **A refusal.** The model declined the job. Saving it would replace your scene with an apology.
- **Empty**, or the same text back. Neither is a rewrite.

## A broken rewrite

A model can break down while it rewrites, the same ways a reply can break. **Refuse a broken rewrite** throws the rewrite away when it:

- **came back garbled**: words from several languages run together, words with no spaces between them, broken characters such as `cafÃ©` for `café` or a model's own marks `Ġ` and `Ċ` printed in place of a space or a line break, or a switch to another alphabet that runs to the end
- **got stuck repeating or rambling**: a word or phrase repeated over and over to the end, 30 words in all, such as `and,` 30 times; a short pattern such as `1.1.1.1.` repeated hundreds of times; or 150 words on one line with no punctuation
- **ran into the prompt's own format**: a marker such as `[/INST]` or `<<SYS>>`, a heading such as `### Instruction:`, the start of the next turn, or a character card's data

It is on by default. Each one only counts when the rewrite has it and your reply did not. So a reply that already had a passage in Russian, or a chant that repeats, can still be refined.

Writing set apart on purpose is also left alone:

- a passage in another alphabet in quotation marks or asterisks, in a quoted block, or after a colon
- a character card or a prompt format written out on purpose: at the very start of the rewrite, or after a colon, such as "Here is the card:"
- repetition in quotation marks or asterisks that close again after it, in a quoted block, or after a colon, such as a crowd's chant or the same line written out many times
- one long word, a held sound such as `nooooooo`, web addresses and hashtags, and German or Dutch, which write long words on purpose

A model stuck in a loop does not close a quotation mark or an asterisk it opened, so a loop inside dialogue that never closes still counts. Code is never checked.

[Auto Retry](https://github.com/starlitcode/Lumiverse-Auto-Retry) uses the same checks and the same numbers on a reply.

## The rewrite softened the reply

A softened rewrite is not a refusal, is the right length, and keeps every protected token. It only looks wrong next to the original, so the other checks cannot see it.

**Refuse a rewrite that sanitized the reply** counts the strong words in each version: the explicit and violent ones. If the rewrite dropped most of them, it is refused and your reply is left as it was.

It is built to avoid false alarms:

- The built-in list only holds words that are hard to use innocently. Everyday words like hit, skin or pain are left out, because they are normal description.
- The reply needs at least three strong words before the check can fire.
- **Strong words a rewrite can lose (%)** sets how many may be dropped, 60% by default, so losing one or two counts as an ordinary edit.

Because the list is narrow, it misses some real softening. That is on purpose. A missed one leaves your reply as it was. A false one would throw away a good rewrite. **Words of your own to watch** is for the words that matter in your own writing.

### The word that arrives in its place

When a model softens a scene, it often swaps a blunt word for a softer one: killed becomes unalived, blood becomes crimson liquid, sex becomes intimacy. The same check looks for these swaps, from a built-in list of pairs.

A pair only counts when **both halves happen**:

1. The soft word is in the rewrite and was not in your reply.
2. The blunt word it replaces was in your reply and is gone from the rewrite.

Either half alone proves nothing. A model can write "eliminate" about a possibility, and a refine can drop "kill" while tightening a line. Needing both is what lets ordinary words like eliminate, defeat or intimacy be on the list.

One confirmed swap is enough. A reply whose only "killed" came back as "unalived" has been softened, even though one word is below what the counting check needs.

**Swaps of your own to watch** takes one pair a line, written `soft => blunt`. An exported find-and-replace list can be pasted in as it is. A line with nothing on the right is skipped.

What it cannot catch:

- A rewrite that keeps every word but softens the scene another way, such as fading out at the key moment or going vague.
- It can be wrong on an idiom. If your reply said "killed the engine" and the rewrite says "eliminated the noise", the rewrite is refused. That costs you the rewrite, never your reply.

## Asking again

**Ask again when a check fails** is 0 by default. A failed check is often a one-off, and the same request can come back fine.

- Only failures that a second try could fix are retried: a refusal, a preamble, a softened rewrite, an empty answer, an answer cut off mid-write, and a broken rewrite.
- A rewrite refused for its length is not retried, because the model meant it and would give the same answer.
- A call that errored is not repeated. The exception is an error from the provider's filter, such as "content_filter". That is a refusal sent as an error, so it is asked again like a refusal.
- A call you stopped is never repeated.
- Every retry is another call on your bill, which is why it is off by default.

## A note when it asks again

**Send a note when it asks again** is off by default. It shows under **Ask again when a check fails** once that is above 0.

When it is on, the ask made again carries a note at the end of the request. The note says what went wrong with the last answer. The first ask never carries a note.

There are four notes, one for each kind of failure:

| Failure | Note |
| --- | --- |
| The model declined, or a provider's filter stopped it | **After a refusal** |
| The rewrite took out or toned down strong words | **After a softened rewrite** |
| The model answered with nothing | **After an empty answer** |
| The rewrite came back garbled, repeated itself to the end, or ran into the prompt's own format | **After a broken rewrite** |

Other failures, such as an answer that talks about the edit, are asked again with no note.

What to know:

- Each note is in the fold **What the notes say**, with its built-in text. You can change it there.
- **Use the built-in text** under a note puts its built-in text back.
- A note left empty is not sent. The ask goes out without it.
- **Who the notes come from** sets the role of the note: System, User or Assistant. It is User by default, and the built-in notes are written as you.
- The note goes after the whole prompt, so it is the last thing the model reads.
- The Log says when a note went with an ask, and which one.
- With **Several rewrites at once** on, every rewrite in the new try gets the note.

## Several rewrites at once

**Several rewrites at once** is off by default. When it is on, each try writes several rewrites at the same time instead of one.

1. The same request goes to the model **How many at once** times, 2 by default and 5 at most.
2. Each rewrite is checked the moment it arrives, with the same checks as a single rewrite.
3. The first one that passes is used. The others still being written are stopped.
4. If none pass, nothing is saved and your reply is left as it was. The Log gives the last check that failed.

What to know:

- Every rewrite is a whole call on your bill, including the ones that are stopped. With 3 at once, one refine costs up to 3 calls.
- The rewrites do not stream. The status line says how many are being written and how long it has been.
- It works with **Ask again when a check fails**. Each new try is then several at once too.
- Stop ends every rewrite still being written.

## The limit on one reply

The automatic pass refines a reply again when its words are new. That is what lets it work alongside [Auto Retry](https://github.com/starlitcode/Lumiverse-Auto-Retry): every reply Auto Retry re-rolls is new, and each gets its refine. That includes a reroll Auto Retry adds with **Several tries at once**.

But the same test cannot tell new writing from a loop, such as:

- another extension rewriting what this one wrote
- Lumiverse announcing the same reply under new ids
- a chat being swiped through very fast

So the automatic pass refines one reply at most twelve times, for as long as Lumiverse is running. It is a safety stop. Nobody reaches it in normal use.

Pressing the refine button on a reply always works, whatever the count. The Log says when the automatic pass has stopped on a reply, and why.

## Waiting out a provider that will not take the call

**Wait out a provider that will not take the call** is on by default, and tries twice. It is different from **Ask again when a check fails**:

- A failed check was paid for. The model read the prompt and wrote something.
- A refused call was never read, so nothing was spent. Waiting and asking again gets the refine you already asked for.

It waits on:

- "too many requests"
- a key at its limit
- a server saying it is overloaded
- a local server answering 503 while it loads a model

It never waits on a wrong key, a model that does not exist, or a prompt too long for the model. Waiting cannot fix those.

How long it waits:

- If the provider says how long, it waits exactly that. Waiting less would only get the same answer.
- The most it waits is an hour. A provider asking for longer is naming a daily limit.
- If the provider does not say, it waits fifteen seconds, then doubles each time.

The status line counts down while it waits. **Stop** ends the wait and the call.

## The rewrite is the wrong size

- **Too long.** A rewrite that grows the reply by more than your limit has written new scene. The default limit is 60%.
- **Too short.** A rewrite that shrinks it by more than your limit has thrown writing away. The default limit is 40%.

Set either to 0 to allow any length. Before raising the growth limit, read [Making your own prompt](rules.md#rules-to-keep-in-every-prompt): a rule that asks for more writing is asking for a new reply.

## Wrapping, which is fixed instead of dropped

Two kinds of answer are unwrapped instead of refused, because the rewrite inside is fine:

- **The whole answer in quotation marks.** The quotes come off, but only when there are no other quotes inside, so a reply that starts and ends with dialogue keeps its own.
- **The whole answer in a code fence.** The fence comes off.

## The reply changed while it was being rewritten

A refine reads the reply, sends it to a model, and writes the answer back. That takes seconds, and the reply can change in the meantime.

- If the reply changed before the answer arrived, **the refine is dropped and nothing is written**. The refine can be run again on the new text. An edit written over cannot be recovered.
- This covers you editing the reply while you wait, and another extension writing to it at the same time.
- **Thinking moved out of the reply does not count as a change.** If only the thinking at the start or end of the reply was moved, for example into the Reasoning box, the refine is saved. It is saved without the thinking that was moved out.
- **Another extension rewriting its own hidden block does not count either.** Some extensions rewrite their block in a reply right after the reply ends. If only that block changed, the refine is saved, with the block as the extension left it. See [Another extension's blocks](prompt.md#another-extensions-blocks).
- If the reply cannot be read again at all, the refine goes ahead. A failed read does not mean anything changed.

## Putting one back

**Keep what a refine replaced** is on by default. It keeps the text from before each refine, so you can put it back from the panel.

It is kept in your server's memory, so it comes back after a reload. An update or a restart of Lumiverse clears it.

**Keep them through an update** is under it, and off by default. On, the list is also saved on your server, for your account only, so it lasts through an update or a restart. Turning it off empties the saved copy.

Your server keeps the last 30 refines at most. It is there to undo a refine you did not like. It keeps no record of your chat.

---

[Back to the README](../README.md)
