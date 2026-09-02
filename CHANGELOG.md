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
- **The panel is six tabs, not one column.** Rules, Prompt, Model, Limits, Log and Setup, with the switch, the refine button and the last refine above them so they are there whichever tab you left open. Each group of settings sits in a box of its own.
- **A preview of the request.** Show me the request builds the real thing and shows it message by message, with roles and sizes, without calling a model or charging anything. It is built by the same code a refine uses, so it cannot drift into describing something else.
- **The lorebook goes in the prompt.** The entries the chat has active, as the host works them out, so a rewrite does not contradict what the world has already established.
- **Thinking is yours to set.** Off, whatever your connection is already set to, or an effort level you pick.
- **Presets**, saving your rules, your prompt layout, your run-up count, your samplers and your thinking under a name. Your connection and your switches stay yours whichever preset you load.
- **Refining what you are typing.** A row in the chat input's Extras menu rewrites the text in your input box before you send it. Off by default, because it edits the box you are typing in.
- **A floating button**, off by default, that refines the latest reply in one tap and can be dragged where you want it.
- **A sound when a refine lands**, off by default, and your own file if you would rather. With none chosen it plays a short blip that is synthesised rather than shipped, so there is no audio file in the repository.
- **A Log tab.** What it is doing right now with a running clock, the counts for this session, why rewrites were dropped and how often, and one button that copies a bug report carrying settings and counts but never your writing.
- **Starting again**, putting every setting back to its default, with your presets kept unless you say otherwise. It asks first, and it leaves you on the tab you were on.
- **A switch for one chat**, so a scene can be left completely alone.
