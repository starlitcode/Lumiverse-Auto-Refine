# Changelog

Every released version of Auto Refine, newest first.

Versions follow [Semantic Versioning](https://semver.org). A new major version means a reinstall rather than an update, a minor version adds something, and a patch version only fixes things.

---

## 1.1.0

_2026-09-05_

### Added

- **The request is measured in tokens, and priced.** **Show me the request** counts the whole request and every message in it, with Lumiverse's own tokeniser where it will answer and an estimate where it will not, saying which of the two you are reading. Put your provider's prices per million tokens on the Model tab and the same card says what that request would cost and what a hundred replies at that size come to. Both prices start at 0, and at 0 no cost is shown anywhere. No currency is shown either, because nothing here knows which one you are billed in.
- **The Log tab says what the last refine really used**, tokens in and back, and what it cost. A rewrite that was dropped is on that line too: the call was made and paid for whether or not anything was saved.

## 1.0.0

_2026-09-05_

First release.

---

[Back to the README](README.md)
