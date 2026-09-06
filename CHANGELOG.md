# Changelog

Every released version of Auto Refine, newest first.

Versions follow [Semantic Versioning](https://semver.org). A new major version means a reinstall rather than an update, a minor version adds something, and a patch version only fixes things.

---

## 1.1.0

_2026-09-05_

### Added

- **The request is measured in tokens, and priced.** **Show me the request** gives the whole request in tokens, with Lumiverse's own tokeniser where it will answer and an estimate where it will not, saying which of the two you are reading. **Where the tokens go** breaks it down block by block, largest first with a share each, which counting the messages cannot do because blocks with the same role are joined before they are sent. Put your provider's input and output prices on the Model tab and the same card says what that request would cost and what a hundred replies at that size come to. Both prices start at 0, and with both at 0 no cost is shown anywhere. Fill in one and the line says which half of the sum it is pricing. No currency is shown either, because nothing here knows which one you are billed in.
- **A price box takes decimals, and takes a price as a provider writes it.** Every number on the panel was a whole one until prices arrived, so the box rounded what it was given and asked a phone for the keypad with no decimal point on it: `0.075` became `0` and could not be typed at all. Pasting `$5.00/M` off a price list works too, since that is where the number is being copied from.
- **The macro list puts each meaning behind a ?**, the same one every other row on the panel uses. They were spelled out under each macro, which made a list you scan for a half remembered name into ten paragraphs; `{{protect_notes}}` alone ran longer than the other nine together.
- **The Prompt tab says when your block order costs you prompt caching.** Reuse runs from the front of a prompt up to the first thing that changed, so a block below the passage or the run-up is sent as new on every refine. The line counts how many are down there. It is a line rather than a warning because a rule below the passage is followed more closely, so it is a trade you may want to make.
- **The Log tab says what the last refine really used**, input and output, and what it cost. It covers the whole refine rather than its last ask, so a rewrite that was dropped is on that line and so is every extra try **Ask again when a check fails** made: the calls were paid for whether or not anything was saved.

## 1.0.0

_2026-09-05_

First release.

---

[Back to the README](README.md)
