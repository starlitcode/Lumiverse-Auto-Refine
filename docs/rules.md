# Writing rules

A rule is a block in your prompt. This page is about what to put in one, and what not to. [How the prompt is built](prompt.md) covers the blocks themselves.

## One subject per block

Give each block one job and a tag that names it:

```
<speech>
Every line keeps its meaning. You can fix phrasing that is stiff. You cannot
change what was said, and you cannot add a line nobody said.

Cut the tag that explains the line: she said angrily, he asked, curious. If the
tone is not already in the words, fix the words.
</speech>
```

The tag is not decoration. A model reads a tagged block as one instruction; the same words run together with the block above them read as a paragraph, and paragraphs blur.

Second person throughout. You are talking to the model, so write like it: "cut the sentence that repeats the one before it", not "sentences that repeat should be cut".

## Say what to do, not only what to avoid

A rule that only forbids leaves a hole, and a model fills a hole with whatever is nearest. Pair the two:

```
Cut a heartbeat used to stand in for a feeling. Put in its place what the
character actually does with their hands.
```

## Be specific enough to check

"Make it better" and "improve the flow" give a model nothing to act on, and you will not be able to tell whether it followed them. "Cut adverbs on speech tags" is a rule with an answer.

The most useful rules name the exact thing you are tired of reading. If you have noticed a phrase three times this week, put the phrase in.

## Do not ask for more writing

Every rule that asks for expansion is asking for a reply rather than a refine: add sensory detail, deepen the emotion, expand the description. A refine that grows a reply by half has written new scene, and the length limit will drop it anyway.

If you want more, ask your roleplay model for more. This is the pass that tightens what is already there.

## Leave room for the message to be fine

Somewhere in your prompt, say that a passage which is already good comes back untouched. Without that, a model asked to improve something will find something to improve, and you will lose lines you liked without noticing which ones.

## Where a rule goes

Order changes how strongly a rule lands. Anything below the turn reads as an instruction about it, so a rule you cannot get a model to follow is worth moving down, closer to the message.

Blocks that never change belong at the top. If your provider caches prompts, everything up to the first change is reused, and a rule you edit every day at the top of the prompt costs you that reuse on every refine.

## Trying one

**Refine the latest reply**, above the tabs, is the cheap way to find out whether a new block does anything: it runs once, on one reply, and **Put it back** is right there on the card if it went the wrong way.

If a rule does nothing, the usual causes are these, in order: it is too vague to act on, it is too far from the turn, or it is buried in a block with four other rules and the model took the first one.

---

[Back to the README](../README.md)
