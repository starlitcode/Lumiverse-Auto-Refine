# Auto Refine

A Lumiverse extension. It takes a finished reply, sends it to a model with the rules you wrote, and saves the result over the original.

**It never touches the greeting.** A person wrote that message. No setting turns that off.

It is the companion to [Auto Retry](https://github.com/starlitcode/Lumiverse-Auto-Retry): that one decides whether a reply is worth keeping, this one improves the ones that are.

## What it does

Each finished reply is sent to a model along with the prompt you wrote, and what comes back is saved into the chat, so the wording sticks and the model reads it as context on later turns.

Automatic refining is off until you turn it on. Until then there is a button that refines the latest reply when you press it, and one that goes through every reply in a chat you already have. Refining the draft in your input box is a third, behind a switch of its own, because it is the one part that writes into the box you are typing in.

Select part of a reply and you can refine only that. Two optional buttons put a refine in the chat itself: one in Lumiverse's own row of chat controls, and one on each message that refines that message. Both are off until you ask for them, and both sit in the places the app hands out to extensions.

Your own messages can be refined too, by hand, never automatically. They get their own prompt, which repairs what went wrong and leaves the writing alone.

It lives in a tab in the sidebar drawer rather than behind a settings window, because it is something you keep open while you write. After a refine the tab shows you what changed and offers to put it back, sitting where you are already looking. What changed can be read as one text with the changes coloured in place, or as the two versions in columns beside each other, whichever is the easier read.

## Install

In Lumiverse, open Extensions and install from the repository URL:

```
https://github.com/starlitcode/Lumiverse-Auto-Refine
```

Then open the sidebar drawer and pick the **Auto Refine** tab. A prompt comes with it, so switching it on is the whole of the setup. Everything below is optional.

## You are always in charge

The switch at the top of the tab stops everything: no refine runs and no model call is made, by any path. **Turn off here**, under Setup, leaves one chat alone while every other chat carries on.

Nothing is written that you cannot undo. **Put it back** restores the wording a refine replaced, and **Ask before saving a refine** puts a confirmation in front of every write if you would rather see each one coming.

## Not for sexual content involving minors

Auto Refine is not intended for sexual content involving minors, and I do not condone or support anybody using it for that. It is a writing tool for fiction between adults, and for stories with younger characters in them where nothing sexual happens to those characters.

So nobody has to guess what that means for their own writing, here is exactly how it works:

- **The code does not judge your story.** It does not read your writing for this, keeps no list of words about it, and does not block, change or delete anything on its own account.
- **The four built-in prompts carry one paragraph about it.** It tells the model that sexual content involving anyone under eighteen, or anyone written as a child, is not edited, and to hand that passage back exactly as it came and say why. It sits in the **Your Role** block of each, where you can read it, and word for word on [How the prompt is built](docs/prompt.md#the-one-thing-they-do-not-edit).
- **When a model follows it, your reply is left exactly as it was.** Nothing is saved, and the Log says the model handed it back and why.
- **Nothing else is excepted.** A younger character in a scene with nothing sexual in it is edited like anyone else, and how dark, explicit or crude a story between adults gets is yours to decide.
- **A prompt you write yourself carries only what you put in it.**

I cannot control what somebody does with an extension once they have it. What I can do is say plainly where I stand, and make sure nothing in this one is built to help.

## What makes it careful

Saving whatever a model sends back, with nothing checking it, is risky. So most of this extension is about refusing to save the wrong thing.

- **The greeting is never refined.** Not automatically, not by a button, not by any setting.
- **A rewrite that talks about the edit is dropped.** "Here is the rewritten message" is the model answering the wrong question, and saving it would put that line in your chat.
- **A rewrite where the model declined is dropped.** So is an empty one, and one that changed nothing.
- **A rewrite that grew or shrank too much is dropped.** A refine that makes a reply half again as long has written new scene rather than polished what was there. Both limits are yours to set.
- **A rewrite that lost your formatting is dropped.** Tags, code and image links are hidden from the model behind tokens and checked on the way back. If one did not come back, the rewrite does not get saved.
- **The model's own thinking is never sent**, so a rewrite cannot change it.
- **The original is kept** so you can put it back, for as long as the page is open.

Every one of those says why, in the Log tab. None of them fails without telling you.

## The panel

Six tabs, and everything belongs to exactly one of them. The switch, the refine button and the refines you can still put back sit above the tabs, because those are what you came for.

| Tab | What is on it |
| --- | --- |
| **Prompt** | The request itself, block by block, the macros a block can carry, and your presets |
| **Context** | How much of the chat and the lorebook goes in, and a preview of exactly what gets sent |
| **Model** | Which connection refines, how much thinking it does, the timeout, and the samplers |
| **Limits** | What it protects, what it refuses to save, and what it does before it writes |
| **Log** | What is happening right now, what it has been doing, what the last refine used and cost, and one button that copies a bug report |
| **Setup** | This chat, how you are told a refine landed, the three optional buttons, import and export, and starting again |

## What it costs, and how to spend less

A refine is a second model call on every reply. Three settings decide what that call costs, and one thing it does on its own keeps the bill down without you touching anything.

- **Refine using.** A rewrite does not need the model you roleplay with. Point this at a cheaper or faster connection and the whole feature costs a fraction of what it would otherwise.
- **Let it think first.** Off by default. Rewriting a paragraph is not a reasoning problem. You can also leave it at whatever your connection is already set to, or pick an effort level yourself.
- **How much it is told.** How many messages of run-up go in, and the token ceilings on that and on the lorebook. More context makes a better rewrite and costs more on every one.
- **A block that has nothing to say is not sent.** A block whose macros came back empty, a chat with no lorebook or no memories, is left out of the request rather than sent as an empty heading, so switching one on does not cost you anything on a chat that has nothing to put in it.

Put your provider's prices in on the **Model** tab and the panel stops dealing in tokens and starts dealing in money: what a request would cost before you send it, and what the last one really came to.

**On a free tier or a local model**, the setting that matters instead is **Wait out a provider that will not take the call**, on the **Limits** tab. A "too many requests" or a server still loading a model is not a bad answer, because there was no answer and nothing was spent, so it waits and asks again rather than dropping the refine. It never waits on a wrong key. Where the provider says how long to wait, that is what it waits.

## Your prompt is the settings

There is no rules box with a fixed prompt hidden behind it. Under **Prompt**, the whole request is a list of blocks you wrote: rename them, reorder them, switch them off, change the role each is sent as, add your own. Macros like `{{message}}`, `{{history}}` and `{{description}}` are filled in when the refine runs.

Four prompts come with it and work as they stand: a line edit for replies and a copy edit for your own messages, each once for any model and once for a model that reasons, under a heading each where you pick them.

Each one opens by telling the model which job it has. **The line edit** puts it on how a reply reads and keeps it off what happens in it. **The copy edit** puts it on what went wrong on the way to the page and keeps it off your style.

The two that say **for a model that thinks** hand the model the standard and let it apply it, which is why they are the smaller pair. A model that does not reason is given the list instead.

The four for your own writing do a different job: repair what is there and change nothing else.

## Seeing what gets sent

Under **Context**, **Show me the request** builds the real request for the reply you are looking at and shows it message by message, with roles and sizes, without calling a model or charging anything. It is built by the same code a real refine uses, on a passage that has been through the same protection first, so it cannot drift into being a nice description of something else.

## Documentation

- [How the prompt is built](docs/prompt.md) - the blocks, the macros, the roles, the four built-in prompts, and the preview
- [Writing rules](docs/rules.md) - what to ask a refine for, and what not to
- [What it refuses to save](docs/guardrails.md) - the checks on what comes back
- [Settings](docs/settings.md) - every tab, with what is on it and why
- [Ways to reach it](docs/settings.md#setup) - the floating button, the two buttons in the chat, the Extras row, and refining a selection
- [Presets](docs/prompt.md#presets) - saving a setup and moving between setups
- [Import and export](docs/prompt.md#import-and-export) - carrying a setup to another device
- [Two models](docs/jev.md) - Jev, a beta that decides which replies are worth a refine
- [Privacy](docs/privacy.md) - what it can reach, what it sends, and what it keeps
- [Security policy](SECURITY.md) - how to report a security problem
- [Changelog](CHANGELOG.md) - what changed in every version

## How it works

The refining runs in a backend module, because editing a saved message is a backend job. The tab collects what you want, hands it over, and shows what came back. Every refine goes through Lumiverse to the provider you already configured, and with two models on, the call to Jev goes through Lumiverse's own proxy to the Jev host you picked. The extension has no networking of its own, which you can confirm by searching the two source files for `fetch(`, `XMLHttpRequest`, `WebSocket`, `sendBeacon` or `EventSource` and finding nothing.

It declares seven permissions: `generation` to run the refine, `chat_mutation` to save it, `chats` to know which chat it is and what Lumiverse remembers of it, `characters` to read the card, `world_books` to read the lore the chat has active, `ui_panels` for the floating button, and `cors_proxy` to reach Jev when two models are on. [Privacy](docs/privacy.md) goes through each one and says what still works without it.

One part reaches into the page rather than going through an API, because Lumiverse does not offer one: **Refine what I am typing** reads and writes the chat input box. It is off by default, and it is the only thing that would stop working if a Lumiverse update moved that box. **Where the input box is**, on the Setup tab, is where you point it at the new one without waiting for a release.

Auditing it, or pointing a scanner at it? The two files Lumiverse loads are `dist/frontend.js` and `dist/backend.js`, named in `spindle.json`. They are committed as plain readable JavaScript, not minified or bundled.

**Nothing is ever added to your chat.** The extension reads messages and edits ones that already exist. There is no path that writes a new message, and the model call it makes is the quiet kind, which does not post its answer into the conversation.

## Credits

- **starlitcode** - built and maintains the extension
- **[Claude](https://claude.ai)** (Anthropic) - wrote the code, directed and tested by starlitcode
- **[Hone](https://github.com/AMousePad/Hone)** - the extension that showed refinement was worth having. Auto Refine is written from scratch and shares no code with it
- Everyone who has reported a bug or suggested something that turned into a fix

Licensed under the GNU General Public License v3.0. See [LICENSE](LICENSE).
