# How the prompt is built

A refine is one model call. This page is about what goes in it.

Most extensions of this kind hand you a rules box and keep the rest to themselves, so when a rewrite comes out wrong there is no way to tell whether the model ignored your rule or never saw the thing your rule was about. Here the whole request is a list of blocks under **How the prompt is built**, and you can move any of them, switch most of them off, and change the role each one is sent as.

## The blocks

In the order a fresh install sends them:

| Block | What it carries |
| --- | --- |
| What the job is | Rewrite this message, keep what happens, answer with the message and nothing else. Locked on. |
| Who the character is | Name, description, personality and scenario from the card in this chat. |
| What has been happening | The messages leading up to the one being rewritten. |
| Your rules | The **What to change** box. |
| Your structure rules | The **Structure and formatting** box. |
| Whose message it is | One line saying whether the character wrote it or you did. |
| Where the thinking goes | Only sent when you have let it think first. Keeps its working out of the answer. |
| The message to rewrite | The text itself. Locked on. |

A block with nothing to say is left out rather than sent empty, so a chat with no card, or a run-up you set to none, simply does not appear in the request.

**Two are locked on.** The job and the message cannot be switched off, because everything that checks the answer afterwards assumes the model was given both. They can still be moved and re-roled.

## Order matters more than it looks

The message is last by default, and that is worth keeping. Anything after the message reads as an instruction about it, so a rule placed below the message is more likely to be followed than the same rule placed above it, and a block of narration placed below the message is more likely to be treated as something to act on. If you add a block of your own, it goes in above the message unless you move it.

The other reason order matters is caching. If your provider caches prompts, the reuse runs up to the first thing that changed, so blocks that never change belong at the top and blocks that change every turn belong at the bottom. The default order is already that way round.

## Roles

Each block is sent as **System**, **User** or **Assistant**.

Blocks that end up next to each other with the same role are joined into one message, because providers disagree about what two system messages in a row mean and putting them together is what you meant by putting them together.

System is right for almost everything. Two cases where changing it helps:

- A model that ignores system instructions. Some providers weight the last user message far more heavily than anything in the system prompt, and moving your rules to **User** is the fix.
- A model that treats the message as something to continue rather than edit. Sending the message as **Assistant** makes it read as the thing already written, which sometimes stops a model appending a new paragraph to it.

## Blocks of your own

**Add a block of your own** puts an empty one in above the message. It has a name, which is only for you, and its text, which is sent as written. It behaves like every other block: it moves, it switches off, it has a role.

This is where a house style lives, or a list of words you never want to see, or a note about the setting the card does not carry. It is separate from **What to change** so a preset you were given and a note that is only about this chat do not have to share a box.

**Put the order back** returns everything to the table above and drops your own blocks.

## How much of the chat it sends

**Messages of run-up to send** decides what **What has been happening** carries. Four is the default.

More context costs more on every refine, and it is the setting most likely to make a refine expensive without looking like it. Long messages are trimmed and the block as a whole has a ceiling, so one wall of text cannot fill the request on its own.

Zero sends none. That is the cheap setting, and it is fine for rules about wording. It is the wrong setting for rules about continuity, because a model that cannot see the run-up will smooth a scene into general prose and take the thread out with it.

## Sampler settings

Under **How the pass runs**, every sampler is blank to begin with, and blank means the connection's own preset decides. That is the right default: if you tuned a preset, an extension should not quietly override it.

Fill one in and it is sent with the refine and only with the refine. Your chat is not affected, and neither is the preset.

Temperature is the one worth touching. A rewrite usually wants it lower than the one you roleplay with, since you are asking for the same scene said better rather than for another idea. **Longest answer** is worth a look in the other direction: a ceiling low enough to cut the rewrite off mid-sentence gets it dropped for being too short, which looks like the refine failing rather than the setting being tight.

**Clear them all** hands every one of them back to the connection.

## Import and export

**Export to a file** writes one JSON file with your rules, your prompt layout and your sampler settings in it. **Import a file** reads one back.

Importing replaces what you have, so export first if you want a way back. The chats you switched off are not in the file: they name chats that do not exist on the machine reading it.

Every value in a file is checked against what it is supposed to be before it is used, so a hand-edited or truncated file loads what it can and says how many settings it took, rather than leaving the panel in a state it cannot draw.

---

[Back to the README](../README.md)
