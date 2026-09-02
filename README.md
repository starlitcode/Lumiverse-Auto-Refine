# Auto Refine

A Lumiverse extension. It takes a finished reply, sends it to a model with the rules you wrote, and saves the result over the original.

**It never touches the greeting.** A person wrote that message. No setting turns that off.

It is the companion to [Auto Retry](https://github.com/starlitcode/Lumiverse-Auto-Retry): that one decides whether a reply is worth keeping, this one improves the ones that are.

## Install

In Lumiverse, open Extensions and install from the repository URL:

```
https://github.com/starlitcode/Lumiverse-Auto-Refine
```

Then open the sidebar drawer and pick the **Auto Refine** tab. `Ctrl+K` finds it too. Write a rule or two and it is ready; everything else is optional.

## What it does

You write rules in plain sentences. Cut filler words. Keep paragraphs under four lines. Never open on the weather. Each reply is sent to a model with those rules attached, and what comes back is saved into the chat, so the wording sticks and the model reads it as context on later turns.

Automatic refining is off until you turn it on. Until then there is a button that refines the latest reply when you press it, and one that refines what you are still typing.

It lives in a tab in the sidebar drawer rather than behind a settings window, because it is something you keep open while you write. After a refine the tab shows you what changed and offers to put it back, sitting where you are already looking.

## You are always in charge

The switch at the top of the tab stops everything: no refine runs and no model call is made, by any path. **Turn off here**, under Setup, leaves one chat alone while every other chat carries on.

Nothing is written that you cannot undo. **Put it back** restores the wording a refine replaced, and **Ask before saving a refine** puts a confirmation in front of every write if you would rather see each one coming.

## What makes it careful

Handing your writing to a model and saving whatever it says is a risky thing to do quietly, so most of this extension is about refusing to save the wrong thing.

- **The greeting is never refined.** Not automatically, not by a button, not by any setting.
- **A rewrite that talks about the edit is dropped.** "Here is the rewritten message" is the model answering the wrong question, and saving it would put that line in your chat.
- **A rewrite where the model declined is dropped.** So is an empty one, and one that changed nothing.
- **A rewrite that grew or shrank too much is dropped.** A refine that makes a reply half again as long has written new scene rather than polished what was there. Both limits are yours to set.
- **The original is kept** so you can put it back, for as long as the page is open.

Every one of those says why, in the Log tab, rather than quietly doing nothing.

## The panel

Six tabs, and everything belongs to exactly one of them. The switch, the refine button and the last refine sit above the tabs, because those are what you came for.

| Tab | What is on it |
| --- | --- |
| **Rules** | What to change, structure and formatting, a place to try them on some text, and your saved presets |
| **Prompt** | The blocks that make up the request, how much of the chat goes in, and a preview of exactly what gets sent |
| **Model** | Which connection refines, how much thinking it does, the timeout, and the samplers |
| **Limits** | What it refuses to save, and what it does before it writes |
| **Log** | What is happening right now, what it has been doing, and one button that copies a bug report |
| **Setup** | This chat, how you are told a refine landed, the floating button and the input bar row, import and export, and starting again |

## What it costs, and how to spend less

A refine is a second model call on every reply, so three settings decide what that costs.

- **Refine using this connection.** A rewrite does not need the model you roleplay with. Point this at a cheaper or faster connection and the whole feature costs a fraction of what it would otherwise.
- **Let it think first.** Off by default. Rewriting a paragraph is not a reasoning problem. You can also leave it at whatever your connection is already set to, or pick an effort level yourself.
- **Messages of run-up to send.** How much of the chat goes in the prompt. More context makes a better rewrite and costs more on every one.

## Seeing what gets sent

Under **Prompt**, **Show me the request** builds the real request for the reply you are looking at and shows it message by message, with roles and sizes, without calling a model or charging anything. It is built by the same code a real refine uses, so it cannot drift into being a nice description of something else.

## Documentation

- [Writing rules](docs/rules.md) - what to put in the rules box, and what not to
- [How the prompt is built](docs/prompt.md) - the blocks, their order, the roles, the samplers, and the preview
- [What it refuses to save](docs/guardrails.md) - the checks on what comes back
- [Settings](docs/settings.md) - every tab, with what is on it and why
- [Presets](docs/prompt.md#presets) - saving a setup and moving between setups
- [Import and export](docs/prompt.md#import-and-export) - carrying a setup to another device
- [Privacy](docs/privacy.md) - what it can reach, what it sends, and what it keeps
- [Security policy](SECURITY.md) - how to report a security problem
- [Changelog](CHANGELOG.md) - what changed in every version

## How it works

The refining runs in a backend module, because editing a saved message is a backend job. The tab collects what you want, hands it over, and shows what came back. Every model call goes through Lumiverse to the provider you already configured; the extension has no networking of its own, which you can confirm by searching the two source files for `fetch(`, `XMLHttpRequest`, `WebSocket`, `sendBeacon` or `EventSource` and finding nothing.

It declares six permissions: `generation` to run the refine, `chat_mutation` to save it, `chats` and `characters` to know whose chat it is, `world_books` to read the lore the chat has active, and `ui_panels` for the floating button. [Privacy](docs/privacy.md) goes through each one and says what still works without it.

One part of the extension reaches into the page rather than going through an API: **Refine what I am typing** has to read and write the chat input box, and Lumiverse offers no API for that. It is off by default, and it is the only thing that would stop working if a Lumiverse update moved that box.

Auditing it, or pointing a scanner at it? The two files Lumiverse loads are `dist/frontend.js` and `dist/backend.js`, named in `spindle.json`. They are committed as plain readable JavaScript, not minified or bundled.

## Building

`dist/` is committed as readable JavaScript, so the extension installs with no build step and the file that runs is one you can read.

```
bun install
bun run check     # types and tests
bun run test:ui   # the same panel in a real browser, needs Playwright
bun run build     # rebuilds dist/ from src/
```

`src/` and `dist/` move together in the same commit. CI rebuilds and fails on any drift.

## Credits

- **starlitcode** - built and maintains the extension
- **[Claude](https://claude.ai)** (Anthropic) - wrote the code, directed and tested by starlitcode
- **[Hone](https://github.com/AMousePad/Hone)** - the extension that showed refinement was worth having. Auto Refine is written from scratch and shares no code with it
- Everyone who has reported a bug or suggested something that turned into a fix

## Licence

GPL-3.0-only.
