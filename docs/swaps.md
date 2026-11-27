# Word swaps

## In short

- **Word swaps** replace words and phrases in each reply. No model is asked, so they cost nothing.
- They are for words a model keeps writing word for word, such as the same few names for new characters, or a phrase like "barely above a whisper".
- Each swap has what to find and what to put instead. With several choices, one is picked at random.
- **Keep the same pick in a chat** gives a found word the same choice in every later reply of that chat, so a character is not renamed partway through.
- A swap with nothing to put instead takes the words out. It can also take out the whole sentence, or the end of the sentence.
- **Leave dialogue alone** keeps a swap away from words inside quotation marks.
- **Most of a reply a cut may take out** stops sentence cuts from taking out too much. A reply is never emptied.
- **Ask before swapping**, off by default, holds a reply's swaps until you say yes.
- They are off by default. Turn them on in the **Word swaps** card on the **Limits** tab.

## Steps

1. Open the **Limits** tab and find the **Word swaps** card.
2. Switch on **Swap words in each reply**.
3. Press **Add a swap**.
4. Under **Find**, type a word or a phrase. Put several on their own lines to swap them all with the same choices.
5. Under **Put instead**, type a choice. Put several on their own lines to have one picked at random. Leave it empty to take the words out.
6. With **Put instead** empty, **What to take out** shows. Pick **Only the words**, **The end of the sentence** or **The whole sentence**. See [Taking out a sentence or its end](#taking-out-a-sentence-or-its-end).
7. Leave **Keep the same pick in a chat** on for names. Turn it off for words where a new pick each time is fine.
8. To leave words inside quotation marks alone, turn on **Leave dialogue alone**.
9. To see each reply's swaps before they are saved, turn on **Ask before swapping**, under **Swap words in each reply**.
10. The swaps are used on the next reply. The Log says what was swapped.

## What it sends

Nothing. A swap is made on your server, in the reply, with no model call.

The picks made in each chat are kept on your account, so the same name is used on every device. See [Privacy](privacy.md#what-it-keeps).

## An example

Odile is writing a story, and her model keeps naming new characters Elara and Lyra. It also keeps writing "barely above a whisper" and "jolt". She adds three swaps:

| Find | Put instead | Keep the same pick in a chat |
| --- | --- | --- |
| Elara<br>Lyra | Brindle<br>Maeve<br>Tolly | On |
| barely above a whisper | (empty) | On |
| jolt | shiver | On |

A reply comes in:

> Elara leaned closer. "Lyra is gone," she said, barely above a whisper. A jolt ran through the room.

After the swaps:

> Maeve leaned closer. "Tolly is gone," she said. A shiver ran through the room.

- Elara and Lyra each got a name from the list, picked at random. They got different names, since the list had enough names for both.
- "barely above a whisper" was taken out, along with the comma in front of it.
- "jolt" became "shiver".

Two replies later, the model writes:

> Lyra laughed. Elara did not.

It becomes:

> Tolly laughed. Maeve did not.

The same names were used, because **Keep the same pick in a chat** is on.

## How a swap is matched

- Whole words only. A swap for "jolt" leaves "jolted" and "jolting" alone. To swap those too, add them on their own lines, or as their own swap.
- Capitals are ignored when finding. The choice is written with the capitals of what it replaces:
  - "Jolt" at the start of a sentence becomes "Shiver".
  - "JOLT" becomes "SHIVER".
  - A word written in small letters leaves the choice as you typed it, so a name keeps its capital.
- A space in a phrase matches any run of spaces, or a line break.
- A straight quote or apostrophe matches a curly one, and a curly one matches a straight one. "couldn't help but" finds "couldn’t help but".
- Punctuation next to a word does not stop it, such as a comma, a period, brackets or quotation marks.
- A longer phrase is swapped before a shorter word inside it. With swaps for "whisper" and "barely above a whisper", the phrase is swapped whole.
- What a swap puts in is never swapped again by another swap.

## Taking words out

A swap with nothing under **Put instead** takes the words out, and tidies what is left:

- One space is left between the words either side.
- No space is left in front of punctuation.
- Two commas left side by side become one, and a comma left in front of a period goes.
- Words taken out at the start of a sentence take a comma after them too, and the next word gets a capital. "Barely above a whisper, she spoke." becomes "She spoke."

## Taking out a sentence or its end

**What to take out** shows when **Put instead** is empty. It has three choices.

- **Only the words**, the default. The words are taken out, as in [Taking out words](#taking-out-words).
- **The end of the sentence.** The words go, and so does the part of the sentence before them, back to the last comma, semicolon, dash, "and" or "but". "Tamsin leaned on the post, knuckles white." becomes "Tamsin leaned on the post."
- **The whole sentence.** The sentence that holds the words goes. "Her pulse skipped a beat." is taken out whole, with the space next to it.

### When the end of a sentence cannot be taken

The end of the sentence is only taken when:

- the words come at the end of the sentence, with only punctuation after them
- there is a comma, semicolon, dash, "and" or "but" before them in the sentence
- at least two words are left in front of it
- the part taken out has no dialogue in it

If one of these does not hold, only the words are taken out. "Tamsin stood, knuckles white, and let go." becomes "Tamsin stood, and let go."

### When a whole sentence cannot be taken

A whole sentence is never taken when it holds dialogue, or code, a link or a tag. Then the end of the sentence is taken, if it can be. If it cannot, the sentence is left as it is.

### Markup and blank lines

- A sentence in its own pair of asterisks, such as `*Her pulse skipped a beat.*`, goes with them.
- An asterisk that opens or closes a longer action stays. "*Tamsin coiled the rope. Her pulse skipped a beat.*" becomes "*Tamsin coiled the rope.*"
- A sentence that was a whole paragraph takes its line with it. No third blank line is left.

### The limit

**Most of a reply a cut may take out (%)** is under **Ask before swapping**. It is 30 by default, from 1 to 100.

- It counts the letters, numbers and punctuation taken out by **The end of the sentence** and **The whole sentence**. Spaces are not counted.
- Cuts are made in the order they come in the reply. A cut that would go past the limit is left as it is, and the Log says how many were left.
- **Only the words** is not counted, since it takes out a few words at a time.
- A reply is never emptied. If the swaps would leave no words, the reply is left as it was.

### An example

Odile adds two swaps. Both have nothing under **Put instead**.

| Find | What to take out | Leave dialogue alone |
| --- | --- | --- |
| pulse skipped a beat | The whole sentence | Off |
| jaw tight | The end of the sentence | On |

A reply comes in:

> Rook set the kettle on the stove and waited for the water to boil. Her pulse skipped a beat. He turned to the window, jaw tight. "Keep your jaw tight out there," he said.

After the swaps:

> Rook set the kettle on the stove and waited for the water to boil. He turned to the window. "Keep your jaw tight out there," he said.

- "Her pulse skipped a beat." was taken out whole.
- ", jaw tight" was taken out from the comma.
- "jaw tight" in the dialogue stayed, because **Leave dialogue alone** is on. With it off, those words would go, and the dialogue would read "Keep your out there".
- The two cuts are about a fifth of the reply, so the limit of 30 let both through.

## Leaving dialogue alone

**Leave dialogue alone** is a tick box on each swap, off by default. On, the swap skips words inside quotation marks.

- Straight quotes, curly quotes and angled quotes such as « » all count.
- Quotation marks are read one line at a time. Dialogue that goes on past a line break is not seen as dialogue on the next line.
- It works for every swap, including one that puts something in. Leave it off for names, which are often said in dialogue.

## When swaps are made

Word swaps are the last step before a reply is saved. See [What happens to a new reply](settings.md#what-happens-to-a-new-reply) for the whole order.

- **A new reply.** Swaps are made on each new reply, whether or not the automatic refine is on.
- **A refine.** A refine gets the swaps in the same write, on the rewrite. A refine of part of a reply swaps only in the part that was rewritten.
- **A refine that wrote nothing.** A reply that was not refined, such as one a check turned away, still gets its swaps, as their own write.
- **Rerolls from Auto Retry.** A reroll is a new reply, so it gets its swaps. A reply that Auto Retry is about to retry is left alone, since it is being replaced.
- **With Auto Foley.** With Auto Foley's **Autoplay new replies** or **Prepare replies ahead** on, a reply is spoken after its swaps. Auto Foley waits for the reply to stop changing before it directs it.
- **Your own messages** only get swaps when **What to refine**, on the Setup tab, includes them, and only from a refine you start.

Swaps are not made:

- With Auto Refine off, or switched off in the chat.
- On the greeting, unless **Refine the greeting** is on.
- While a refine is waiting for you to say yes. The rewrite you are asked about already has its swaps. A name picked for it is only kept for the chat once you accept it.
- After **Take it out**, which takes out exactly what you selected and nothing else.

## What it leaves alone

- The reply's thinking, in any format Auto Refine recognizes, while **Keep the reply's own reasoning out of the refine** is on. See [The reply's own reasoning](prompt.md#the-replys-own-reasoning).
- Code, links, tags, HTML entities, tables and divider lines. The words between two tags are still swapped. The tags themselves are not.
- Another extension's blocks inside a reply.

## Asking first

**Ask before swapping** is under **Swap words in each reply**, and off by default. On:

- A reply's swaps are not saved straight away. They wait as a question, the same way **Ask before saving a refine** holds a refine.
- The question shows what changed. It is in the **Waiting for you** card at the top of the tab, and comes up on screen as **Save these word swaps?** when the tab is not open.
- **Accept it** saves the swaps. **Turn it down** leaves the reply as it was.
- A name picked for a reply is only kept for the chat when you accept it.
- A refine with swaps in it asks once for both, even with **Ask before saving a refine** off. The question says the rewrite includes word swaps. A refine with no swaps in it is saved as usual.

## Putting it back

- A swap shows on the Auto Refine tab with what changed, and **Put it back** undoes it, the same as a refine. It needs **Keep what a refine replaced**, which is on by default.
- A swap made in the same write as a refine is undone with the refine.
- A swap on a reply that was refined earlier keeps the text from before the refine. One **Put it back** undoes both.
- A swap made on its own does not bring up a card or a notification, since a list of swaps can change most replies. The Log says what was swapped.
- A swap is never added as a swipe, even with **Add the refine as a swipe instead of writing over the reply** on.

## Limits

- Up to 100 swaps, each with up to 30 words to find and 40 choices.
- A sentence is found by its end: a period, a question mark, an exclamation mark or an ellipsis, before a space or the end of a line. A title such as "Dr." can end a sentence early.
- A swap does not change the form of a word. "jolted" is not turned into "shivered". Add the forms you want as their own swaps.
- A swap does not read what a sentence means. A name swapped in one chat is also swapped in a sentence that uses the same word for something else.
- The picks for up to 300 chats are kept, and up to 300 found words in each. The oldest chat is dropped first.
- Deleting a chat deletes its picks. Resetting **Word swaps** under **Reset** puts the swaps back to an empty list. The picks already made are kept, since a chat may still use them.

---

[Back to the README](../README.md)
