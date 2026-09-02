# Settings

Auto Refine lives in a tab in Lumiverse's sidebar drawer, not behind a settings window. Open it from the drawer, or find it with `Ctrl+K`. It is not in the Extras menu and there is no settings window: the drawer is the one place it lives.

It is a tab rather than a window on purpose. This is something you keep open and glance at while you write: what the last refine did to your prose, and a way to disagree with it, sitting where you are already looking.

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

- **Messages of run-up to send** is how much of the chat the `{{history}}` macro carries.
- **See what gets sent** builds the real request and shows it to you, message by message, without calling a model. **Raw** shows the same thing as the JSON that goes over the wire, which is what to paste when asking somebody why a request did something.
- **Try it** runs one refine on pasted text and shows what comes back, without writing anything to your chat.

## Model

- **Refine using** picks which model does the refining. The list is your own connection profiles, by name. Leave it on the default to use whatever you are chatting with.
- **Let it think first** is off by default, and can be left at whatever your connection is set to, or given an effort level of its own. In [How much thinking it does](prompt.md#how-much-thinking-it-does).
- **Give up waiting after** cancels a refine that has not come back. The default is 90 seconds. A hung call is cancelled rather than left running.
- **Samplers** are blank to begin with, and blank means the connection's own preset decides. In [Sampler settings](prompt.md#sampler-settings).

## Limits

- **Hide markup from the model** and **Never send the model's thinking** keep a rewrite away from what is not prose, in [Protecting what is not prose](prompt.md#protecting-what-is-not-prose).
- **Ask for the answer in tags** is what makes a model's preamble harmless instead of fatal, in [The answer it asks for](prompt.md#the-answer-it-asks-for).
- **Watch the rewrite arrive** streams the refine so the panel can say what it is doing and how much has come back. The answer is judged when it is complete either way, so this changes nothing about what gets saved.
- **Longest a rewrite may get** and **Shortest a rewrite may get** are the two length limits, in [What it refuses to save](guardrails.md).
- **Keep what a refine replaced** holds the original so you can put it back.
- **Ask before saving a refine** shows you both versions and waits for a yes.
- **Let the button refine your own messages** keeps your voice rather than the character's. The automatic pass never touches what you wrote whatever this says.

## Log

- **Right now** is the live view. It names the stage rather than just saying busy: asking, thinking, writing with a character count when your connection streams, then checking. The clock runs, and past eight seconds it also says how long is left before the timeout gives up. It writes into the line in place rather than repainting the panel under you, and the dot beside it breathes while something is running.
- **What it has been doing** is the running list, newest first.
- **Reporting a problem** copies everything somebody would otherwise have to ask you for. **What it carries** decides which parts go in: your settings, the shape of your prompt, the counts, the recent log, where you are, and your browser. What your blocks actually say is never in it, only their names, roles and macros, so it is safe to paste in public. **Read and edit it first** opens the whole thing so you can take out anything you would rather not post before it is copied.

## Setup

- **This chat** leaves one chat completely alone while every other chat carries on. It is written down in your browser, so it survives a reload, and it is a list of chat ids and nothing else.
- **When a refine lands** is how you find out: a pop-up, a sound, or neither. The sound is yours: attach a file or paste a link. Nothing is shipped with the extension, so the switch on its own is silent and says so.
- **Ways to reach it** are three optional ways in, all off by default. **A button on every message** puts a refine button in each message's own row of actions, next to Edit and Copy, and after a refine that same button becomes an undo. **A floating button** puts a round button over the chat: one tap refines the latest reply, or puts the last one back when there is one to put back, and holding it or right clicking opens a menu with everything else. It pulses while a refine is running, which is often the only part of the extension on screen. It needs the interface panels permission. **Refine what I am typing** adds a row to the chat input's Extras menu that rewrites the text in your input box before you send it.
- **Your whole setup** exports to a file, imports one back, and puts things back to their defaults. All three work in the same list of parts: your prompt, context, model, samplers, limits, alerts, buttons, switches, presets and the chats you switched off. **What goes in the file**, **What to take from a file** and **What to put back** each have their own choice, so you can export only your prompt, take only somebody's samplers, or start your prompt again without losing your connection. In [Import and export](prompt.md#import-and-export) and [Starting again](prompt.md#starting-again).

---

[Back to the README](../README.md)
