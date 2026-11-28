# Cut filler

## In short

- **Cut filler** takes sentences out of each new reply when your Decision model is sure they are filler.
- Nothing is rewritten. A sentence is kept as it is, taken out whole, or loses its end.
- **Trim the end of a sentence** is on by default. The part after the last comma, dash, "and" or "but" can go on its own, such as ", jaw tight".
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
6. Leave **Cut an end when it is at least this sure (%)** at 60 to start. It is the same kind of number, for the end of a sentence.
7. To use a Decision connection other than your default one, pick it under **Which Decision connection**, straight under the switch. It is the same setting as the one for two models on the **Model** tab.
8. To see each reply's cuts before they are saved, turn on **Ask before cutting**.
9. The next reply is checked. The Log shows each sentence that was cut, and how sure the model was.

## What it sends

One call for each reply, through Lumiverse, to the Decision connection in use. It holds:

- the reply, with its thinking taken out, named `reply`
- one question for each sentence, made from **What it asks about each sentence**, with the sentence in quotation marks where `{{sentence}}` is
- with **Trim the end of a sentence** on, one more question for each sentence that has an end, made from **What it asks about the end of a sentence**

The built-in question is:

```
This sentence from `reply` is filler: {{sentence}}
Filler is a stock line about a body, a look or a pause, such as a held breath, a racing pulse or a tight jaw, or a line that says again what `reply` already said. `reply` reads the same without it.
```

A question of your own without `{{sentence}}` has the sentence added on a line of its own at the end, so every question still names its sentence.

The built-in question about the end of a sentence is:

```
The end of this sentence from `reply` is filler: {{end}}
The whole sentence is {{sentence}}
Filler is a stock line about a body, a look or a pause, such as a held breath, a racing pulse or a tight jaw. The sentence reads the same without its end.
```

`{{end}}` is where the end goes, and `{{sentence}}` is the whole sentence, each in quotation marks. A question of your own without `{{end}}` has the end added on a line of its own at the end.

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

## The end of a sentence

A sentence can be fine except for its end, such as "She set down the cup, jaw tight." With **Trim the end of a sentence** on, Cut filler can take out just the end.

1. The end is the part after the last comma, semicolon, dash, "and" or "but", when at least two words come before it. It is the same end a [word swap](swaps.md#taking-out-a-sentence-or-its-end) takes with **The end of the sentence**.
2. The end gets a question of its own, in the same call as the sentence's question.
3. If the model is at least as sure as **Cut an end when it is at least this sure (%)**, only the end goes. This holds even when the whole sentence is sure enough too, since taking out the end takes out less.
4. Otherwise, the sentence goes whole if it is at least as sure as **Cut when it is at least this sure (%)**.
5. An end counts toward **Most of a reply it may take out (%)**, the same as a sentence.

For example, Inés's next reply is:

> Bram hung his coat by the door, his heart racing. The road outside was empty.

Auto Refine sends three questions: one for each sentence, and one for the end "his heart racing". The model answers:

| Question | How sure it is filler |
| --- | --- |
| Bram hung his coat by the door, his heart racing. | 45% |
| The end: his heart racing | 72% |
| The road outside was empty. | 10% |

The end is over 60%, so it goes. The reply is saved as:

> Bram hung his coat by the door. The road outside was empty.

The Log says:

- "his heart racing" cut from the end of a sentence as filler, 72% sure

## The settings

All of these are under **Cut filler from each reply**, and show only while it is on.

| Setting | Starts at | What it does |
| --- | --- | --- |
| **Ask before cutting** | Off | The cuts wait for your yes, the same way **Ask before saving a refine** holds a refine. |
| **Cut when it is at least this sure (%)** | 70 | A sentence goes when the model is at least this sure it is filler. From 1 to 100. |
| **Leave dialogue alone** | On | A sentence with dialogue in it is not sent or cut. |
| **Most of a reply it may take out (%)** | 30 | The surest sentences go first, while they fit under this. From 1 to 100. |
| **What it asks about each sentence** | The built-in text | The question sent for each sentence. **Use the built-in text** puts the built-in one back. |
| **Trim the end of a sentence** | On | The end of a sentence is asked about too, and can go on its own. See [The end of a sentence](#the-end-of-a-sentence). |
| **Cut an end when it is at least this sure (%)** | 60 | An end goes when the model is at least this sure it is filler. From 1 to 100. Shows while **Trim the end of a sentence** is on. |
| **What it asks about the end of a sentence** | The built-in text | The question sent for each end. **Use the built-in text** puts the built-in one back. Shows while **Trim the end of a sentence** is on. |

## Why 70

70 comes from a test with jev-latest on 50 made-up replies, about 200 sentences.

- The filler sentences scored from 65% to 92%. Most scored in the 70s.
- The other sentences scored 72% at most.
- At 90, 1 of the 48 filler sentences was cut.
- At 70, 32 to 34 were cut, over three runs. No sentence that was not filler was cut.
- One sentence that was not filler scored 72%. **Most of a reply it may take out (%)** kept it in, since the surest sentences go first.

### Why 60 for an end

60 comes from the same test, with 20 more made-up replies. Ten of them had a sentence with a filler end, such as ", her hands trembling".

- The filler ends scored from 64% to 78%.
- The other ends scored 55% at most. These are ends that say what happens, such as ", and it broke on the tiles".
- At 60, all 10 filler ends were cut, and no other end.
- At 70, 5 of the 10 were cut.
- A sentence that ends in filler often scores high as a whole, because of its end. With ends asked about, one such sentence lost only its end instead of being cut whole.

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

The reply is left as it was, and the reason is said in plain words. A notification says it the first time, and the Log says it every time. While Cut filler is on, a line under **Which Decision connection** on the card says it too. The reasons are:

- no Decision connection is set up, or none is the default
- the connection picked under **Which Decision connection** is gone
- the connection has no key saved
- the **Decision models** permission is refused
- this Lumiverse is too old to have Decision connections for extensions
- the model did not answer in time, or answered with an error

## It can be wrong

The Decision model can be sure about a sentence that mattered.

- **Put it back** brings back what was cut.
- A higher number under **Cut when it is at least this sure (%)** or **Cut an end when it is at least this sure (%)** cuts less.
- **Ask before cutting** shows each reply's cuts before they are saved.
- **What it asks about each sentence** can say what filler means in your story.

## Limits

- A reply with only one sentence is not sent. A reply is never emptied.
- A sentence is found by its end: a period, a question mark, an exclamation mark or an ellipsis, before a space or the end of a line. See [How a sentence is found](swaps.md#how-a-sentence-is-found).
- Up to 120 sentences of a reply are asked about. The rest of a longer reply is left as it is, and the Log says how many.
- A sentence with an end is two questions in the same call, so the call is longer. In the test above, a reply was about 880 tokens with ends asked about, and about 730 without.
- Only the last end of a sentence is asked about. A sentence with two filler ends loses at most one.
- With [Two models](two-models.md) on as well, a reply has two Decision calls: one to decide whether to refine it, and one for Cut filler.

---

[Back to the README](../README.md)
