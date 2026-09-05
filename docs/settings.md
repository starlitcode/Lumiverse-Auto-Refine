# Settings

Auto Refine lives in a tab in Lumiverse's sidebar drawer, not behind a settings window. Open it from the drawer, or find it with `Ctrl+K`. It is not in the Extras menu and there is no settings window: the drawer is the one place it lives.

It is a tab, not a window, on purpose. This is something you keep open and glance at while you write: what the last refine did to your prose, and a way to disagree with it, sitting where you are already looking.

**Your settings follow your account, not this browser.** They are written to Lumiverse under your account and read back on load, so opening a different browser, or a different machine, finds the setup you left. This browser keeps a copy as a cache, which is what draws the panel instantly and what carries on working if the account cannot be reached. On a server with several accounts on it, each account's settings and presets are stored separately and one cannot read another's. If a save to your account fails, the panel says so, so settings never look saved when they are not.

**There is no Save button.** A tab has no moment where it closes, so a "nothing sticks until you press Save" contract would have nothing to hang on. Everything saves as you change it. That is safe here because almost nothing on the tab is destructive on its own: a block is only text until a reply arrives, and the switches that make something happen are switches, which is the control people expect to act at once. The two that do throw something away, deleting a preset and starting again, ask first.

## Finding a setting

The search box above the tabs looks across every one of them, not just the one you are standing on. A setting you cannot remember the home of is exactly the one you are searching for. Matches are grouped by the tab they live on, folds are opened so nothing hides from it, and the tab strip steps out of the way while a search is running.

## Above the tabs

Three things never move, whichever tab you left open, because they are what you came for.

- **The switch** is the master switch. Off, nothing is refined and no model call is made, by any path.
- **Refine the latest reply** does one, now. While one is running, both buttons are replaced by **Stop this refine**, so calling one off never depends on the floating button being switched on. **Refine every reply here**, beside it, goes through a chat you already have, oldest first, one model call each, and asks before it starts. **every reply, automatically** is the automatic pass, off by default. The greeting is never included by any of them, and neither are your own messages unless you press the button on one.
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
- **Give up waiting after** cancels a refine that has not come back. The default is 90 seconds, the most is an hour, and 0 means never give up. Worth raising for a reasoning model on a high effort level, which can think for a long time before it writes anything: a cap that fires mid-thought throws away work that was about to arrive. Turning it off does not leave you stuck, since **Stop this refine** is always there and a backend that is not running says so within a few seconds.
- **Samplers** are blank to begin with, and blank means the connection's own preset decides. In [Sampler settings](prompt.md#sampler-settings).
- **Saved model setups** keeps everything on this tab under a name: the connection, the thinking, the wait and the samplers. Your prompt is not in one, so loading a setup changes what runs the refine and nothing about how it reads, which is the point of keeping the two apart. Save one for a cheap model and one for a careful one and move between them in a tap. They are kept in this browser and in your account, and a setup carries a connection id, which a preset refuses to: presets go into files people share and an id names nothing on somebody else's account. A setup whose connection you have since deleted says so on the card rather than leaving the refine pointed at nothing.

## Limits

- **Extra reasoning tag names** folds away under **Keep the reply's own reasoning out of the refine**, and **Patterns of your own to hide** folds away under the markup switch. Both are lists of text most people never open, and a search reaches inside a fold anyway. The common wrappers are already known: think, thinking, thought, thoughts, reasoning, reflection, scratchpad and analysis. Add a name only if your model uses an unusual one. This is worth getting right, because working that is not recognised is handed to the refiner as prose, rewritten, and saved over the reply.
- **Hide markup from the model**, **Hide plain italic and bold too** and the two switches that keep reasoning out of the way keep a rewrite away from what is not prose, in [Protecting what is not prose](prompt.md#protecting-what-is-not-prose).
- **Reading the answer** is its own card. **Take the answer from between the tags** is what makes a model's preamble harmless instead of fatal, in [The answer it asks for](prompt.md#the-answer-it-asks-for). Asking for the tags is your prompt's job; this decides what is done with the answer.
- **Say how much has come back** streams the refine so the line under the switch can count what has arrived rather than sitting on one word for a minute. The answer is judged when it is complete either way, so this changes nothing about what gets saved, and a connection that cannot stream falls back on its own.
- **Longest a rewrite may get** and **Shortest a rewrite may get** are the two length limits, in [What it refuses to save](guardrails.md).
- **Refuse an answer that declines the job**, **Refuse an answer that talks about the edit** and **Refuse a rewrite that sanitised the reply** are the three checks on what an answer says, each with a switch of its own. The last compares the rewrite against the original and has its own threshold and word list under it. Switching all three off is said out loud, because a refusal written by the model could then be saved over your reply.
- **Ask again when a check fails** retries a refine that failed one of the checks a second try could fix, 0 times by default.
- **Keep what a refine replaced** holds the original so you can put it back.
- **Ask before saving a refine** holds every refine until you say. Both versions appear in a **Waiting for you** card at the top of the tab, with **Accept it** and **Turn it down**, and the tab carries a badge until you answer. Where Lumiverse can draw one, the same question also opens as a window; answering either settles both. The floating button's menu can answer it too, though a tap on the button only opens the tab, since accepting a rewrite of your writing on a stray tap is the one thing it must not do.
- **Your own messages** are refined only when you press a button on one, and never by the automatic pass. They get their own prompt, under **For your messages** on the Prompt tab, so tidying your own line does not turn it into the narrator's. It ships written and runs as it stands; edit it and yours runs instead.

## Log

- **Right now** is the live view. It names the stage instead of just saying busy: asking, thinking, writing with a character count when your connection streams, then checking. The clock runs, and past eight seconds it also says how long is left before the timeout gives up. It writes into the line in place, so the panel never repaints under you, and the dot beside it breathes while something is running.
- **What the model worked out** keeps the working from the last refine that finished, whether that was a reply or the draft in your input box, and says which. It has a **Copy** and a **Clear**. It reads as prose: the tags the model wrapped it in are taken off, on this card and everywhere else, so the working reads the same wherever you see it. Only a refine that finished replaces it, so stopping one leaves the last lot alone. A prompt that does not ask the model for its working has none to keep, and the card says so.
- **What it has been doing** is the running list, newest first.
- **Reporting a problem** copies everything somebody would otherwise have to ask you for. **What it carries** decides which parts go in: your settings, the shape of your prompt, the counts, the recent log, where you are, and your browser. What your blocks actually say is never in it, only their names, roles and macros, so it is safe to paste in public. **Read and edit it first** opens the whole thing so you can take out anything you would rather not post before it is copied.

## Setup

- **This chat** leaves one chat completely alone while every other chat carries on. It is written down in your browser, so it survives a reload, and it is a list of chat ids and nothing else.

  A **temporary chat**, the scratch conversation with no character card on it, is told apart from an ordinary one and the card says so. The switch works there for as long as the chat is open, but it is not written down: the chat is discarded on the way out and the next one carries a different id, so a remembered entry could never match anything again. It would sit in storage looking like a setting and doing nothing. A chat whose card could not be read at all is not a temporary chat, and is not treated as one.
- **When a refine lands** is how you find out. **Show the before and after on screen** puts a card on the page itself, not in this tab, when a refine lands: what the reply said before, what it says now, and a button to put it back; it is on by default, because a refine changes writing you were reading and having to find a tab to see what changed is the wrong way round. **Show a brief message** is the one-line note at the edge of the screen. A sound is off by default, and with nothing attached it is a short built-in blip synthesised in the browser, with no file to ship. Closing the card loses nothing: every refine stays under **The last refine** here until you dismiss it.
- **Ways to reach it** are two optional ways in, both off by default. **A floating button** puts a round button over the chat: one tap refines the latest reply, and holding it or right clicking opens Lumiverse's own menu, which carries the tab, refining the latest reply or every reply in the chat, stopping one that is running, an undo when there is one, a way to hide the button, and the master switch. With **One tap puts the last refine back** on, the button itself is the undo and the menu drops its own: the arrow is in front of you, and two entries for one tap is one too many. Refining is what a tap does, and the automatic pass and the per chat switch are settings, so they stay on the tab where their explanations are rather than appearing as bare labels in a menu over the chat. It pulses while a refine is running, which is often the only part of the extension on screen. It needs the interface panels permission. **Refining the draft in your input box** is the other, and it is off by default because it writes into the box you are typing in. On, a **Refine what I am typing** button joins the other two above the tabs, and an entry for it appears in the chat input's Extras menu, or in the floating button's menu while that button is on screen. A refine of your draft asks the chat for nothing, so it works in a chat the panel is still working out and outside one entirely; switching Auto Refine off, here or everywhere, still stops it. It shows itself the way a reply's refine does: the button turns while it runs, **Stop this refine** ends it, a card lands with the before and after on it, and the working goes to the Log. The floating button offers your draft back the same way it offers a reply back, and stops offering once you have typed over the rewrite, since putting it back then would throw away the newer writing.

Those last two live in one place at a time. While the floating button is on screen, its menu holds anything that would otherwise be a row in the chat input's Extras menu. With the button off, or refused because the permission is not granted, or on a Lumiverse too old to draw a menu, the rows come back to Extras, which is the only way to reach them on a phone. Two ways to reach one thing is one more than anybody needs.
- **Your whole setup** exports to a file, imports one back, and puts things back to their defaults. All three work in the same list of parts: your prompt, context, model, samplers, limits, alerts, buttons, switches, presets and the chats you switched off. **What goes in the file**, **What to take from a file** and **What to put back** each have their own choice, so you can export only your prompt, take only somebody's samplers, or start your prompt again without losing your connection. In [Import and export](prompt.md#import-and-export) and [Starting again](prompt.md#starting-again).

---

[Back to the README](../README.md)
