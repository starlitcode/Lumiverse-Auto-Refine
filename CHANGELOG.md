# Changelog

Every released version of Auto Refine, newest first.

Versions follow [Semantic Versioning](https://semver.org). A new major version means a reinstall rather than an update, a minor version adds something, and a patch version only fixes things.

---

## 1.1.0

_2026-09-06_

### Added

- **The request is measured in tokens, and priced.** **Show me the request** gives the whole request in tokens, with Lumiverse's own tokeniser where it will answer and an estimate where it will not, saying which of the two you are reading. **Where the tokens go** breaks it down block by block, largest first with a share each, which counting the messages cannot do because blocks with the same role are joined before they are sent. Put your provider's input and output prices on the Model tab and the same card says what that request would cost and what a hundred replies at that size come to. Both prices start at 0, and with both at 0 no cost is shown anywhere. Fill in one and the line says which half of the sum it is pricing. No currency is shown either, because nothing here knows which one you are billed in.
- **Every shipped prompt holds the point of view and the strength of what it is given.** A reply written in first person, present tense, from inside one head could come back in polished third with another character's thoughts in it, and nothing about that read as an error. And a model rewriting roleplay softens it: the heat comes down, the violence goes vague, the crude word turns polite. Limits could already refuse a rewrite that sanitised a reply, but that is a call already paid for, so the prompts ask first. Both are said in what the passage keeps rather than in what the model is forbidden.
- **A saved model setup carries that model's prices.** A setup holds the connection, the thinking, the wait and the samplers, so moving from a cheap model to a careful one was a tap. The prices stayed behind, and the panel went on pricing the new model at the old one's rates, which is a figure that was never true of either. They move with the rest now. One you saved before the price boxes existed carries none, and loading it leaves the prices you have alone.
- **There is one prompt, and it is the one on the Prompt tab.** A second copy sat in the backend to fall back on before your settings had crossed over, and it had drifted: four blocks fewer, including the one that keeps markup away from the model, and an opening paragraph the panel stopped using. A refine that ran on it would have reported your prompt and sent that. The copy is gone, and a refine asked for in the moment before your settings arrive says so and sends nothing.
- **The shipped prompts stop using the phrases they exist to cut.** Two opened on "you are the second pair of eyes", which is both the stock way to open a prompt and a stock phrase. "A beat" and "a fragment lands" used writing-workshop metaphors in the same breath as asking for plain writing, and "their hand" for the way somebody writes said nothing to anyone reading the block list. A check holds them to it, built from what was actually taken out rather than a guess at what might creep in.
- **The preset menu offers the four for the list you are editing.** All eight were listed under two headings, so loading a **For your messages** one while editing replies changed the prompt you were not looking at and left the one in front of you alone, with nothing saying so. Your own are still offered whichever list you are on, since one of yours can carry either.
- **Importing the same file twice changes nothing.** Presets and model setups went in beside what you had, so a second import handed you the same preset again under a "(copy)" name, and with a cap on the list it pushed your own oldest one out to make room for it. They go by name now, the way [Auto Retry](https://github.com/starlitcode/Lumiverse-Auto-Retry)'s always have: one that matches a name you have replaces it, one that matches it exactly is left alone, and the panel says which of the three happened to each.
- **A price box takes decimals, and takes a price as a provider writes it.** Every number on the panel was a whole one until prices arrived, so the box rounded what it was given and asked a phone for the keypad with no decimal point on it: `0.075` became `0` and could not be typed at all. Pasting `$5.00/M` off a price list works too, since that is where the number is being copied from.
- **The macro list puts each meaning behind a ?**, the same one every other row on the panel uses. They were spelled out under each macro, which made a list you scan for a half remembered name into ten paragraphs; `{{protect_notes}}` alone ran longer than the other nine together.
- **The Prompt tab says when your block order costs you prompt caching.** Reuse runs from the front of a prompt up to the first thing that changed, so a block below the passage or the run-up is sent as new on every refine. The line counts how many are down there. It is a line rather than a warning because a rule below the passage is followed more closely, so it is a trade you may want to make.
- **The Log tab says what the last refine really used**, input and output, and what it cost. It covers the whole refine rather than its last ask, so a rewrite that was dropped is on that line and so is every extra try **Ask again when a check fails** made: the calls were paid for whether or not anything was saved.

## 1.0.0

_2026-09-05_

First release.

---

[Back to the README](README.md)
