# Auto Refine

A Lumiverse extension. It takes a finished reply, sends it to a model with the rules you wrote, and saves the result over the original.

**It never touches the greeting.** A person wrote that message. No setting turns that off.

It is the companion to [Auto Retry](https://github.com/starlitcode/Lumiverse-Auto-Retry): that one decides whether a reply is worth keeping, this one improves the ones that are.

## What it does

You write rules in plain sentences. Cut filler words. Keep paragraphs under four lines. Never open on the weather. Each finished reply is sent to a model with those rules attached, and what comes back is saved into the chat, so the wording sticks and the model reads it as context on later turns.

Automatic refining is off until you turn it on. Until then there is a button that refines the latest reply when you press it.

It lives in a tab in Lumiverse's sidebar drawer rather than behind a settings window, because it is something you keep open while you write. After a refine the tab shows you what changed and offers to put it back, sitting where you are already looking.

## What makes it careful

Handing your writing to a model and saving whatever it says is a risky thing to do quietly, so most of this extension is about refusing to save the wrong thing.

- **The greeting is never refined.** Not automatically, not by the button, not by any setting.
- **A rewrite that talks about the edit is dropped.** "Here is the rewritten message" is the model answering the wrong question, and saving it would put that line in your chat.
- **A rewrite where the model declined is dropped.** So is an empty one, and one that changed nothing.
- **A rewrite that grew or shrank too much is dropped.** A refine that makes a reply half again as long has written new scene rather than polished what was there. Both limits are yours to set.
- **The original is kept** so you can put it back, for as long as the page is open.
- **It can ask first**, showing you both versions side by side before anything is saved.

Every one of those says why in the panel, rather than quietly doing nothing.

## What it costs, and how to spend less

A refine is a second model call on every reply, so two settings decide what that costs.

- **Refine using this connection.** A rewrite does not need the model you roleplay with. Point this at a cheaper or faster connection and the whole feature costs a fraction of what it would otherwise.
- **Let the model think first.** Off by default. Rewriting a paragraph is not a reasoning problem, and extended thinking on every reply is the cost nobody notices until the bill arrives.

## Install

In Lumiverse, open Extensions and install from the repository URL:

```
https://github.com/starlitcode/Lumiverse-Auto-Refine
```

Then open the sidebar drawer and pick the **Auto Refine** tab. Ctrl+K finds it too. Write a rule or two and it is ready; everything else is optional.

It asks for four permissions: `generation` to run the refine, `chat_mutation` to save the result, `chats` to know which chat you are in, and `characters` to read the card so a rewrite knows who is speaking. The tab itself costs nothing, since drawer tabs are open to every extension. The [privacy page](docs/privacy.md) says what each is used for and what you still have if you refuse it.

## How the prompt is built

The refine is one model call, and you decide what goes in it. Under **How the prompt is built** each part is a block you can reorder, switch off, or send as a different role: the instruction, the character card, the run-up from the chat, your rules, your structure rules, whose message it is, and the message itself. You can add blocks of your own text anywhere in that order.

Two blocks are locked on, the instruction and the message, because every check on the answer assumes the model was given both.

## Documentation

- [Writing rules](docs/rules.md)
- [How the prompt is built](docs/prompt.md) - the blocks, their order, the roles, and the sampler settings
- [What it refuses to save](docs/guardrails.md)
- [Settings](docs/settings.md)
- [Import and export](docs/prompt.md#import-and-export)
- [Privacy](docs/privacy.md)

## Building

`dist/` is committed as readable JavaScript, so the extension installs with no build step and the file that runs is one you can read.

```
bun install
bun run check     # types and tests
bun run build     # rebuilds dist/ from src/
```

`src/` and `dist/` move together in the same commit. CI rebuilds and fails on any drift.

## Licence

GPL-3.0-only.
