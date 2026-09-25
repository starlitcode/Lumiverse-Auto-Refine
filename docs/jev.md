# Two models

A beta. With one model, which is the default, every reply the automatic pass reaches is refined. With two, a second model called Jev reads each finished reply first and says whether it needs a refine, and the refine model runs only on the replies Jev picks out. Replies that were fine already stop costing a refine.

Jev is a small decision model made by TypeSafe. **What is Jev?**, on the Model tab, links to TypeSafe's own introduction. It does not write text. It is handed the reply and a list of statements about it, and it answers each with the chance, from 0 to 100 percent, that the statement is true. That is the whole of what it can do, so it has nothing of its own to save over a reply.

## Setting it up

Everything is on the Model tab, in **One model or two**.

1. Set **How many models** to two.
2. Pick **Where Jev is reached**. OpenRouter and NanoGPT sell access to Jev alongside other models. TypeSafe is the maker. **Another address** is for any other host that takes the same kind of request, and asks for its address and the name it gives Jev.
3. Pick **Which Jev**. See [Which Jev](#which-jev) below.
4. Paste a key from that host under **Jev key** and press **Save key**. The key has to come from the host you picked.
5. Press **Test**. It asks Jev one small question with nothing from any chat in it, and says whether an answer came back, and which Jev answered. The Log tab shows the test in full. See [Reading a test](#reading-a-test).

Two-model mode also needs the `cors_proxy` permission, since Jev is not a chat model and no connection profile can reach it. Without it the panel says so and every reply is refined, the same as with one model.

## Which Jev

**Which Jev** has these choices:

- **The latest Jev**, the default. It moves to each new Jev by itself, with no update to this extension. Its answers can change when a new Jev comes out, even though nothing changed on your side.
- **The preview Jev**, only when the host is TypeSafe. It runs ahead of the latest when TypeSafe has a preview build, for earlier access. When there is none, it is the same as the latest.
- **Jev 1.13 exactly**. Its answers stay steady. Pick this if you have tuned **Refine when a check reaches** and want it to keep meaning the same thing.
- **A name I type** opens a **Model name** box. Type what your host calls Jev. Use this when a host renames Jev, or has a Jev this list does not know. Left empty, Jev 1.13 is used.

The name each host is sent:

| Host | The latest Jev | The preview Jev | Jev 1.13 exactly |
| --- | --- | --- | --- |
| OpenRouter | `~typesafe/jev-latest` | not offered | `typesafe/jev-1.13` |
| TypeSafe | `jev-latest` | `jev-preview` | `jev-1.13.0` |
| NanoGPT | `typesafe/jev-latest` | not offered | `typesafe/jev-1.13` |

OpenRouter and NanoGPT have no preview name, so **The preview Jev** is not in the list for them. If you picked it on TypeSafe and then change host, the list shows **The latest Jev**, and the latest is what is sent. Change back to TypeSafe and the preview is picked again.

If a host renames Jev, pick **A name I type** and type the new name.

**Another address** does not use **Which Jev**. It has its own **Model name** box.

## Another address

Pick **Another address** for any host not in the list. Fill in two boxes:

1. **Address**: your host's full address for Jev. Paste the whole thing, not only the base. `https://example.com/v1` will not work. `https://example.com/v1/chat/completions` will.
2. **Model name**: what your host calls Jev, spelled the way its docs spell it.

Hosts take Jev in one of four ways, and the end of the address decides which:

- **Ending in `/chat/completions`**: the OpenAI chat format. The reply goes as the text of one user message, and the checks go with it.
- **Ending in `/responses`**: the OpenAI responses format. The same, laid out the way that format expects.
- **Ending in `/messages`**: the Claude format. The same again, with the key also sent in the header Claude-style hosts read.
- **Any other ending**: a decisions request, the same kind OpenRouter, NanoGPT and TypeSafe take.

Addresses known to work:

| Host | Address | Model name |
| --- | --- | --- |
| OpenRouter | `https://openrouter.ai/api/alpha/decisions` | `typesafe/jev-1.13` or `~typesafe/jev-latest` |
| NanoGPT | `https://nano-gpt.com/api/v1/decisions` | `typesafe/jev-1.13` or `typesafe/jev-latest` |
| TypeSafe | `https://api.typesafe.ai/v1/systemone` | `jev-1.13.0` or `jev-latest` |

NanoGPT also takes Jev at `/api/v1/chat/completions`, `/api/v1/responses` and `/api/v1/messages` on the same host. It serves Jev on `nano-gpt.com`, not `api.nano-gpt.com`.

OpenRouter, NanoGPT and TypeSafe are in the list already, so only use their rows here if you need a different model name. Press **Test** after filling the boxes in: it says whether Jev answered, and which Jev.

Every answer says which exact Jev gave it. The Log shows it next to each decision, for example "Jev (jev-1.13.0) says leave it".

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

It goes from 1 to 99. The two ends are left out because each one makes Jev a cost with no use:

- At 100, a check would have to score exactly 100%. Jev almost never does, so nearly every reply would be left alone, and each one would still cost a Jev call. To stop refining, switch automatic refining off.
- At 0, every check always reaches the line, so every reply is refined. That is the same as one model, with a Jev call added. To refine every reply, pick one model.

**Also check for worn-out phrases** adds one more check: whether the reply uses a phrase this chat has worn out. The list is the one `{{overused}}` fills in, so it only has anything in it while **Find phrases this chat has worn out** is on, on the Prompt tab. The reply being judged is not counted in that list, only the ones before it.

### Putting the built-in checks back

If you make a mistake in **What Jev checks**, press **Use the built-in checks** under the box.

- It asks first, because what you wrote is not kept.
- It only changes the checks. The host, the key, the threshold and the number of models stay as they are.

## When Jev is asked

Always on the automatic pass.

A refine you start yourself goes straight to the refine model by default. That covers:

- **Refine the latest reply**.
- The button on a message.
- **Refine every reply here**.

Pressing one is you deciding the replies need a refine, so Jev is not asked and nothing is sent to it.

**Let Jev check refines you start yourself** changes that. On, Jev reads each reply first, the same as on the automatic pass:

- If a check reaches your line, the reply is refined.
- If none does, the reply is left alone, and the Log and the **What Jev decided** card say so.
- With **Refine every reply here**, Jev reads the replies one at a time, and only the ones it picks out are refined.
- Each reply Jev reads costs one Jev call, as well as the refine when there is one.

Two things are never sent to Jev, whichever way the switch is set:

- A selection, since it is part of a reply and the checks are about the whole reply.
- Your own messages, since the checks are about the character's replies.

Jev is asked after **Seconds between automatic refines**, when that is set, and the panel says "Jev is reading the reply" while it does. **Stop** works while it is reading.

## Passing on what Jev found

Jev works out which of your checks a reply matches. The refine model can be given that list, so it starts from the problems Jev found.

To turn it on:

1. Go to the **Prompt** tab, on **For replies**.
2. Switch on the block called **What Jev Found**. Both built-in prompts for replies have it, switched off.

If your prompt is your own, add a block with `{{jev_found}}` in it instead. The **One model or two** card says when no block is taking what Jev finds.

What the refine model is given:

- A short lead-in. It says another model scored the passage against checks you wrote, and that each check is a lead, not an order. Where a check does not fit the passage, the model is told to leave that part alone.
- Each check that reached your line, strongest first, with its score, like `- reply repeats itself. (91%)`.

The block is empty, and left out of the prompt, whenever Jev did not read the reply or could not decide. That includes one model, a selection, and a button refine with **Let Jev check refines you start yourself** off.

Jev can be wrong, which is why the lead-in calls the checks leads. Your other rules still apply as they are.

To see that it was sent:

- **The Log** says "what Jev found went to the refine model", with how many checks, on each refine that sent it.
- **Show me the request** on the **Context** tab does not show it. A preview never asks Jev, so the block is empty there and left out. The card says so.

## Having Jev check the rewrite

**Have Jev check the rewrite**, in **One model or two**, is off by default. On, Jev also reads what the refine model wrote:

- If no check reaches your line, the rewrite is saved.
- If a check still does, the reply is refined once more, starting from the rewrite. **What Jev Found** then holds what Jev found in the rewrite.
- It happens once. The second rewrite is saved without another check.
- With several passes set up, the second refine runs every pass again, so it costs as many calls as the first.
- If the second refine is turned down, for example as too long, the first rewrite is saved and the Log says why.
- If Jev cannot read the rewrite, the rewrite is saved.

It only happens on a refine Jev read first. A refine that skipped Jev is not checked afterwards either.

While it runs, the panel says "Jev is reading the rewrite", then "Refining once more" if a check reached the line. **Stop** works at both points, and nothing is saved.

## When Jev cannot answer

The reply is refined, the same as with one model. No key, a refused key, an account with no credit, a host that is down or an answer with nothing usable in it all end this way, and the Log says which. The beta failing costs you a refine you might not have needed, never a refine you did.

## Reading what it decided

**What Jev decided**, on the Log tab, shows the last reply Jev read. It is there while two models are on.

- Whether the reply was refined or left alone, or why Jev could not decide.
- Each check with its percentage and a bar. A mark on each bar shows your line. A check that reached it is in bold.
- Which Jev answered, and what the answer cost.
- A count since the page opened: how many replies Jev read, how many it left alone, and so how many refines you did not pay for. Use it to see whether two models are saving you anything.
- With **Have Jev check the rewrite** on, a read of a rewrite shows here too, marked **rewrite kept** or **refined again**. It is counted apart from the replies, as rewrites read and how many were sent back.
- **Clear** empties the card and the count. It is kept only until you close the tab, like the Log.

Every answer also goes in the Log as one line:

```
Jev (jev-1.13.0) says leave it: reply repeats a word, a phrase or a sentence shape inside itself 12%; ...
Jev (jev-1.13.0) says refine: ... uses stock phrases that turn up in many stories 71%; ...
```

A reply Jev left alone also says so where a refine that stood down would, with the highest percentage it gave. If Jev is letting through replies you would have refined, lower the line or add the check it is missing. If it refines replies that were fine, raise the line or drop the check that keeps firing.

### Reading a test

**Test** puts its answer in the same card, marked **test**. A test is not a reply from your chat, so it is not added to the count.

- The question is always the same: the text "The door is open." and the check "The door in text is open." The door is open, so a score near 100% is right.
- The address the test went to, the format it was sent in, and the model name it asked for.
- Which Jev answered.
- What the host said it cost. If the host reported no cost, the card says so.
- If the test failed, why, and where it was sent. Use this to check an address or model name you typed.

The key is never shown.

## What it costs

Jev is billed by the host you picked, not by your refine provider. Each reply the automatic pass reaches is one call to Jev, and so is each press of **Test**.

With **Have Jev check the rewrite** on, each refine costs one more Jev call. A reply refined once more also costs a second refine from your refine provider, one call per pass. Where the host reports the cost of a call, the Log and the card show it.

A test is very small, so its cost can be a tiny part of a cent. A host's own billing page may round it to nothing.

## Privacy

What goes to Jev, and where the key is kept, is on the [Privacy](privacy.md#jev) page.

---

[Back to the README](../README.md)
