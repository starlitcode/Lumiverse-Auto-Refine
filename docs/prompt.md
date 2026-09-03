# How the prompt is built

A refine is one model call. This page is about what goes in it.

Most extensions of this kind hand you a rules box and keep the rest to themselves, so when a rewrite comes out wrong there is no way to tell whether the model ignored your rule or never saw the thing your rule was about. Here the prompt **is** the settings. Under the **Prompt** tab it is a list of blocks you wrote, in the order they are sent, each with a role of its own.

## A block

A block is a name, a role, and text. The name is only for you. The role is System, User or Assistant. The text is what gets sent, and what makes it worth anything is the macros in it.

Blocks are sent top to bottom. Two next to each other with the same role are joined into one message, because providers disagree about what two system messages in a row mean and putting them together is what you meant by putting them together.

A block whose text comes out empty is left out, not sent blank, and so is one that is nothing but empty tags: a chat with no lorebook does not send `<world></world>`, which reads to a model as "this world is empty" rather than as "nothing was said about the world".

## Macros

Anything in double braces is filled in at the moment of the refine. There are two kinds, and the difference matters.

**Ours**, which only this extension can answer:

| Macro | What it becomes |
| --- | --- |
| `{{message}}` | The turn being refined. |
| `{{history}}` | The messages leading up to it, as many as **Context** says. |
| `{{lore}}` | The lorebook entries this chat has active. |
| `{{whose}}` | A line saying whether the passage is the story's own voice or your co-author's. |
| `{{protect_notes}}` | The instruction to leave protection tokens alone. Only appears when there are some. |

There is no macro for the model's reasoning. Where it keeps that is `<REFINE_NOTES>`, a tag you write into your own prompt in your own words, covered in [Asking it what it changed](#asking-it-what-it-changed).

**Lumiverse's**, which the host resolves: `{{description}}`, `{{personality}}`, `{{scenario}}`, `{{persona}}`, `{{char}}`, `{{user}}`, and anything else that works in a character card or a preset.

They are resolved in that order for a reason. Ours go in **last**, after the host has run, so nothing in your chat is ever handed to a macro resolver. A reply that happens to contain the text `{{persona}}` stays as those nine characters instead of quietly expanding into somebody's prompt.

**Every prompt needs `{{message}}` somewhere.** Without it the model is never shown the thing it is meant to rewrite, so the refine is refused before anything is spent, and the Prompt tab says so in the danger colour.

## Order matters more than it looks

The turn is last by default, and that is worth keeping. Anything after the message reads as an instruction about it, so a rule placed below it is more likely to be followed, and a block of narration placed below it is more likely to be treated as something to act on. A new block goes in above the turn unless you move it.

The other reason order matters is caching. If your provider caches prompts, the reuse runs from the front up to the first thing that changed, so the order that costs least is the order of how often something moves:

1. **The rules.** Identical on every refine in every chat.
2. **The setting**: who the story follows, who you are writing with, what is true in its world. Identical for a whole chat.
3. **The pages before this one.** Redrawn every turn.
4. **The passage.** Different every time.

All five shipped prompts are built this way, and there is a check that fails if one stops being. It is worth knowing because getting it wrong is invisible: an earlier version put the run-up third, which put a block that is redrawn every turn above every rule, and made the whole prompt count as new on every single reply. Nothing looked broken. It just cost more.

## Roles

System is right for almost everything. Two cases where changing it helps:

- A model that ignores system instructions. Some providers weight the last user message far more heavily than anything in the system prompt, and moving your rules to **User** is the fix.
- A model that treats the message as something to continue instead of editing. Sending the turn as **Assistant** makes it read as the thing already written, which sometimes stops a model appending a new paragraph to it.

## The answer it asks for

The rewrite comes back between `<REFINED>` and `</REFINED>`, and only what is between them is saved.

This is worth more than it sounds. Without it, a model that opens with "Sure! Here is the rewritten message:" has its whole answer dropped, because saving that line into your chat is worse than saving nothing. With it, the sentence outside the tags is simply ignored and the rewrite lands. It also catches an answer that ran out of room: an opening tag with nothing closing it means the rewrite was cut off, and a half-written message is never saved.

**Asking for the tags is your prompt's job, not a macro's.** The prompts that ship with it ask in the **How to answer** block, in plain words sitting in a text box you can reword, move or delete. There is no `{{output_format}}` filling it in for you, and that is the point: an instruction you cannot see is one you cannot argue with, and this one is worth arguing with.

**Take the answer from between the tags**, under Limits, is the reading half and is on by default. It decides what is done with an answer, never what is asked for. Off, the whole answer is taken as the rewrite and the older checks catch a preamble instead.

## What a reasoning prompt asks for

The two reasoning prompts ask for the answer in two parts:

```
<REFINE_NOTES>
what is weak, what you intend to change and why, what you are leaving alone
</REFINE_NOTES>
<REFINED>
the rewritten message
</REFINED>
```

`<REFINE_NOTES>` sits outside `<REFINED>`, so none of it can reach your chat: anything the model writes there is dropped, not saved. Nothing in the panel shows it any more, so asking for working is asking the model to think before it writes rather than asking to read the thinking afterwards. If you only wanted to read it, take the tags out of your prompt and stop paying for them.

**The two plain prompts do not ask for this**, and it is a choice, not an oversight. A model that does not reason, given a thinking tag, fills it with a summary of what it is about to do and then does something else: output spent on a paragraph nobody wanted.

Both tags are shouted. A model skimming a long prompt for the shape of the answer finds a run of capitals before it finds a word, and these are the only two things in the prompt that have to be got exactly right. The answer is read case-insensitively, so a prompt you wrote in lower case still works.

## Asking it what it changed

Nothing outside the `<REFINED>` tags is ever saved into your chat. That makes the space around them somewhere a prompt can safely ask for anything it likes, and the obvious thing to ask for is a report: what was cut, what was added, what it chose to leave.

Add the tags you want to the **How to answer** block, in your own words. For example:

```
Before the rewrite, list what you changed:

<cut>every phrase you removed, one per line</cut>
<added>anything you added, one per line</added>
<kept>anything you were tempted to change and left alone, and why</kept>

Then give the rewrite between <REFINED> and </REFINED>.
```

What comes back outside the tags is dropped rather than written into the message. What the refine did to your writing is on the card that comes up when it lands, marked word by word: struck through where the rewrite took something out, plain where it left it alone.

The names of those tags are yours. Nothing in the extension looks for `<cut>` or `<kept>`; it takes the rewrite from between `<REFINED>` and `</REFINED>` and shows you everything else. Ask for a paragraph of prose instead if that reads better.

## The four prompts that ship with it

Two questions have different answers: does your model reason, and do you want the short version or the whole thing.

| Prompt | What it is |
| --- | --- |
| **Short** | Everything Detailed says, in three rule blocks instead of nine. |
| **Detailed** | The same rules, one to a block, each said at length: phrases, words, repetition, rhythm, speech, bodies, endings. |
| **Short, for a thinking model** | The standard, and let it work out the rest. Asks for its working in `<REFINE_NOTES>`. |
| **Detailed, for a thinking model** | The standard, the five places to point it, keeping the writer's voice, and a pass over its own answer. Asks for its working in `<REFINE_NOTES>`. |

**Short and Detailed cover the same ground.** Pick by how much prompt you want to pay for on every refine, not by what it catches. Detailed is followed more closely because it says each rule at length and gives it a heading of its own; Short costs a fraction as much per reply.

The reasoning pair is the shorter one on purpose. A model that reasons is given the standard and left to apply it. A model that does not is given the list, because it will match a list and will not derive one from a principle.

The rules themselves are specific, not general. "Cut clichés" gives a model nothing to act on; the shipped prompts name the phrases, and they are the ones that turn up in machine-written roleplay several times a session and in published fiction almost never: a held breath, a hammering heart, a whisper, darkening eyes, a shiver, the ghost of a smile, air thick with something, an emotion given as a mixture of two others.

All four work as they stand. Load one, change whatever you like, save it under a name of your own.

## How much it is told

Three settings under **Context**, and they are the ones most likely to make a refine expensive without looking like it. Every one of them costs tokens on every single reply.

**Messages of run-up to send** is how many messages before the one being refined. Four is the default. Zero sends none, which is fine for rules about wording and wrong for rules about continuity: a model that cannot see the run-up will smooth a scene into general prose and take the thread out with it.

**Most tokens of run-up** is a ceiling on the same thing, and whichever runs out first decides. Whole messages are kept or dropped, working backwards from the message being refined, so the turn just before it always survives.

**Most tokens of lorebook** is a ceiling on the entries this chat has active. Whole entries again: half a lorebook entry is worse than one fewer of them.

Tokens, not characters, because that is the unit a context window is measured in, and the same eight thousand characters is a wildly different amount of prompt depending on the language and the formatting. They are counted with Lumiverse's own tokeniser where it will answer, and estimated at four characters a token where it will not.

## Protecting what is not prose

Ask a model to improve a paragraph and it will happily drop a `<font color>` tag, reflow a code block, or decide an image link was a typo. None of that is writing, and none of it is the model's to touch.

**Hide markup from the model**, under Limits, is on by default. Before the refine, each run of markup is lifted out and replaced with a short token like `[[AR1]]`. The model is told the tokens must come back untouched. Afterwards the real text goes back.

What makes this a guarantee, and not just a hope, is the last step. **If a token did not come back, the rewrite is dropped.** Asking a model to preserve something and checking that it did are different things, and only the second one is a guarantee.

What gets protected: fenced code in both fence styles, inline code, images, links, bare URLs, comments, HTML entities, wiki brackets, spoiler bars, table rows, the bracket a lot of trackers print in, and any tag carrying an attribute, which is where a colour or an href lives.

Braces are left alone on purpose. A macro sitting in a reply is already safe, because ours are filled in after the host's pass, so it reaches the model as the characters somebody typed.

**Patterns of your own to hide** takes one regular expression per line and adds them to that list instead of replacing it. Replacing is how somebody ends up with one pattern of their own, none of the defaults, and a rewrite that ate a code block; what a particular card needs is nearly always one more shape. Yours are tried first, so a pattern written for one card wins over the general rules. A pattern that will not compile is named under the box, and one that matches the empty string is refused, since it would match at every position and turn the whole message into tokens.

**Patterns to keep visible** is the other direction: a region matching one of these stays in front of the model even when a rule above would have hidden it. The tag rule is broad on purpose, and this is how you narrow it without losing it.

**Bare inline formatting stays visible.** `<i>`, `<b>`, `<em>` and the rest wrap words in the middle of a sentence, and replacing them with tokens hands the model a sentence with holes in it. That made the rewrite worse to protect something the model was unlikely to break. They stay where they are, and the prompt tells it to leave them alone. **Hide plain italic and bold too** puts them behind tokens as well if you would rather.

Protection catches what it can find. The prompts that ship with it also carry a **What not to touch** block, because the two cover different holes: a stat block, a translation line beside the original, a tracker somebody's card prints every turn, none of those are wrapped in tags, so nothing can lift them out and only the instruction keeps them intact.

**Strip reasoning tags before it is sent** is separate and also on by default. A reasoning model's working is not your writing, and a rewrite of it would sit in a place nobody looks. It is cut off before the refine and put back exactly as it was. **Extra reasoning tag names** is under it, for a model that wraps its working in something the built-in eight do not cover.

**Strip reasoning tags out of the answer** is the other side of the same coin: working the refining model adds when it answers, as opposed to working already in the reply. The tags catch most of it, since anything outside `<REFINED>` is ignored, but two cases got through and this closes them: an answer with the tags switched off, where the whole thing is taken as the rewrite, and a model that puts its working inside the tags.

## Sampler settings

Under **Model**, every sampler is blank to begin with, and blank means the connection's own preset decides. That is the right default: if you tuned a preset, an extension should not quietly override it.

Fill one in and it is sent with the refine and only with the refine. Your chat is not affected, and neither is the preset.

**Context size** and **Longest answer** are the two ceilings. Both are blank to begin with, and blank leaves them to the connection, which is nearly always right: a refine sends one message, its run-up and your rules, so it is a small request next to a chat.

Temperature is the one worth touching. A rewrite usually wants it lower than the one you roleplay with, since you are asking for the same scene said better, not for another idea. **Longest answer** is worth a look in the other direction: a ceiling low enough to cut the rewrite off mid-sentence gets it dropped for being too short, which looks like the refine failing rather than the setting being tight.

**Clear them all** hands every one of them back to the connection.

## How much thinking it does

Under **Model**, **Let it think first** has three answers:

- **No, keep it quick.** The default. Rewriting a paragraph is not a reasoning problem, and extended thinking on every reply is the cost nobody notices until the bill arrives.
- **Whatever my connection is set to.** Sends nothing at all on the subject, which is what leaves your own reasoning settings in charge. Pick this if you have already tuned reasoning where you configure your models.
- **Yes, and I will say how much.** Adds an effort level: auto, none, minimal, low, medium, high, extra high or max. What each one means is the provider's business, and one that does not take an effort level ignores it. A rewrite rarely needs more than low.

## Seeing what gets sent

**Show me the request** builds the request for the reply you are looking at and shows it, message by message, with the role and size of each. No model is called and nothing is charged; it costs one read of your chat.

It is built by the same function a real refine uses, so it cannot become a nice description of something the extension does not actually send. Under the messages it shows the rest of the call too: which connection, how much thinking, and which samplers, which otherwise live on two other tabs.

If no reply can be found it still builds, with a stand-in where your message would go, and says so. That is the useful case for checking a layout before there is a chat to try it on.

**Copy it** puts the whole thing on your clipboard, which is the thing to paste when asking why a refine did something strange.

## Starting a block from nothing

A new block is empty. The prompts that ship with it use XML tags because that is what works, but a tag is a style, not a rule, and a new block should not arrive already written in somebody else's.

**Expand** opens a block in an editor the size of the screen, which is where a paragraph is actually comfortable to write. It does not put the cursor in the box: focusing a textarea is what raises the keyboard on a phone, and it would cover the thing you just opened. The preview has one too, for reading, with no editing.

## Presets

At the bottom of the **Prompt** tab, presets save a whole setup under a name and switch between them without copying anything by hand. The four that ship with it are always in the list and cannot be renamed or deleted, so there is always something to go back to.

What a preset carries is everything that decides how a refine reads:

- every block: its name, its text, its role and its place in the order
- how many messages of run-up go in
- your sampler values
- how much thinking it does

What stays yours whichever preset you load is everything else: whether refining is on at all, which connection does it, the length limits, whether it asks before saving, the sounds, and the chats you switched off.

**A connection is not saved.** A connection id from another account names nothing on yours, so a shared preset carrying one would quietly point at nothing. Pick your connection once under Model and it stays put through every preset.

The buttons work the way you would expect: **Load** switches to the preset in the list, **Save as new** stores the current setup under the name in the box, **Update selected** overwrites the chosen one, **Rename selected** renames it, and **Delete** removes it. Loading takes effect at once and is saved, so there is no separate Save step.

Presets live in your browser. To move them to another device, use the export below, which includes them.

## Import and export

**Export to a file** writes one JSON file with your rules, your prompt layout and your sampler settings in it. **Import a file** reads one back.

Importing replaces what you have, so export first if you want a way back. The chats you switched off are not in the file: they name chats that do not exist on the machine reading it.

Every value in a file is checked against what it is supposed to be before it is used, so a hand-edited or truncated file loads what it can and says how many settings it took, leaving the panel in a state it can still draw. A sound in a file has to be audio and has to be small, or it is dropped.

## Starting again

**Reset all settings**, under Setup, puts every setting back to the value a fresh install has and keeps your presets. **Reset everything, presets too** takes those as well. Both ask first, and neither can be undone.

Whichever tab you were on stays where it was. That is not a setting anybody means to reset, and being thrown back to the first tab reads as the panel breaking.

---

[Back to the README](../README.md)
