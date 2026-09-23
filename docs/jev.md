# Two models

A beta. With one model, which is the default, every reply the automatic pass reaches is refined. With two, a second model called Jev reads each finished reply first and says whether it needs a refine, and the refine model runs only on the replies Jev picks out. Replies that were fine already stop costing a refine.

Jev is a small decision model made by TypeSafe. It does not write text. It is handed the reply and a list of statements about it, and it answers each with the chance, from 0 to 100 percent, that the statement is true. That is the whole of what it can do, so it has nothing of its own to save over a reply.

## Setting it up

Everything is on the Model tab, in **One model or two**.

1. Set **How many models** to two.
2. Pick **Where Jev is reached**. OpenRouter and NanoGPT sell access to Jev alongside other models. TypeSafe is the maker. **Another address** is for any other host that takes the same kind of request, and asks for its address and the name it gives Jev.
3. Paste a key from that host under **Jev key** and press **Save key**. The key has to come from the host you picked.
4. Press **Test**. It asks Jev one small question with nothing from any chat in it, and says whether an answer came back.

Two-model mode also needs the `cors_proxy` permission, since Jev is not a chat model and no connection profile can reach it. Without it the panel says so and every reply is refined, the same as with one model.

## What Jev checks

**What Jev checks** holds one statement a line. Each is about `reply`, written with backticks, which is the name Jev knows the reply by. The reply it reads is the reply without its thinking.

The ones it starts with:

```
`reply` repeats a word, a phrase or a sentence shape inside itself.
`reply` uses stock phrases that turn up in many stories.
`reply` states a character's feeling outright where the scene could show it.
`reply` piles up adjectives or strained comparisons.
```

Write them to match what your prompt fixes. A check for something your prompt never touches refines replies for a reason the refine will not act on.

Jev answers these best when each one:

- asks about one thing. A statement joined with "and" is two checks.
- names something that shows on the page, rather than a judgement of the whole reply.
- is plainly true or false of the text, so a reader could check it without guessing at intent.

**Refine when a check reaches** is the line, 50 percent by default. A reply is refined when any check reaches it. Lower refines more replies, higher refines fewer.

**Also check for worn-out phrases** adds one more check: whether the reply uses a phrase this chat has worn out. The list is the one `{{overused}}` fills in, so it only has anything in it while **Find phrases this chat has worn out** is on, on the Prompt tab. The reply being judged is not counted in that list, only the ones before it.

### Putting the built-in checks back

If you make a mistake in **What Jev checks**, press **Use the built-in checks** under the box.

- It asks first, because what you wrote is not kept.
- It only changes the checks. The host, the key, the threshold and the number of models stay as they are.

## When Jev is asked

Only on the automatic pass. **Refine the latest reply**, the button on a message and refining a selection are you deciding a reply needs one, so Jev is not asked and nothing is sent to it.

Jev is asked after **Seconds between automatic refines**, when that is set, and the panel says "Jev is reading the reply" while it does. **Stop** works while it is reading.

## When Jev cannot answer

The reply is refined, the same as with one model. No key, a refused key, an account with no credit, a host that is down or an answer with nothing usable in it all end this way, and the Log says which. The beta failing costs you a refine you might not have needed, never a refine you did.

## Reading what it decided

Every answer goes in the Log, each check with its percentage:

```
Jev says leave it: reply repeats a word, a phrase or a sentence shape inside itself 12%; ...
Jev says refine: ... uses stock phrases that turn up in many stories 71%; ...
```

A reply Jev left alone also says so where a refine that stood down would, with the highest percentage it gave. If Jev is letting through replies you would have refined, lower the line or add the check it is missing. If it refines replies that were fine, raise the line or drop the check that keeps firing.

## What it costs

Jev is billed by the host you picked, not by your refine provider. Each reply the automatic pass reaches is one call to Jev. Where the host reports the cost of a call, the Log shows it beside the answer.

## Privacy

What goes to Jev, and where the key is kept, is on the [Privacy](privacy.md#jev) page.

---

[Back to the README](../README.md)
