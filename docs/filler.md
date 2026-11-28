# Cut filler

## In short

- **Cut filler** takes sentences out of each new reply when your Decision model is sure they are filler.
- Nothing is rewritten. A sentence is kept as it is, or taken out whole.
- It costs one Decision call for each reply.
- What it asks the model is in a box you can read and change, with **Use the built-in text** to go back.
- **Leave dialogue alone** is on by default, so a sentence with dialogue in it is not sent or cut.
- **Most of a reply it may take out** is 30% by default. A reply is never emptied.
- It is off by default. Turn it on in the **Cut filler** card on the **Limits** tab.

## Steps

1. Set up a Decision connection in Lumiverse, under **Decision models** in the Connections panel. A small, fast model is enough.
2. Make sure Auto Refine has the **Decision models** permission, under Extensions in Lumiverse.
3. Open the **Limits** tab and find the **Cut filler** card.
4. Switch on **Cut filler from each reply**.
5. Leave **Cut when it is at least this sure (%)** at 70 to start. A lower number cuts more sentences, and more of them by mistake.
6. To use a Decision connection other than your default one, pick it under **Which Decision connection**, on the **Model** tab. It shows while Cut filler is on.
7. To see each reply's cuts before they are saved, turn on **Ask before cutting**.
8. The next reply is checked. The Log shows each sentence that was cut, and how sure the model was.

## What it sends

One call for each reply, through Lumiverse, to the Decision connection in use. It holds:

- the reply, with its thinking taken out, named `reply`
- one question for each sentence, made from **What it asks about each sentence**, with the sentence in quotation marks where `{{sentence}}` is

The built-in question is:

```
This sentence from `reply` is filler: {{sentence}}
Filler is a stock line about a body, a look or a pause, such as a held breath, a racing pulse or a tight jaw, or a line that says again what `reply` already said. `reply` reads the same without it.
```

A question of your own without `{{sentence}}` has the sentence added on a line of its own at the end, so every question still names its sentence.

Lumiverse asks the model how likely each question is to be true, from 0 to 1. Auto Refine shows that as a percent.

These are not sent:

- a sentence with dialogue in it, while **Leave dialogue alone** is on
- a sentence with code, a link or a tag in it
- your card, your own messages, the rest of the chat, lore and settings

See [Privacy](privacy.md#cut-filler) for who receives it.

## An example

Inés turns on Cut filler and leaves every setting as it starts. A reply comes in:

> Bram lit the stove in the cold kitchen. His pulse quickened. The kettle ticked as it warmed on the iron ring. A long moment passed.

Auto Refine sends the reply and four questions, one for each sentence, in one call. The model answers:

| Sentence | How sure it is filler |
| --- | --- |
| Bram lit the stove in the cold kitchen. | 10% |
| His pulse quickened. | 97% |
| The kettle ticked as it warmed on the iron ring. | 10% |
| A long moment passed. | 93% |

Two sentences are at or over 70%. Together they are more than 30% of the reply, so only the surest one goes. The reply is saved as:

> Bram lit the stove in the cold kitchen. The kettle ticked as it warmed on the iron ring. A long moment passed.

The Log says:

- "His pulse quickened." cut as filler, 97% sure
- 1 more sentence was left in, so that no more than 30% of the reply is taken out

**Put it back**, on the Auto Refine tab, brings the sentence back.

## The settings

All of these are under **Cut filler from each reply**, and show only while it is on.

| Setting | Starts at | What it does |
| --- | --- | --- |
| **Ask before cutting** | Off | The cuts wait for your yes, the same way **Ask before saving a refine** holds a refine. |
| **Cut when it is at least this sure (%)** | 70 | A sentence goes when the model is at least this sure it is filler. From 1 to 100. |
| **Leave dialogue alone** | On | A sentence with dialogue in it is not sent or cut. |
| **Most of a reply it may take out (%)** | 30 | The surest sentences go first, while they fit under this. From 1 to 100. |
| **What it asks about each sentence** | The built-in text | The question sent for each sentence. **Use the built-in text** puts the built-in one back. |

## Why 70

70 comes from a test with jev-latest on 50 made-up replies, about 200 sentences.

- The filler sentences scored from 65% to 92%. Most scored in the 70s.
- The other sentences scored 72% at most.
- At 90, 1 of the 48 filler sentences was cut.
- At 70, 32 to 34 were cut, over three runs. No sentence that was not filler was cut.
- One sentence that was not filler scored 72%. **Most of a reply it may take out (%)** kept it in, since the surest sentences go first.

Another Decision model can score the same sentences higher or lower. If it cuts too little, lower the number. If it cuts sentences you want, raise it.

## When it runs

Cut filler runs after the refine and before the word swaps. See [What happens to a new reply](settings.md#what-happens-to-a-new-reply) for the whole order.

- **A new reply**, whether or not the automatic refine is on.
- **A refine of a whole reply.** The cuts are made on the rewrite, in the same write.
- Not on **a refine of part of a reply**, since a part has too little around it to judge.
- Not on the greeting, unless **Refine the greeting** is on.
- **Your own messages** only when **What to refine**, on the Setup tab, includes them, and only from a refine you start.
- Not with Auto Refine off, or switched off in the chat.

Cut filler goes first, then your [Word swaps](swaps.md), in the same write. One **Put it back** undoes both.

## When it cannot ask

The reply is left as it was, and the reason is said in plain words. A notification says it the first time, and the Log says it every time. The reasons are:

- no Decision connection is set up, or none is the default
- the connection picked under **Which Decision connection** is gone
- the connection has no key saved
- the **Decision models** permission is refused
- this Lumiverse is too old to have Decision connections for extensions
- the model did not answer in time, or answered with an error

## It can be wrong

The Decision model can be sure about a sentence that mattered.

- **Put it back** brings back what was cut.
- A higher number under **Cut when it is at least this sure (%)** cuts less.
- **Ask before cutting** shows each reply's cuts before they are saved.
- **What it asks about each sentence** can say what filler means in your story.

## Limits

- A reply with only one sentence is not sent. A reply is never emptied.
- A sentence is found by its end: a period, a question mark, an exclamation mark or an ellipsis, before a space or the end of a line. See [How a sentence is found](swaps.md#how-a-sentence-is-found).
- Up to 120 sentences of a reply are asked about. The rest of a longer reply is left as it is, and the Log says how many.
- With [Two models](two-models.md) on as well, a reply has two Decision calls: one to decide whether to refine it, and one for Cut filler.

---

[Back to the README](../README.md)
