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

## The rewrite is the wrong size

**Too long.** A refine that grows a reply by more than the limit you set has written new scene rather than polished what was there. The default is 60%.

**Too short.** A refine below the shrink limit has thrown writing away rather than tightened it. The default is 40%.

Both are yours to change, and either can be set to 0 to allow any length. Raise the growth limit if your rules genuinely ask for expansion, but read the note in [Writing rules](rules.md) first: a rule that asks for more writing is asking for a reply, not a refine.

## Wrapping, which is fixed rather than dropped

Two shapes are unwrapped instead of refused, because they are the right rewrite in the wrong packaging:

- The whole answer in quotation marks, which happens when the model reads the message as a quotation. The quotes come off, but only when there are no others inside, so a reply that opens and closes on dialogue keeps its own.
- The whole answer in a code fence, which happens when the model decides the message is a document.

## The reply moved while it was being rewritten

A refine reads the reply, sends it to a model, and writes the answer back. The model call takes seconds, and the reply is not locked in the meantime.

If the message has changed by the time the answer arrives, **the refine is dropped and nothing is written**. Somebody else's edit is worth more than a refine: the refine can be run again on the new text, and the edit cannot be recovered once it has been written over.

This is not a hypothetical. Auto Retry applies word swaps to a reply on the same event this refines on, and its swap used to land while the refine was still in flight. Whoever wrote last won, and it was usually this. The same case covers editing a reply yourself while waiting for a refine you asked for.

If the message cannot be re-read at all, the refine goes ahead. A host that will not answer is not evidence that anything changed, and refusing every refine because a read failed is worse than the race it would be avoiding.

## Putting one back

**Keep what a refine replaced** is on by default. It holds the text as it stood before each refine so you can put it back from the panel.

It is held in memory for as long as the page is open, and never written anywhere. That is intentional: it is a way back from a refine you did not like, not a record of your chat, and keeping your writing on disk to provide an undo is a worse trade than losing the undo on reload.
