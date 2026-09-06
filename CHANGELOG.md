# Changelog

Every released version of Auto Refine, newest first.

Versions follow [Semantic Versioning](https://semver.org). A new major version means a reinstall rather than an update, a minor version adds something, and a patch version only fixes things.

---

## 1.2.0

_2026-09-06_

### Fixed

- **The automatic pass could not refine anything on some installs.** A reply finishing said which chat and which message and never which account, and a Lumiverse installed for an operator refuses a model call that names no account. So every automatic refine came back saying Lumiverse could not tell whose it was, while the buttons carried on working, because pressing one says who pressed it. The panel hands its account over with its settings, and that is the account the automatic pass now runs as. On a server with several accounts it is whichever panel loaded last, the same as the rules themselves.

### Added

- **{{memory}} puts what Lumiverse remembers of the chat into the prompt.** Everything before the run-up, in the host's own words rather than assembled here, so a refine is not working from a different version of events than the chat is. Every shipped prompt carries it in a block of its own, under the setting and above the pages before this one, and a chat with memory switched off sends no block at all rather than an empty heading. It needs the memories permission, and without it the macro is empty and refining carries on.
- **Refine a reply that has been refined before**, off by default, on the Limits tab under the automatic pass. Off, each reply is refined once. On, a reply you swiped or regenerated goes through again. Either way a build that announces one generation twice buys one refine, not two, and pressing a button always refines what you pressed it on.

### Changed

- **The floating button keeps its own mark.** A refine that had landed turned it into an arrow, which put a control over your chat you had not asked for and took the extension's mark off the screen for as long as there was something to put back. The way back is a line in the menu behind the button instead, always, and **One tap puts the last refine back** is gone with the state it switched between.
- **Refining the latest reply has left that menu**, because a tap on the button does it. Two ways to one thing, one of them behind a hold, is one more than anybody needs.

## 1.1.0

_2026-09-06_

### Added

- **The request is measured in tokens, and priced.** **Show me the request** gives the whole request in tokens, with Lumiverse's own tokeniser where it will answer and an estimate where it will not, saying which of the two you are reading. **Where the tokens go** breaks it down block by block, largest first with a share each, which counting the messages cannot do because blocks with the same role are joined before they are sent. Put your provider's input and output prices on the Model tab and the same card says what that request would cost and what a hundred replies at that size come to. Both prices start at 0, and with both at 0 no cost is shown anywhere. Fill in one and the line says which half of the sum it is pricing. Price lists write these as `$0.075/M`, so type the number on its own or paste the line and the number is taken out of it, and a saved model setup carries the prices of the model it names. No currency is shown either, because nothing here knows which one you are billed in.
- **Every shipped prompt holds the point of view and the strength of what it is given.** A reply written in first person, present tense, from inside one head could come back in polished third with another character's thoughts in it, and nothing about that read as an error. And a model rewriting roleplay softens it: the heat comes down, the violence goes vague, the crude word turns polite. Limits could already refuse a rewrite that sanitised a reply, but that is a call already paid for, so the prompts ask first. Both are said in what the passage keeps rather than in what the model is forbidden.
- **There is one prompt, and it is the one on the Prompt tab.** A second copy sat in the backend to fall back on before your settings had crossed over, and it had drifted: four blocks fewer, including the one that keeps markup away from the model, and an opening paragraph the panel stopped using. A refine that ran on it would have reported your prompt and sent that. The copy is gone, and a refine asked for in the moment before your settings arrive says so and sends nothing.
- **The shipped prompts stop using the phrases they exist to cut.** Two opened on "you are the second pair of eyes", which is both the stock way to open a prompt and a stock phrase. "A beat" and "a fragment lands" used writing-workshop metaphors in the same breath as asking for plain writing, and "their hand" for the way somebody writes said nothing to anyone reading the block list. A check holds them to it, built from what was actually taken out rather than a guess at what might creep in.
- **The preset menu offers the four for the list you are editing.** All eight were listed under two headings, so loading a **For your messages** one while editing replies changed the prompt you were not looking at and left the one in front of you alone, with nothing saying so. Your own are still offered whichever list you are on, since one of yours can carry either.
- **Importing the same file twice changes nothing.** Presets and model setups went in beside what you had, so a second import handed you the same preset again under a "(copy)" name, and with a cap on the list it pushed your own oldest one out to make room for it. They go by name now, the way [Auto Retry](https://github.com/starlitcode/Lumiverse-Auto-Retry)'s always have: one that matches a name you have replaces it, one that matches it exactly is left alone, and the panel says which of the three happened to each.
- **The macro list puts each meaning behind a ?**, the same one every other row on the panel uses. They were spelled out under each macro, which made a list you scan for a half remembered name into ten paragraphs; `{{protect_notes}}` alone ran longer than the other nine together.
- **The Prompt tab says when your block order costs you prompt caching.** Reuse runs from the front of a prompt up to the first thing that changed, so a block below the passage or the run-up is sent as new on every refine. The line counts how many are down there. It is a line rather than a warning because a rule below the passage is followed more closely, so it is a trade you may want to make.
- **The Log tab says what the last refine really used**, input and output, and what it cost. It covers the whole refine rather than its last ask, so a rewrite that was dropped is on that line and so is every extra try **Ask again when a check fails** made: the calls were paid for whether or not anything was saved.

## 1.0.0

_2026-09-05_

First release.

---

[Back to the README](README.md)
