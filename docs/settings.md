# Settings

Auto Refine lives in a tab in Lumiverse's sidebar drawer, not behind a settings window. Open it from the drawer, or find it with `Ctrl+K`. It is not in the Extras menu and there is no settings window: the drawer is the one place it lives.

It is a tab rather than a window on purpose. This is something you keep open and glance at while you write: what the last refine did to your prose, and a way to disagree with it, sitting where you are already looking.

**There is no Save button.** A tab has no moment where it closes, so a "nothing sticks until you press Save" contract would have nothing to hang on. Everything saves as you change it. That is safe here because nothing on the tab is destructive on its own: a rule is only text until a reply arrives, and the switches that make something happen are switches, which is the control people expect to act at once.

## Above the tabs

Three things never move, whichever tab you left open, because they are what you came for.

- **The switch** is the master switch. Off, nothing is refined and no model call is made, by any path.
- **Refine the latest reply** does one, now. **every reply, automatically** is the automatic pass, off by default. The greeting is never included either way.
- **The last refine** shows what changed, with **Put it back** next to it. It appears after a refine and goes when you dismiss it. The tab carries a badge while one is waiting, so you can see something happened without the tab open.

## Rules

- **What to change** and **Structure and formatting** are the rules themselves, covered in [Writing rules](rules.md). Nothing is refined until there is something in the first box.
- **Try it** runs one refine on pasted text and shows what comes back, without writing anything to your chat.
- **Presets** save the whole refining setup under a name, in [Presets](prompt.md#presets).

## Prompt

- **What goes in the request** is the block list: reorder them, switch most of them off, change the role each is sent as, add blocks of your own. In [How the prompt is built](prompt.md).
- **Messages of run-up to send** is how much of the chat goes in.
- **See what gets sent** builds the real request and shows it to you, without calling a model.

## Model

- **Refine using** picks which model does the refining. The list is your own connection profiles, by name. Leave it on the default to use whatever you are chatting with.
- **Let it think first** is off by default, and can be left at whatever your connection is set to, or given an effort level of its own. In [How much thinking it does](prompt.md#how-much-thinking-it-does).
- **Give up waiting after** cancels a refine that has not come back. The default is 90 seconds. A hung call is cancelled rather than left running.
- **Samplers** are blank to begin with, and blank means the connection's own preset decides. In [Sampler settings](prompt.md#sampler-settings).

## Limits

- **Longest a rewrite may get** and **Shortest a rewrite may get** are the two length limits, in [What it refuses to save](guardrails.md).
- **Keep what a refine replaced** holds the original so you can put it back.
- **Ask before saving a refine** shows you both versions and waits for a yes.
- **Let the button refine your own messages** keeps your voice rather than the character's. The automatic pass never touches what you wrote whatever this says.

## Log

- **Right now** is the live view: what it is doing, how long the current refine has been running, and the counts for this session. It updates in place rather than repainting the panel under you.
- **What it has been doing** is the running list, newest first.
- **Reporting a problem** copies everything somebody would otherwise have to ask you for. It carries settings and counts, never your rules or your writing, so it is safe to paste in public.

## Setup

- **This chat** leaves one chat completely alone while every other chat carries on. It is written down in your browser, so it survives a reload, and it is a list of chat ids and nothing else.
- **When a refine lands** is how you find out: a pop-up, a sound, or neither. The sound is a short built-in blip unless you choose a file of your own.
- **Ways to reach it** are the two optional ways in, both off by default. **A floating button** puts a round button over the chat that refines the latest reply in one tap, and needs the interface panels permission. **Refine what I am typing** adds a row to the chat input's Extras menu that rewrites the text sitting in your input box before you send it.
- **Your whole setup** exports it to a file, imports one back, and puts everything back to its defaults. In [Import and export](prompt.md#import-and-export) and [Starting again](prompt.md#starting-again).

---

[Back to the README](../README.md)
