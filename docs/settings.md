# Settings

Auto Refine lives in a tab in Lumiverse's sidebar drawer, not behind a settings window. Open it from the drawer, or find it with `Ctrl+K`. It is not in the Extras menu and there is no settings window: the drawer is the one place it lives.

It is a tab rather than a window on purpose. This is something you keep open and glance at while you write: what the last refine did to your prose, and a way to disagree with it, sitting where you are already looking.

**There is no Save button.** A tab has no moment where it closes, so a "nothing sticks until you press Save" contract would have nothing to hang on. Everything saves as you change it. That is safe here because nothing on the tab is destructive on its own: a rule is only text until a reply arrives, and the switches that make something happen are switches, which is the control people expect to act at once.

## The face of the tab

The things you change while you work are on the face of the tab, and the things you set once are folded away under **How the pass runs**.

- **The switch at the top** is the master switch. Off, nothing is refined and no model call is made, by any path.
- **Refine the latest reply** does one, now.
- **every reply, automatically** is the automatic pass, off by default. The greeting is never included.
- **The last refine** shows what changed, with **Put it back** next to it. It appears after a refine and goes when you dismiss it. The tab carries a badge while one is waiting, so you can see something happened without the tab open.
- **The rules it follows** is covered in [Writing rules](rules.md).
- **How the prompt is built** is the request itself, block by block, in [How the prompt is built](prompt.md).
- **Try it** runs one refine on pasted text without writing anything to your chat.
- **This chat** leaves one chat completely alone.
- **Import and export** carries a setup to another device, in [Import and export](prompt.md#import-and-export).

## How the pass runs

Folded away, because the defaults are already the cheap answer.

- **Let the button refine your own messages** keeps your voice rather than the character's. The automatic pass never touches what you wrote whatever this says.
- **Show a pop-up on each refine** is on by default. Turn it off if you would rather work quietly and watch the tab instead.

- **Refine using** picks which model does the refining. The list is your own connection profiles, by name. Leave it on the default to use whatever you are chatting with.
- **Let the model think first** is off by default.
- **Give up waiting after** cancels a refine that has not come back. The default is 90 seconds. A hung call is cancelled rather than left running.
- **Longest a rewrite may get** and **Shortest a rewrite may get** are the two length limits, in [What it refuses to save](guardrails.md).
- **Keep what a refine replaced** holds the original so you can put it back.
- **Ask before saving a refine** shows you both versions and waits for a yes.
- **Sampler settings** are blank to begin with, and blank means the connection's own preset decides. Filling one in sends it with the refine and only with the refine. They are covered in [How the prompt is built](prompt.md#sampler-settings).

**Turn off here**, at the bottom of the tab, is written down in your browser, so it survives a reload. It is a list of chat ids and nothing else.
