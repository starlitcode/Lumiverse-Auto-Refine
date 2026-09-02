# Settings

Auto Refine lives in a tab in Lumiverse's sidebar drawer, not behind a settings window. Open it from the drawer, or find it with `Ctrl+K`. It is not in the Extras menu and there is no settings window: the drawer is the one place it lives.

It is a tab rather than a window on purpose. This is something you keep open and glance at while you write: what the last refine did to your prose, and a way to disagree with it, sitting where you are already looking.

**Your settings follow your account, not this browser.** They are written to Lumiverse under your account and read back on load, so opening a different browser, or a different machine, finds the setup you left. This browser keeps a copy as a cache, which is what draws the panel instantly and what carries on working if the account cannot be reached. On a server with several accounts on it, each account's settings and presets are stored separately and one cannot read another's. If a save to your account fails, the panel says so rather than letting settings look saved when they are not.

**There is no Save button.** A tab has no moment where it closes, so a "nothing sticks until you press Save" contract would have nothing to hang on. Everything saves as you change it. That is safe here because almost nothing on the tab is destructive on its own: a block is only text until a reply arrives, and the switches that make something happen are switches, which is the control people expect to act at once. The two that do throw something away, deleting a preset and starting again, ask first.

## Finding a setting

The search box above the tabs looks across every one of them, not just the one you are standing on. A setting you cannot remember the home of is exactly the one you are searching for. Matches are grouped by the tab they live on, folds are opened so nothing hides from it, and the tab strip steps out of the way while a search is running.

## Above the tabs

Three things never move, whichever tab you left open, because they are what you came for.

- **The switch** is the master switch. Off, nothing is refined and no model call is made, by any path.
- **Refine the latest reply** does one, now. **every reply, automatically** is the automatic pass, off by default. The greeting is never included either way.
- **Refines you can put back** shows what changed, with **Put it back** next to each one. Every refine in this chat is in there, newest first, not just the most recent: a second refine used to take away the way back from the first without saying so. The tab carries a badge with the count.

## Prompt

- **Your prompt** is the whole request, block by block. Rename them, reorder them, switch them off, change the role each is sent as, write your own. **Expand** opens one in an editor the size of the screen, and does not focus the box, so no keyboard jumps up on a phone. In [How the prompt is built](prompt.md).
- **Macros you can use** is the list of what a block can carry, with a tap to copy each one.
- **Presets** save a whole setup under a name. Four ship with the extension and work as they stand, in [Presets](prompt.md#presets).

## Context

- **How much it is told** is the message count and the two token budgets, for the run-up and the lorebook. In [How much it is told](prompt.md#how-much-it-is-told).
- **See what gets sent** builds the real request and shows it to you, message by message, without calling a model. **Raw** shows the same thing as the JSON that goes over the wire, and **Expand** opens either at the size of the screen.
- **Try it** runs one refine on pasted text and shows what comes back, without writing anything to your chat.

## Model

- **Refine using** picks which model does the refining. The list is your own connection profiles, by name. Leave it on the default to use whatever you are chatting with.
- **Let it think first** is off by default, and can be left at whatever your connection is set to, or given an effort level of its own. In [How much thinking it does](prompt.md#how-much-thinking-it-does).
- **Give up waiting after** cancels a refine that has not come back. The default is 90 seconds. A hung call is cancelled rather than left running.
- **Samplers** are blank to begin with, and blank means the connection's own preset decides. In [Sampler settings](prompt.md#sampler-settings).

## Limits

- **Hide markup from the model**, **Hide plain italic and bold too** and **Never send the model's thinking** keep a rewrite away from what is not prose, in [Protecting what is not prose](prompt.md#protecting-what-is-not-prose).
- **Take the answer from between the tags** is what makes a model's preamble harmless instead of fatal, in [The answer it asks for](prompt.md#the-answer-it-asks-for). Asking for the tags is your prompt's job; this decides what is done with the answer.
- **Watch the rewrite arrive** streams the refine so the panel can say what it is doing and how much has come back. The answer is judged when it is complete either way, so this changes nothing about what gets saved.
- **Longest a rewrite may get** and **Shortest a rewrite may get** are the two length limits, in [What it refuses to save](guardrails.md).
- **Keep what a refine replaced** holds the original so you can put it back.
- **Ask before saving a refine** shows you both versions and waits for a yes.
- **Let the button refine your own messages** keeps your voice rather than the character's. The automatic pass never touches what you wrote whatever this says.

## Log

- **Right now** is the live view. It names the stage rather than just saying busy: asking, thinking, writing with a character count when your connection streams, then checking. The clock runs, and past eight seconds it also says how long is left before the timeout gives up. It writes into the line in place rather than repainting the panel under you, and the dot beside it breathes while something is running.
- **What it said about the edit** is whatever the model wrote outside the `<REFINED>` tags on the last pass. The two reasoning prompts ask for the model's working there, between `<REFINE_NOTES>` tags, so it lands here beside the refine it belongs to. None of it is saved into your chat, which is what makes it a safe place for your prompt to ask what was cut and what was left alone, in [Asking it what it changed](prompt.md#asking-it-what-it-changed). The card only appears when something arrives in it.
- **What it has been doing** is the running list, newest first.
- **Reporting a problem** copies everything somebody would otherwise have to ask you for. **What it carries** decides which parts go in: your settings, the shape of your prompt, the counts, the recent log, where you are, and your browser. What your blocks actually say is never in it, only their names, roles and macros, so it is safe to paste in public. **Read and edit it first** opens the whole thing so you can take out anything you would rather not post before it is copied.

## Setup

- **This chat** leaves one chat completely alone while every other chat carries on. It is written down in your browser, so it survives a reload, and it is a list of chat ids and nothing else.

  A **temporary chat**, the scratch conversation with no character card on it, is told apart from an ordinary one and the card says so. The switch works there for as long as the chat is open, but it is not written down: the chat is discarded on the way out and the next one carries a different id, so a remembered entry could never match anything again. It would sit in storage looking like a setting and doing nothing. A chat whose card could not be read at all is not a temporary chat, and is not treated as one.
- **When a refine lands** is how you find out: a pop-up, a sound, or neither. With nothing chosen the sound is a short built-in blip, synthesised rather than shipped as a file. Attach your own or paste a link to replace it.
- **Ways to reach it** are three optional ways in, all off by default. **A button on every message** puts a refine button in each message's own row of actions, next to Edit and Copy, and after a refine that same button becomes an undo. **A floating button** puts a round button over the chat: one tap refines the latest reply, or puts the last one back when there is one to put back, and holding it or right clicking opens Lumiverse's own menu, which carries only what the button cannot already do: the tab, an undo when there is one, a way to hide the button, and the master switch. Refining is what a tap does, and the automatic pass and the per chat switch are settings, so they stay on the tab where their explanations are rather than appearing as bare labels in a menu over the chat. It pulses while a refine is running, which is often the only part of the extension on screen. It needs the interface panels permission. **Refine what I am typing** rewrites the text sitting in your input box before you send it.

Those last two live in one place at a time. While the floating button is on screen, its menu holds anything that would otherwise be a row in the chat input's Extras menu. With the button off, or refused because the permission is not granted, or on a Lumiverse too old to draw a menu, the rows come back to Extras, which is the only way to reach them on a phone. Two ways to reach one thing is one more than anybody needs.
- **Your whole setup** exports to a file, imports one back, and puts things back to their defaults. All three work in the same list of parts: your prompt, context, model, samplers, limits, alerts, buttons, switches, presets and the chats you switched off. **What goes in the file**, **What to take from a file** and **What to put back** each have their own choice, so you can export only your prompt, take only somebody's samplers, or start your prompt again without losing your connection. In [Import and export](prompt.md#import-and-export) and [Starting again](prompt.md#starting-again).

---

[Back to the README](../README.md)
