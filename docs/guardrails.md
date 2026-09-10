# What it refuses to save

This extension hands your writing to a model and saves what comes back. Most of it is about not saving the wrong thing.

Every check below leaves the reply exactly as it was and writes a line in the panel saying which one fired. Nothing fails silently.

## The greeting, always

The opening message is written by a person. It is not generated, and it is never refined: not by the automatic pass, not by the button, and not by any setting. Asking for it by name is refused too.

This is the one rule in the extension with no switch.

## The model answered the wrong question

**A preamble.** "Here is the rewritten message", "Sure!", "I've polished this for you". The model has written about the edit instead of making it, and saving that puts the line in your chat as though the character said it.

**A refusal.** The model declining the job. Saving that would replace a scene with an apology.

**Nothing at all**, or the same text back. Neither is a rewrite.

## The rewrite sanitised the reply

The one the other checks cannot see. A softened reply is not a refusal, is the right length, and keeps every protected token. There is nothing wrong with it on its own; it is only wrong beside the original, which is the one thing no other check looks at.

**Refuse a rewrite that sanitised the reply** counts the strong words in each, the explicit and violent ones. A rewrite that dropped most of what was there is refused and the reply is left as it was.

It is built to stay quiet. The built-in list holds only words that are hard to use innocently, because everyday words like hit, skin or pain are the vocabulary of ordinary description and would fire on any refine that tightened a paragraph. It needs at least three such words in the reply before it can fire at all, and **How much of it may go** sets the fraction, 60% by default, so losing one or two reads as an edit.

That narrowness misses some real softening, and it is the right way round: a missed one leaves you where you already were, while a false one throws away a good rewrite and teaches you to distrust the feature. **Words of your own to watch** is there because you know better than any list what softening looks like in what you write.

## Asking again

**Ask again when a check fails** is 0 by default. A refusal, a preamble or a sanitised rewrite is usually the same model having a bad turn, not a settled answer, and the same request often comes back clean.

Only the failures a second try could fix are retried. A rewrite refused for its length is one the model meant, so asking again buys the same answer at the same price. A call that errored, or one you stopped, is never repeated.

Every retry is another call on your bill, which is why it is off until you ask for it.

## Waiting out a provider that will not take the call

**Wait out a provider that will not take the call** is a different thing from the setting above, and the difference is what it costs. A check that failed was paid for: the model read the prompt and wrote something, and asking again buys a second answer. A call the provider refused was never read by anything, so waiting and asking again buys the refine you already asked for.

That is why this one is on, twice by default, and the retry above is not.

It covers the answers a wait actually fixes: "too many requests", a key at its limit, a server saying it is overloaded, and the 503 a local server gives while it is loading a model. Anybody not paying per token meets one of those regularly, and every one of them clears on its own.

It never waits on a wrong key, a model that does not exist, or a prompt too long for the model. Waiting cannot fix any of those, and a refine sitting on a timer for one is worse than being told.

Where the provider says how long to wait, that is what it waits. Providers usually do say, and the figure is the only number here that is not a guess: waiting less than it spends a try being told the same thing. An hour is the ceiling, because a provider naming longer than that is naming a daily quota. Otherwise it starts at fifteen seconds and doubles.

The status line counts down while it waits, and **Stop** ends the wait as well as the call.

## The rewrite is the wrong size

**Too long.** A refine that grows a reply by more than the limit you set has written new scene instead of polishing what was there. The default is 60%.

**Too short.** A refine below the shrink limit has thrown writing away instead of tightening it. The default is 40%.

Both are yours to change, and either can be set to 0 to allow any length. Raise the growth limit if your rules genuinely ask for expansion, but read the note in [Writing rules](rules.md) first: a rule that asks for more writing is asking for a reply, not a refine.

## Wrapping, which is fixed instead of dropped

Two shapes are unwrapped instead of refused, because they are the right rewrite in the wrong packaging:

- The whole answer in quotation marks, which happens when the model reads the message as a quotation. The quotes come off, but only when there are no others inside, so a reply that opens and closes on dialogue keeps its own.
- The whole answer in a code fence, which happens when the model decides the message is a document.

## The reply moved while it was being rewritten

A refine reads the reply, sends it to a model, and writes the answer back. The model call takes seconds, and the reply is not locked in the meantime.

If the message has changed by the time the answer arrives, **the refine is dropped and nothing is written**. Somebody else's edit is worth more than a refine: the refine can be run again on the new text, and the edit cannot be recovered once it has been written over.

This covers editing a reply yourself while waiting for a refine you asked for, and any other extension that writes to a reply on the same event this refines on. Whichever write lands last would otherwise win.

If the message cannot be re-read at all, the refine goes ahead. A host that will not answer is not evidence that anything changed, and refusing every refine because a read failed is worse than the race it would be avoiding.

## Putting one back

**Keep what a refine replaced** is on by default. It holds the text as it stood before each refine so you can put it back from the panel.

It is held in memory for as long as the page is open, and never written anywhere. That is intentional: it is a way back from a refine you did not like, not a record of your chat, and keeping your writing on disk to provide an undo is a worse trade than losing the undo on reload.

---

[Back to the README](../README.md)
