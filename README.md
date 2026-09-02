# Auto Refine

A Lumiverse extension. It takes a finished reply, sends it to a model with the rules you wrote, and saves the result over the original.

**It never touches the greeting.** A person wrote that message. No setting turns that off.

It is the companion to [Auto Retry](https://github.com/starlitcode/Lumiverse-Auto-Retry): that one decides whether a reply is worth keeping, this one improves the ones that are.

## What it does

You write rules in plain sentences. Cut filler words. Keep paragraphs under four lines. Never open on the weather. Each finished reply is sent to a model with those rules attached, and what comes back is saved into the chat, so the wording sticks and the model reads it as context on later turns.

Automatic refining is off until you turn it on. Until then there is a button that refines the latest reply when you press it.

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

## Installing

Install from the Extensions panel by repository URL, or `POST /api/v1/spindle/install`.

It asks for four permissions: `generation` to run the refine, `chat_mutation` to save the result, `chats` to know which chat you are in, and `ui_panels` for the floating button. The [privacy page](docs/privacy.md) says what each is used for and what you still have if you refuse it.

## Documentation

- [Writing rules](docs/rules.md)
- [What it refuses to save](docs/guardrails.md)
- [Settings](docs/settings.md)
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
