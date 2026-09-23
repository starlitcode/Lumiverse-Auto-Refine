# Writing rules

A rule is a block in your prompt. This page is about what to write in one. [How the prompt is built](prompt.md) covers the blocks themselves.

## One subject per block

Give each block one job, and a tag that names it:

```
<speech>
Every line keeps its meaning. You can fix phrasing that is stiff. You cannot
change what was said, and you cannot add a line nobody said.

Cut the tag that explains the line: she said angrily, he asked, curious. If the
tone is not already in the words, fix the words.
</speech>
```

- **The tag matters.** A model reads a tagged block as one instruction. Without tags, blocks run together into one long paragraph, and the model follows it less closely.
- **Write to the model as "you".** For example, "cut the sentence that repeats the one before it", not "sentences that repeat should be cut".

## Say what to do, not only what to avoid

A rule that only says what not to do leaves the model to guess what to do instead. Say both:

```
Cut a heartbeat used to stand in for a feeling. Put in its place what the
character actually does with their hands.
```

## Be specific enough to check

- "Make it better" or "improve the flow" gives the model nothing clear to do, and you cannot tell whether it followed the rule.
- "Cut adverbs on speech tags" is a rule you can check.
- The most useful rules name the exact phrase you are tired of reading. If you have noticed a phrase three times this week, put it in the rule.

## Do not ask for more writing

Rules like "add sensory detail" or "expand the description" ask for new writing, not a refine. A refine that makes a reply half again as long has written new scene, and the length limit will drop it anyway.

If you want more writing, ask your roleplay model. A refine tightens what is already there.

## Let a good passage stay as it is

Somewhere in your prompt, say that a passage that is already good comes back unchanged. Without this, a model asked to improve something will always change something, and you can lose lines you liked without noticing.

## Two things to always say

Both of these go wrong without any warning. The four built-in prompts say both, and your own prompt should too.

**The point of view.** A reply in first person and present tense, from inside one character's head, can come back in third person with another character's thoughts in it. Nothing about that looks like an error. Say that the passage keeps its person, its tense, and the character whose head it is written from.

**How strong it is.** A model rewriting roleplay tends to soften it: less heat, vaguer violence, politer swearing. Say that the passage comes back as strong as it went in, and that the model decides how a line reads, not whether it should have been written.

[What it refuses to save](guardrails.md) can catch a rewrite that softened a reply. But by then you have paid for the call, so it is better to ask for this in the prompt.

## Where a rule goes

- The order of blocks changes how closely a rule is followed.
- Anything below the turn reads as an instruction about it. If the model will not follow a rule, move it down, closer to the message.
- Blocks that never change go at the top. Blocks that change every turn go near the passage.

## Trying a rule

Use **Refine the latest reply**, above the tabs, to test a new block. It runs once, on one reply, and **Put it back** is on the card if you do not like the result.

If a rule does nothing, the usual reasons, most common first:

1. It is too vague to act on.
2. It is too far from the turn.
3. It shares a block with several other rules, and the model only followed the first.

---

[Back to the README](../README.md)
