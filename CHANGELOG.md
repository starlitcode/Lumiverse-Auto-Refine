# Changelog

Every released version of Auto Refine, newest first.

Versions follow [Semantic Versioning](https://semver.org). A new major version means a reinstall rather than an update, a minor version adds something, and a patch version only fixes things.

---

## 0.1.0

_2026-09-02_

First release.

### Added

- **A second model pass over a finished reply, following rules you write.** Off until you turn it on. A button refines the latest reply on demand whether or not the automatic pass is running.
- **The greeting is never refined.** A person wrote it, so no path in the extension touches it, and no setting changes that.
- **A refine can run on a different connection from the one you chat with.** A rewrite does not need your roleplay model, and pointing this at a cheaper one is most of what the feature costs.
- **Thinking is off for the pass by default.** Rewriting a paragraph is not a reasoning problem, and extended thinking on every reply adds up quietly.
- **Seven checks on what comes back.** A preamble, a refusal, an empty answer, no change at all, and a rewrite too much longer or shorter than the original are each dropped, and the reply is left exactly as it was. The panel says which one fired.
- **The original is kept so a refine can be put back**, for as long as the page is open.
- **Ask before saving**, showing both versions side by side.
- **Try it on some text** without saving anything, using the rules as they stand rather than as they were saved.
- **A switch for one chat**, so a scene can be left completely alone.
