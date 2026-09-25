# Making your own prompt

The four built-in prompts are a starting point. They work for most people, and they only ask for fixes that suit every kind of story.

Your own prompt can do more. It can know your story, your model and your taste. This page shows you how to build one, step by step.

[How the prompt is built](prompt.md) explains blocks, macros and roles. This page is about what to write in them.

## What every prompt must have

These are not about quality. Without them, a refine does not work, or it saves the wrong thing into your chat.

**1. A block with `{{message}}` in it, switched on.**

- `{{message}}` is the reply being refined. It is how the model sees the passage.
- Without it, nothing is sent. The panel says: "Your prompt has no {{message}} block, so there is nothing to rewrite."
- The built-in prompts keep it in the **Passage** block.

**2. A request for the answer between `<REFINED>` and `</REFINED>`.**

- Only what is between these two tags is saved into your chat.
- Without the tags, the whole answer is saved. That includes anything the model writes around the rewrite, like "Here is the rewritten message" or a list of scores.
- With the tags, a rewrite that was cut off halfway is caught and not saved.
- The built-in prompts ask for the tags in the **Hand It In** block.

**3. At least one block sent as User.**

- Some providers return an error for a request made only of System messages.
- The built-in prompts send the **Passage** block and the **Hand It In** block as User. Keep them that way.
- **Do not end on an Assistant block** unless you know your model accepts one. An Assistant block at the end is called a prefill, and many newer models no longer accept it. See [Roles](prompt.md#roles).

**4. The Protected Formatting block, if you hide markup.**

- **Hide markup from the model**, on the **Limits** tab, is on by default. It swaps your formatting for tokens like `[[AR1]]` before the refine.
- The **Protected Formatting** block tells the model to keep those tokens.
- Without that block, the model may drop a token. Then the rewrite is not saved.

**5. Notes outside the tags, if you ask for notes.**

- If you ask the model for scores or notes, ask for them outside `<REFINED>`. Anything inside the tags goes into your chat.
- To see the notes while the model writes, put them in `<REFINE_NOTES>`.

**The easy way to get all five:** start from a built-in prompt, as in Step 1. Keep the **Passage**, **Hand It In** and **Protected Formatting** blocks, and change the rest.

**Your own messages have their own prompt.** If you refine what you wrote yourself, that prompt needs all five as well.

## The short version

1. Start from a built-in prompt and save it under your own name.
2. Read some of your replies and write down what annoys you.
3. Group what you found by kind, with two or three examples each.
4. Write each rule as "cut this, and write this instead".
5. Keep it short.
6. Test it on one reply, then change one thing at a time.

Each step is explained below.

## Step 1: Start from a built-in prompt

Do not start from nothing. A built-in prompt already does the hard parts:

- it keeps the point of view and the tense
- it keeps the story as strong as it was
- it leaves good lines alone
- it asks for the answer in the right tags

To copy one:

1. Open the **Prompt** tab.
2. Pick a built-in prompt from the list.
3. Press **Save as new** and give it a name.
4. Now you can change any block. A built-in prompt cannot be changed until you save it as your own.

**Which one to start from:**

- Your model reasons, or has a thinking mode: pick **A judge that thinks**.
- Your model does not reason: pick **A judge**.
- You want to fix your own messages: pick **A line judge** or **A line judge that thinks**.

## Step 2: Find what annoys you

Read five or ten recent replies from your chat. Write down every phrase or habit that made you roll your eyes.

Two things help:

- **Find phrases this chat has worn out**, on the **Limits** tab, counts the phrases your replies keep using. Switch it on and read the list in the **Worn Out** block.
- Your own feeling counts. If you have noticed a phrase three times this week, it belongs in a rule.

## Step 3: Group by kind

A long list of single phrases is a weak rule. The model skims it, and it only catches the exact phrases on the list.

A kind of phrase is stronger. The model learns the pattern and catches the versions you did not list.

**Weak:** a list of every heart phrase you have seen.

```
- her heart hammered
- his heart pounded
- her heart raced
- his heart thundered
```

**Strong:** the kind, with a few examples.

```
- bodies on autopilot: a hammering heart, a racing pulse, a dropping stomach
```

Two or three examples are enough. They show the model what the kind looks like.

## Step 4: Say what to write instead

A rule that only says "do not" leaves the model to guess. It often guesses a close copy of the same thing. A shiver becomes a tremble.

So every rule says two things:

1. what to cut
2. what to write in its place

**Example:**

```
Cut a heartbeat that stands in for a feeling. Write what the character
does with their hands instead.
```

**Be specific enough to check.** You should be able to read the result and say yes or no.

- "Make it flow better" cannot be checked.
- "Cut adverbs on speech tags" can be checked.

## Step 5: Keep it short

Every word of your prompt is sent on every refine. A longer prompt costs more. It also makes each rule weaker, because the model has more to hold at once.

- **One subject per block.** Give each block one job and a tag that names it.
- **Cut rules that never fire.** If a rule has not changed anything in a week, take it out.
- **Put the rules you care about most near the bottom.** A rule close to the passage is followed more closely.

**Example of one block with one job:**

```
<dialogue>
Every line keeps its meaning and its speaker.

When a tag has to explain the line, like she said angrily, fix the line
and drop the explaining.
</dialogue>
```

## Step 6: Match your model

A model that reasons and a model that does not need different prompts.

**A model that does not reason** follows a list better than an idea.

- Give it the list of kinds, with examples.
- Ask for the rewrite and nothing else.

**A model that reasons** can work from an idea.

- Give it a standard, like "a sentence that could sit in any other story is the one to fix".
- Tell it where to look.
- You can ask it to write its working in `<REFINE_NOTES>`. You can read that on the **Log** tab, and it shows you why it changed each line.

## Step 7: Add your own taste

The built-in prompts leave out anything that is a matter of taste. They have to work for everyone.

Your prompt only has to work for you. So this is where it can get much better than the built-in ones.

Some ideas people often want. Only add the ones you agree with.

- No speech tags when only two people are talking.
- No em dashes in the narration.
- No one-line paragraphs used for drama.
- No exact counts, like "three heartbeats" or "exactly four steps".
- Units and money that fit your setting, not the ones from the real world.
- No sentences that start with "And" or "But".

You can also write rules about your own story:

- A character's voice: "Mara never swears. Keep it that way."
- Words that fit your setting: "This is a fantasy world. There are no minutes or miles."

## Step 8: Test it

1. Open a chat with a reply you want to test on.
2. Press **Refine the latest reply**, above the tabs.
3. Read the before and the after on the card.
4. If you do not like it, press **Put it back**.

**Change one thing at a time.** If you change three rules and the result gets worse, you will not know which rule did it.

**If a rule does nothing,** these are the usual reasons, most common first:

1. It is too vague to act on.
2. It is too far from the passage. Move it lower.
3. It shares a block with several other rules, and the model only followed the first one.

## Rules to keep in every prompt

These go wrong without any warning, so every prompt needs them. The built-in prompts have all of them. If you start from one, you already have them.

**Keep the point of view.** Say that the passage keeps its person, its tense, and the character whose head it is told from. Without this, first person can come back as third person, with another character's thoughts in it.

**Keep the strength.** Say that the passage comes back as strong as it went in. A model rewriting roleplay tends to soften it: less heat, vaguer violence, politer swearing.

**Let a good passage stay the same.** Say that a passage that already reads well comes back unchanged. Without this, the model always changes something, and you can lose lines you liked.

**Do not ask for more writing.** Rules like "add sensory detail" ask for new writing. A refine is for fixing what is there. If you want more writing, ask your roleplay model instead. A refine that makes a reply much longer is also dropped by the length limit.

[What it refuses to save](guardrails.md) can catch a rewrite that softened a reply. But by then you have paid for the call, so it is better to ask for this in the prompt.

---

[Back to the README](../README.md)
