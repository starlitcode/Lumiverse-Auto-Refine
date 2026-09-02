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
- **A switch for one chat**, so a scene can be left completely alone.
