# Auto Refine

A Lumiverse extension. It takes a finished reply, sends it to a model with the rules you wrote, and saves the result over the original.

**It never touches the greeting.** A person wrote that message. No setting turns that off.

It is the companion to [Auto Retry](https://github.com/starlitcode/Lumiverse-Auto-Retry): that one decides whether a reply is worth keeping, this one improves the ones that are.

## Install

In Lumiverse, open Extensions and install from the repository URL:

```
https://github.com/starlitcode/Lumiverse-Auto-Refine
```

Then open the sidebar drawer and pick the **Auto Refine** tab. A prompt ships with it, so switching it on is the whole of the setup. Everything below is optional.

## What it does

Each finished reply is sent to a model along with the prompt you wrote, and what comes back is saved into the chat, so the wording sticks and the model reads it as context on later turns.

Automatic refining is off until you turn it on. Until then there is a button that refines the latest reply when you press it, one that goes through every reply in the chat, and one that rewrites what you are still typing before you send it.

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
- **A rewrite that lost your formatting is dropped.** Tags, code and image links are hidden from the model behind tokens and checked on the way back. If one did not come back, the rewrite does not get saved.
- **The model's own thinking is never sent**, so a rewrite cannot quietly edit it.
- **The original is kept** so you can put it back, for as long as the page is open.

Every one of those says why, in the Log tab, rather than quietly doing nothing.

## The panel

Six tabs, and everything belongs to exactly one of them. The switch, the refine button and the refines you can still put back sit above the tabs, because those are what you came for.

| Tab | What is on it |
| --- | --- |
| **Prompt** | The request itself, block by block, the macros a block can carry, and your presets |
| **Context** | How much of the chat and the lorebook goes in, a preview of exactly what gets sent, and a place to try it on some text |
| **Model** | Which connection refines, how much thinking it does, the timeout, and the samplers |
| **Limits** | What it protects, what it refuses to save, and what it does before it writes |
| **Log** | What is happening right now, what it has been doing, and one button that copies a bug report |
| **Setup** | This chat, how you are told a refine landed, the three optional buttons, import and export, and starting again |

## What it costs, and how to spend less

A refine is a second model call on every reply, so three settings decide what that costs.

- **Refine using.** A rewrite does not need the model you roleplay with. Point this at a cheaper or faster connection and the whole feature costs a fraction of what it would otherwise.
- **Let it think first.** Off by default. Rewriting a paragraph is not a reasoning problem. You can also leave it at whatever your connection is already set to, or pick an effort level yourself.
- **How much it is told.** How many messages of run-up go in, and the token ceilings on that and on the lorebook. More context makes a better rewrite and costs more on every one.

## Your prompt is the settings

There is no rules box with a fixed prompt hidden behind it. Under **Prompt**, the whole request is a list of blocks you wrote: rename them, reorder them, switch them off, change the role each is sent as, add your own. Macros like `{{message}}`, `{{history}}` and `{{description}}` are filled in when the refine runs.

Four prompts ship with it and work as they stand, in two pairs. **A quick read** is the one to start with and **a close read** goes over the same ground properly for a bit more prompt; both work on any model. The other two say **for a model that thinks** in their names: those hand the model the standard and let it apply it, which is why they are the smaller pair, while a model that does not reason is given the list.

## Seeing what gets sent

Under **Context**, **Show me the request** builds the real request for the reply you are looking at and shows it message by message, with roles and sizes, without calling a model or charging anything. It is built by the same code a real refine uses, so it cannot drift into being a nice description of something else.

## Documentation

- [How the prompt is built](docs/prompt.md) - the blocks, the macros, the roles, the four prompts that ship with it, and the preview
- [Writing rules](docs/rules.md) - what to ask a refine for, and what not to
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

One part reaches into the page rather than going through an API, because Lumiverse does not offer one: **Refine what I am typing** reads and writes the chat input box. It is off by default, and it is the only thing that would stop working if a Lumiverse update moved that box.

Auditing it, or pointing a scanner at it? The two files Lumiverse loads are `dist/frontend.js` and `dist/backend.js`, named in `spindle.json`. They are committed as plain readable JavaScript, not minified or bundled.

**Nothing is ever added to your chat.** The extension reads messages and edits ones that already exist. There is no path that writes a new message, and the model call it makes is the quiet kind, which does not post its answer into the conversation.

## Credits

- **starlitcode** - built and maintains the extension
- **[Claude](https://claude.ai)** (Anthropic) - wrote the code, directed and tested by starlitcode
- **[Hone](https://github.com/AMousePad/Hone)** - the extension that showed refinement was worth having. Auto Refine is written from scratch and shares no code with it
- Everyone who has reported a bug or suggested something that turned into a fix

## Licence

GPL-3.0-only.
