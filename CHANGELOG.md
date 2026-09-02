# Changelog

Every released version of Auto Refine, newest first.

Versions follow [Semantic Versioning](https://semver.org). A new major version means a reinstall rather than an update, a minor version adds something, and a patch version only fixes things.

---

## 1.0.0

_2026-09-02_

First release.

### Added

- **The whole of it lives in a tab in the sidebar drawer.** Not a settings window: this is something you keep open while you write, and after a refine the tab shows what changed with a way to put it back, sitting where you are already looking. The tab carries a badge while a refine is waiting to be looked at. There is no Save button, because a tab has no moment where it closes; everything saves as you change it.
- **A second model pass over a finished reply, following rules you write.** Off until you turn it on. A button refines the latest reply on demand whether or not the automatic pass is running.
- **The greeting is never refined.** A person wrote it, so no path in the extension touches it, and no setting changes that.
- **A refine can run on a different connection from the one you chat with.** A rewrite does not need your roleplay model, and pointing this at a cheaper one is most of what the feature costs.
- **Thinking is off for the pass by default.** Rewriting a paragraph is not a reasoning problem, and extended thinking on every reply adds up quietly.
- **Seven checks on what comes back.** A preamble, a refusal, an empty answer, no change at all, and a rewrite too much longer or shorter than the original are each dropped, and the reply is left exactly as it was. The panel says which one fired.
- **The original is kept so a refine can be put back**, for as long as the page is open.
- **Ask before saving**, showing both versions side by side.
- **Try it on some text** without saving anything, using the rules as they stand rather than as they were saved.
- **The prompt is a list of blocks you control.** The instruction, the character card, the run-up from the chat, your rules, your structure rules, whose message it is, and the message itself. Reorder them, switch most of them off, send each as System, User or Assistant, and add blocks of your own text anywhere in the order. Two are locked on, the instruction and the message, because every check on the answer assumes the model was given both.
- **A rewrite can see who is speaking and what just happened.** The character card and the last few messages go in the prompt, both optional and both trimmed to a ceiling. A refine that cannot see the run-up flattens a scene into general prose, which is the failure people blame on the model.
- **Sampler settings for the refine call**, blank to begin with, so the connection's own preset decides until you say otherwise. What you set is sent with the refine and nothing else.
- **Import and export**, one file with your rules, your prompt layout and your samplers in it. Every value in a file is checked before it is used, so a hand-edited one loads what it can rather than leaving the panel unable to draw.
- **The prompt is the settings.** No rules box with a fixed prompt hidden behind it: the whole request is a list of blocks you wrote, each with a name, a role and its text, in the order they are sent. Rename them, reorder them, switch them off, add your own.
- **Macros**, ours and Lumiverse's own. `{{message}}`, `{{history}}`, `{{lore}}` and `{{whose}}` are answered here; `{{description}}`, `{{persona}}` and everything else you can use in a character card are answered by the host. Ours are filled in last, after the host has run, so a reply that happens to contain a macro cannot expand into somebody's prompt.
- **Four prompts ship with it**, and all four work as they stand: a short one and a detailed one, each in a version for a plain model and a version for a model that reasons. A model that reasons gets the standard and works out the rest; a model that does not gets the list.
- **The answer comes back in tags.** The prompt asks for the rewrite between `<refined>` and `</refined>`, and only what is between them is used. A model that opens with "Sure! Here is the rewritten message" used to lose its whole answer; now that sentence is simply ignored. An opening tag with nothing closing it means the rewrite was cut off, and a half-written message is never saved.
- **Markup is hidden from the model and checked on the way back.** Tags, code and image links are lifted out and stood in for by tokens, and if a token does not come back the rewrite is dropped rather than saved. Asking a model to preserve something and checking that it did are different things.
- **The model's own thinking is never sent.** It is cut off before the refine and put back exactly as it was, so a rewrite cannot quietly edit what a model worked out in a place nobody checks.
- **Every refine can be put back, not just the last one.** A second refine in the same chat used to take away the way back from the first without saying so.
- **A button on every message**, off by default, in the message's own row of actions next to Edit and Copy. After a refine the same button becomes an undo.
- **Context budgets in tokens**, for the run-up and for the lorebook, beside the message count. Whole messages and whole entries are kept or dropped, counted with Lumiverse's own tokeniser where it will answer.
- **Inline formatting stays visible to the model.** Hiding `<i>` and `<b>` behind tokens handed it a sentence with holes in it, which made the rewrite worse to protect something it was unlikely to break. Anything carrying an attribute is still hidden, and there is a switch for the rest.
- **Eight thinking levels** rather than three: auto, none, minimal, low, medium, high, extra high, max.
- **A search that looks across every tab**, not just the one you are on, with folds opened so nothing hides from it.
- **Expand**, on every block and on the Try it box, opening the text in an editor the size of the screen. It does not focus the box, so no keyboard jumps up on a phone and covers what you opened.
- **Import, export and reset all work in parts.** Your prompt, context, model, samplers, limits, alerts, buttons, switches, presets and chats-off, each with its own switch in all three. Export only your prompt, take only somebody's samplers, or start your prompt again without losing your connection.
- **The bug report is yours to choose and yours to read.** Six parts you can switch on and off, and a Read and edit it first that opens the whole thing so you can take out anything you would rather not post. What your blocks say is never in it, only their names, roles and macros.
- **The live view names the stage.** Asking, thinking, writing with a character count when your connection streams, then checking, with a clock and a countdown to the timeout. The dot breathes and the floating button pulses while something is running.
- **Streaming**, on by default and falling back on its own where a connection cannot. The answer is judged when it is complete either way; this only decides whether you can watch it arrive.
- **A What not to touch block in all four prompts**, covering the things protection cannot find: stat blocks, trackers, a translation line beside the original, names and numbers.
- **The floating button is round again**, squares itself against whatever the host gives it, and does more: one tap refines or puts the last refine back, holding it opens a menu.
- **The panel is six tabs, not one column.** Rules, Prompt, Model, Limits, Log and Setup, with the switch, the refine button and the last refine above them so they are there whichever tab you left open. Each group of settings sits in a box of its own.
- **A preview of the request.** Show me the request builds the real thing and shows it message by message, with roles and sizes, without calling a model or charging anything. It is built by the same code a refine uses, so it cannot drift into describing something else.
- **The lorebook goes in the prompt.** The entries the chat has active, as the host works them out, so a rewrite does not contradict what the world has already established.
- **Thinking is yours to set.** Off, whatever your connection is already set to, or an effort level you pick.
- **Presets**, saving your whole prompt, your run-up count, your samplers and your thinking under a name. Your connection and your switches stay yours whichever preset you load, and the four that ship with it are always in the list.
- **Refining what you are typing.** A row in the chat input's Extras menu rewrites the text in your input box before you send it. Off by default, because it edits the box you are typing in.
- **A floating button**, off by default, that refines the latest reply in one tap and can be dragged where you want it.
- **A sound when a refine lands**, off by default, and a short built-in blip when you have not chosen one. It is synthesised rather than shipped, so there is no audio file in the repository. Attach your own or paste a link to replace it.
- **A Log tab.** What it is doing right now with a running clock, the counts for this session, why rewrites were dropped and how often, and one button that copies a bug report carrying settings and counts but never your writing.
- **Starting again**, putting every setting back to its default, with your presets kept unless you say otherwise. It asks first, and it leaves you on the tab you were on.
- **A switch for one chat**, so a scene can be left completely alone.
