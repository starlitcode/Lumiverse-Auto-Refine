# Two models

A beta. With one model, which is the default, every reply the automatic pass reaches is refined. With two, a second model reads each finished reply first and says whether it needs a refine, and the refine model runs only on the replies it picks out. Replies that were fine already stop costing a refine.

The second model is a small scoring model. It does not write text. It is handed the reply and a list of statements about it, and it answers each with the chance, from 0 to 100 percent, that the statement is true. That is the whole of what it can do, so it has nothing of its own to save over a reply.

There are two to pick from:

| Model | Made by | Cost | What is it? |
| --- | --- | --- | --- |
| **Jev** | TypeSafe | Paid, per call | [Introducing Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev) |
| **Span** | Respan | Span-01 Lite is free. Span-01 is paid. | [Introducing Span-01](https://www.respan.ai/blog/introducing-span-1) |

Both answer the same checks, and everything on this page works the same for both, unless a section says it is for one of them. The same links are on the Model tab, as **What is Jev?** and **What is Span?**.

## Setting it up

Everything is on the Model tab, in **One model or two**.

1. Set **How many models** to two.
2. Pick **Which second model**: Jev or Span.
3. Pick **Where it is reached**. The list only shows hosts that serve the model you picked. **Another address** is for any other host. See [Another address](#another-address).
4. Pick which version. For Jev, see [Which Jev](#which-jev). For Span, see [Which Span](#which-span).
5. Paste a key from that host under the key box and press **Save key**. The box is called **Jev key** or **Span key**, after the model you picked. The key has to come from the host you picked.
6. Press **Test**. It asks one small question with nothing from any chat in it, and says whether an answer came back, and which model answered. The Log tab shows the test in full. See [Reading a test](#reading-a-test).

Two-model mode also needs the `cors_proxy` permission, since the second model is not a chat model and no connection profile can reach it. Without it the panel says so and every reply is refined, the same as with one model.

There is one key box, whichever model you pick. If you change model or host, save a key from the new host.

## Which Jev

**Which Jev** shows when Jev is picked. It has these choices:

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

## Which Span

**Which Span** shows when Span is picked. It has these choices:

- **Span-01 Lite, free**, the default. It costs nothing.
- **Span-01 Lite, paid**, only on OpenRouter. The same model as the free one, on OpenRouter's paid tier.
- **Span-01**, the full model. It is paid.

The name each host is sent:

| Host | Span-01 Lite, free | Span-01 Lite, paid | Span-01 |
| --- | --- | --- | --- |
| OpenRouter | `respan/span-01-lite:free` | `respan/span-01-lite` | `respan/span-01` |
| Respan | `span-01-free` | not offered | `span-01-pro` |

Respan has no paid Lite, so it is not in the list for Respan. If you picked it on OpenRouter and then change to Respan, the free one is sent.

Span reads a conversation, not named fields. **On OpenRouter** it takes the same kind of request as Jev, with the reply sent as a conversation. **On Respan's own API** the request is a scores request. The panel does this for you on both:

- The reply is sent as the assistant's turn of a conversation.
- The word `reply` in backticks is written out as "the reply" in each check. On Respan's own API, each check is sent as a behavior.
- With **Also compare with the reply before it** on, that reply is sent as the turn before, and `previous_reply` is written out as "the previous reply". See [Comparing with the reply before it](#comparing-with-the-reply-before-it).
- A key for Respan's own API comes from your Respan account, at [platform.respan.ai](https://platform.respan.ai).
- Respan's own API only scores once Respan has switched Span-01 on for your account. Until then, **Test** says "Span turned the call down (403: Span-01 scoring is not enabled for your organization...)". Ask Respan for access, or pick OpenRouter as the host, which needs no access request.
- Respan answers each behavior with three chances: present, absent, and not enough to judge. The chance it is present is the score.

## Another address

Pick **Another address** for any host not in the list. It works for Jev and for Span. Fill in two boxes:

1. **Address**: your host's full address for the model. Paste the whole thing, not only the base. `https://example.com/v1` will not work. `https://example.com/v1/chat/completions` will.
2. **Model name**: what your host calls the model, spelled the way its docs spell it.

Hosts take a scoring model in one of five ways, and the end of the address decides which:

- **Ending in `/chat/completions`**: the OpenAI chat format. The reply goes as the text of one user message, and the checks go with it.
- **Ending in `/responses`**: the OpenAI responses format. The same, laid out the way that format expects.
- **Ending in `/messages`**: the Claude format. The same again, with the key also sent in the header Claude-style hosts read.
- **Ending in `/scores`**: the scores format that Respan's own API takes. See [Which Span](#which-span).
- **Any other ending**: a decisions request, the same kind OpenRouter, NanoGPT and TypeSafe take.

Addresses known to work:

| Host | Address | Model name |
| --- | --- | --- |
| OpenRouter | `https://openrouter.ai/api/alpha/decisions` | `typesafe/jev-1.13`, `~typesafe/jev-latest`, `respan/span-01-lite:free`, `respan/span-01-lite` or `respan/span-01` |
| NanoGPT | `https://nano-gpt.com/api/v1/decisions` | `typesafe/jev-1.13` or `typesafe/jev-latest` |
| TypeSafe | `https://api.typesafe.ai/v1/systemone` | `jev-1.13.0` or `jev-latest` |
| Respan | `https://api.respan.ai/api/v1/scores` | `span-01-free` or `span-01-pro` |

NanoGPT also takes Jev at `/api/v1/chat/completions`, `/api/v1/responses` and `/api/v1/messages` on the same host. It serves Jev on `nano-gpt.com`, not `api.nano-gpt.com`.

The hosts in this table are in the list already, so only use their rows here if you need a different model name. Press **Test** after filling the boxes in: it says whether the model answered, and which one.

Every answer says which exact model gave it. The Log shows it next to each decision, for example "Jev (jev-1.13.0) says leave it".

## What the second model checks

**What the second model checks** holds one statement a line. Each is about `reply`, written with backticks, which is the name the reply goes by. The reply it reads is the reply without its thinking.

The ones it starts with:

```
`reply` repeats the same phrase close together, or starts three or more sentences in a row the same way.
`reply` uses a stock phrase, such as a held breath or a shiver down a spine.
`reply` names a character's feeling when their actions already show it.
`reply` piles up adjectives or strained comparisons.
`reply` says what something was not before saying what it was, as in "it wasn't a request, it was a command".
`reply` ends by turning to the user with a question, such as what they do next.
```

Each one has to be false of a clean reply. A reply is refined when any one check reaches the line, so a check that is true of almost every reply sends every reply through. For example, "repeats a word" is true of any reply that uses a name twice. The last two match rules the built-in reply prompts carry, so a reply the second model sends through is one the refine has a rule for.

Write them to match what your prompt fixes. A check for something your prompt never touches refines replies for a reason the refine will not act on.

The second model answers these best when each one:

- asks about one thing. A statement joined with "and" is two checks.
- names something that shows on the page, rather than a judgement of the whole reply.
- is plainly true or false of the text, so a reader could check it without guessing at intent.
- is false of a reply with nothing wrong in it. Give an example or two, so a common phrase is not read as a stock one.

**Refine when a check reaches** is the line, 50 percent by default. A reply is refined when any check reaches it. Lower refines more replies, higher refines fewer.

It goes from 1 to 99. The two ends are left out because each one makes the second model a cost with no use:

- At 100, a check would have to score exactly 100%. That almost never happens, so nearly every reply would be left alone, and each one would still cost a call. To stop refining, switch automatic refining off.
- At 0, every check always reaches the line, so every reply is refined. That is the same as one model, with a call added. To refine every reply, pick one model.

**Also check for worn-out phrases** adds one more check: whether the reply uses a phrase this chat has worn out. The list is the one `{{overused}}` fills in, so it only has anything in it while **Find phrases this chat has worn out** is on, on the Prompt tab. The reply being judged is not counted in that list, only the ones before it.

### Comparing with the reply before it

By default the second model only reads the reply. It does not see the reply before it, so it cannot tell when a reply repeats the one before.

**Also compare with the reply before it** changes that. It is off by default. On:

- The last reply before this one is sent too, without its thinking. Your own messages are skipped.
- Three checks are added for you. You do not need to write them:

```
`reply` repeats the beats of `previous_reply`: the same actions and events, in the same order.
`reply` has the characters speak in the same order as `previous_reply`.
`reply` describes the surroundings again with the same details `previous_reply` already gave.
```

- They use the same line as your own checks, under **Refine when a check reaches**.
- They are not asked when there is no reply before this one, such as on the first reply of a chat.
- With **Have it check the rewrite** on, the rewrite is compared with the same reply.

Each one is about repeating. A reply that carries the same scene on, in the same place, should not reach the line.

You can also write your own checks about it. Name it `previous_reply`, with backticks, the same way `reply` names the reply. For example:

```
`reply` opens the same way as `previous_reply`.
```

A check of your own that names `previous_reply` is only asked while the switch is on and there is a reply before this one.

### Putting the built-in checks back

If you make a mistake in **What the second model checks**, press **Use the built-in checks** under the box.

- It asks first, because what you wrote is not kept.
- It only changes the checks. The model, the host, the key, the threshold and the number of models stay as they are.

## When it is asked

Always on the automatic pass.

A refine you start yourself goes straight to the refine model by default. That covers:

- **Refine the latest reply**.
- The button on a message.
- **Refine every reply here**.

Pressing one is you deciding the replies need a refine, so the second model is not asked and nothing is sent to it.

**Let it check refines you start yourself** changes that. On, the second model reads each reply first, the same as on the automatic pass:

- If a check reaches your line, the reply is refined.
- If none does, the reply is left alone, and the Log and the decision card say so.
- With **Refine every reply here**, the replies are read one at a time, and only the ones picked out are refined.
- Each reply read costs one call, as well as the refine when there is one.

Two things are never sent to the second model, whichever way the switch is set:

- A selection, since it is part of a reply and the checks are about the whole reply.
- Your own messages, since the checks are about the character's replies.

It is asked after **Seconds between automatic refines**, when that is set, and the panel says, for example, "Span is reading the reply" while it does. **Stop** works while it is reading.

## Passing on what the checks found

The second model works out which of your checks a reply matches. The refine model can be given that list, so it starts from the problems found.

To turn it on:

1. Go to the **Prompt** tab, on **For replies**.
2. Switch on the block called **Checks Found**. Both built-in prompts for replies have it, switched off.

If your prompt is your own, add a block with `{{checks_found}}` in it instead. It is the one macro for this, whichever second model you pick. The **One model or two** card says when no block is taking what is found.

What the refine model is given:

- A short lead-in, with the name of the second model you picked. It says another model scored the passage against checks you wrote, and that each check is a lead to check. Where a check does not fit the passage, the model is told to leave that part alone.
- Each check that reached your line, strongest first, with its score, like `- reply repeats itself. (91%)`. The backticks are taken out, and `previous_reply` is written as "the reply before it".

The block is empty, and left out of the prompt, whenever the second model did not read the reply or could not decide. That includes one model, a selection, and a button refine with **Let it check refines you start yourself** off.

The second model can be wrong, which is why the lead-in calls the checks leads. Your other rules still apply as they are.

To see that it was sent:

- **The Log** says, for example, "what Span found went to the refine model", with how many checks, on each refine that sent it.
- **Show me the request** on the **Context** tab does not show it. A preview never asks the second model, so the block is empty there and left out. The card says so.

## Having it check the rewrite

**Have it check the rewrite**, in **One model or two**, is off by default. On, the second model also reads what the refine model wrote:

- If no check reaches your line, the rewrite is saved.
- If a check still does, the reply is refined once more, starting from the rewrite. **Checks Found** then holds what was found in the rewrite.
- It happens once. The second rewrite is saved without another check.
- With several passes set up, the second refine runs every pass again, so it costs as many calls as the first.
- If the second refine is turned down, for example as too long, the first rewrite is saved and the Log says why.
- If the second model cannot read the rewrite, the rewrite is saved.

It only happens on a refine the second model read first. A refine that skipped it is not checked afterwards either.

While it runs, the panel says, for example, "Jev is reading the rewrite", then "Refining once more" if a check reached the line. **Stop** works at both points, and nothing is saved.

## When it cannot answer

The reply is refined, the same as with one model. This happens when the key is missing or refused, the account has no credit, the host is down, or the answer has nothing usable in it. The Log says which. When the host refuses the call, it also gives the status the host sent and the host's own message. The beta failing costs you a refine you might not have needed, never a refine you did.

## Reading what it decided

The decision card, on the Log tab, shows the last reply the second model read. It is called **What Jev decided** or **What Span decided**, after the model you picked. It is there while two models are on.

- Whether the reply was refined or left alone, or why the model could not decide.
- Each check with its percentage and a bar. A mark on each bar shows your line. A check that reached it is in bold.
- Which model answered, and what the answer cost.
- A count since the page opened: how many replies were read, how many were left alone, and so how many refines you did not pay for. Use it to see whether two models are saving you anything.
- With **Have it check the rewrite** on, a read of a rewrite shows here too, marked **rewrite kept** or **refined again**. It is counted apart from the replies, as rewrites read and how many were sent back.
- **Clear** empties the card and the count. It is kept only until you close the tab, like the Log.

Every answer also goes in the Log as one line:

```
Jev (jev-1.13.0) says leave it: reply repeats the same phrase close together, or starts three or more sentences in a row the same way 12%; ...
Span (span-01-free) says refine: ... uses a stock phrase, such as a held breath or a shiver down a spine 71%; ...
```

A reply left alone also says so where a refine that stood down would, with the highest percentage given. If the second model is letting through replies you would have refined, lower the line or add the check it is missing. If it refines replies that were fine, raise the line or drop the check that keeps firing.

### Reading a test

**Test** puts its answer in the same card, marked **test**. A test is not a reply from your chat, so it is not added to the count.

- The question is always the same: the text "The door is open." and the check "The door in reply is open." The door is open, so a score near 100% is right.
- The address the test went to, the format it was sent in, and the model name it asked for.
- Which model answered.
- What the host said it cost. If the host reported no cost, the card says so.
- If the test failed, why, and where it was sent. Use this to check an address or model name you typed.

The key is never shown.

## What it costs

The second model is billed by the host you picked, not by your refine provider. Each reply the automatic pass reaches is one call, and so is each press of **Test**. **Also compare with the reply before it** makes each call longer, which costs more on a host that charges for what is sent. Span-01 Lite, free costs nothing.

With **Have it check the rewrite** on, each refine costs one more call. A reply refined once more also costs a second refine from your refine provider, one call per pass. Where the host reports the cost of a call, the Log and the card show it.

A test is very small, so its cost can be a tiny part of a cent. A host's own billing page may round it to nothing.

## Privacy

What goes to the second model, and where the key is kept, is on the [Privacy](privacy.md#the-second-model) page.

---

[Back to the README](../README.md)
