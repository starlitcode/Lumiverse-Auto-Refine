# Two models

A beta. With one model, which is the default, every reply the automatic pass reaches is refined. With two, a second model reads each finished reply first and says whether it needs a refine, and the refine model runs only on the replies it picks out. Replies that were fine already stop costing a refine.

The second model is a small scoring model, called a decision model. It does not write text. It is handed the reply and a list of statements about it, and it answers each with the chance, from 0 to 100 percent, that the statement is true. That is the whole of what it can do, so it has nothing of its own to save over a reply.

Auto Refine asks it through one of your **Decision connections** in Lumiverse. Lumiverse keeps the connection's address and key, so Auto Refine never sees either.

## Setting it up

First, in Lumiverse:

1. Open the **Connections** panel.
2. Under **Decision models**, add a Decision connection. Pick the provider, paste its key, and pick a decision model.
3. To use it without picking it in Auto Refine, set it as your default Decision connection.

Then, on Auto Refine's Model tab, in **One model or two**:

1. Set **How many models** to two.
2. Under **Which Decision connection**, keep **Your default Decision connection**, or pick one of yours. The list shows each connection's name and model. The first choice names your default connection, and follows it if you change your default in Lumiverse.
3. Press **Test**. It asks one small question with nothing from any chat in it, and says whether an answer came back, and which model answered. The Log tab shows the test in full. See [Reading a test](#reading-a-test).

Two-model mode needs the **Decision models** permission. Lumiverse asks for it after updating to a version that uses it.

The card says what is wrong, if anything, under **Which Decision connection**:

- You have no Decision connections yet.
- None of them is the default, and none is picked.
- The one picked is gone.
- The one in use has no key saved.
- The permission is refused.
- This Lumiverse is too old to have Decision connections for extensions.

In each of these, every reply is refined, the same as with one model.

## Coming from an older version

Older versions reached the second model themselves, with a host, a model name and a key saved in Auto Refine. That is gone:

- The keys you saved for the second model are deleted from Lumiverse's secure store the first time this version loads your settings.
- Your host, model and address settings are dropped.
- Your checks, and every other setting on the card, are kept.
- **Refine when a check reaches** was kept per model. The line of the model you had picked is kept as the one line.

To go on using two models, add a Decision connection in Lumiverse for the model you used, as above.

## What the second model checks

**What the second model checks** holds one statement a line. Each is about `reply`, written with backticks, which is the name the reply goes by. The reply it reads is the reply without its thinking.

The ones it starts with:

```
`reply` uses the same phrase of three or more words twice within a few sentences.
`reply` starts three or more sentences in a row with the same word.
`reply` contains a stock phrase, such as "a breath she didn't know she was holding", "a shiver ran down his spine", "her heart hammered" or "a smile that didn't reach his eyes".
`reply` says what someone did not do or what something was not, then what they did or what it was, as in "it wasn't a request, it was a command" or "she didn't just leave, she ran".
`reply` follows an action with a comment that judges how it came out, as in "she laughed, and it came out thin" or "he said it, and it sounded wrong".
`reply` has a character start an action, then take it back, as in "reached out, then pulled back" or "opened her mouth, then closed it".
`reply` ends with a question to the user about what they do next, as in "What do you do?".
```

Each one has to be false of a clean reply. A reply is refined when any one check reaches the line, so a check that is true of almost every reply sends every reply through. For example, "repeats a word" is true of any reply that uses a name twice.

All but the first two match rules the built-in reply prompts carry, with the same examples. So a reply the second model sends through is one the refine has a rule for. Write your own to match what your prompt fixes. A check for something your prompt never touches refines replies for a reason the refine will not act on.

### More checks you can add

The fold **More checks you can add**, under **What the second model checks**, holds eight more checks. Each finds one more kind of stock writing:

- A feeling or a silence given weight or force.
- Something inside a character changing, with no name for what.
- A feeling put into the body as if it were an object.
- A smell or taste that nothing in the scene gives off.
- A sentence of narration that starts with "And yet" or "Everything changed".
- An ending that sums up the scene or states a lesson.
- Narration about how words or a silence were taken, before anyone acts.
- Three or more gestures shrunk with "small", "slight" or "faint".

What to know:

- None of them is sent until you add it. **Add them to the checks** puts the ones your box does not hold at the end of it. Pressed again, it adds nothing twice.
- Take out any you do not want, the same as any other check. **Use the built-in checks** puts the box back to the built-in list, without these.
- They are not in the built-in list, because some writing styles use these on purpose.
- Each one names something narrow, or needs a count, so ordinary prose and dialogue do not trip it.
- The built-in prompts have no rule for some of them. What the second model finds goes to the refine model in `{{checks_found}}`, so it knows what to fix.
- Each check is one more question in every call. Some providers take only so many in one call. If a reply fails to be read after you add them, take a few out.

### How the second model reads a check

The second model is not a chat model. It reads the meaning of a check, not only its words. But it scores whether the statement you wrote is true of the reply, and it does not stretch a check to cover what you meant. So a check that describes a different pattern from the one you have in mind scores low, even on a reply that has your pattern.

For example, a check that says "says what something was not before saying what it was, as in 'it wasn't a request, it was a command'" does not catch "The kettle didn't whistle. It screamed." That line is about what something did, not what it was. The statement in the check is false of it, so it scores low. The built-in check names both forms for this reason.

Write each check so that:

- **It names what is on the page.** "Contains a stock phrase, such as a shiver ran down his spine" works. "Is badly written" or "names a feeling the actions already show" asks for a judgment. Scores for a judgment change more from one reply to the next.
- **It gives examples, one for each form.** Examples show which pattern you mean. With one example, another form of the same habit can score low.
- **It asks about one thing.** A statement that joins two patterns with "and" or "or" is two checks. The second model scores the whole statement, so a reply with only one of the two can score low.
- **A high score means there is a problem.** Write each check so that "true" means the reply needs a refine. A check can be written as a statement or as a question. The built-in checks are statements.
- **It is false of a reply with nothing wrong in it.** A check that is true of most replies sends every reply to be refined.

To test a check, find a reply that has the problem and refine it with **Let it check refines you start yourself** on. The decision card on the Log tab shows the score for each check. If a reply you know has the problem scores low, add an example shaped like it.

**Refine when a check reaches** is the line. A reply is refined when any check reaches it. Lower refines more replies, higher refines fewer. It is 30 percent by default.

### Where the defaults come from

- The default comes from testing during the beta. It is a starting point, not a measured or correct value.
- Decision models are new, and their makers can change them. A model that changes can score differently.
- So the default can change in a later version, if testing finds one that works better.
- Models do not all score on the same scale. If you switch to another model, check your line again.

To find the line that suits you:

1. Turn on **Let it check refines you start yourself**.
2. Refine a few replies. Include some you know have a problem and some you know are fine.
3. Read the scores in the decision card on the Log tab.
4. If a reply you know has a problem scores under your line, lower the line.
5. If replies that were fine keep reaching your line, raise it.

The check from **Also check for worn-out phrases** is different. It asks whether the reply uses a phrase from a list, so a reply that does often scores well over 50%. The line matters most for the other checks.

It goes from 1 to 99. The two ends are left out because each one makes the second model a cost with no use:

- At 100, a check would have to score exactly 100%. That almost never happens, so nearly every reply would be left alone, and each one would still cost a call. To stop refining, switch automatic refining off.
- At 0, every check always reaches the line, so every reply is refined. That is the same as one model, with a call added. To refine every reply, pick one model.

**Also check for worn-out phrases** adds one more check: whether the reply uses a phrase this chat has worn out. The list is the one `{{overused}}` fills in, so it only has anything in it while **Find phrases this chat has worn out** is on, on the Prompt tab. The reply being judged is not counted in that list, only the ones before it.

The check it sends is in **How it asks**, under the switch. You can change it. Call the list `worn_phrases` and the reply `reply`, both in backticks. An empty box asks nothing about worn phrases. **Use the built-in checks** under it puts the built-in one back:

```
`reply` contains at least one phrase listed in `worn_phrases`.
```

### Comparing with the reply before it

By default the second model only reads the reply. It does not see the reply before it, so it cannot tell when a reply repeats the one before.

**Also compare with the reply before it** changes that. It is off by default. On:

- The last reply before this one is sent too, without its thinking. Your own messages are skipped.
- The checks in **What it compares**, the box under the switch, are asked as well.
- They use the same line as your other checks, under **Refine when a check reaches**.
- They are not asked when there is no reply before this one, such as on the first reply of a chat.
- With **Have it check the rewrite** on, the rewrite is compared with the same reply.

The ones it compares with:

```
`reply` has the same events happen in the same order as `previous_reply`, such as a character arriving, speaking, then turning away in both.
`reply` has a character say something they already said in `previous_reply`, in the same or other words, such as a threat or a promise made again.
`reply` describes the surroundings with details `previous_reply` already gave, such as the same light, smell or sound.
`reply` opens the same way as `previous_reply`, such as both starting on a character's face or on the weather.
`reply` ends the same way as `previous_reply`, such as both ending on a character waiting for an answer.
```

Each one is about repeating, with an example. A reply that carries the same scene on, in the same place, should stay under the line.

**What it compares** is yours to change. Write one check a line. Call this reply `reply` and the one before it `previous_reply`, both in backticks. An empty box asks none of them.

A check in **What the second model checks** can name `previous_reply` too. It is only asked while the switch is on and there is a reply before this one.

### Putting the built-in checks back

If you make a mistake in **What the second model checks** or **What it compares**, press **Use the built-in checks** under that box.

- It asks first, because what you wrote is not kept.
- It only changes the checks. The connection, the line and the number of models stay as they are.

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

It is asked after **Seconds between automatic refines**, when that is set, and the panel says, for example, "jev-latest is reading the reply" while it does. It is named by the model of the Decision connection in use. **Stop** works while it is reading, and calls the request off.

## Passing on what the checks found

The second model works out which of your checks a reply matches. The refine model can be given that list, so it starts from the problems found.

To turn it on:

1. Go to the **Prompt** tab, on **For replies**.
2. Switch on the block called **Checks Found**. Both built-in prompts for replies have it, switched off.

If your prompt is your own, add a block with `{{checks_found}}` in it instead. It is the one macro for this, whichever second model you pick. The **One model or two** card says when no block is taking what is found.

What the refine model is given:

- A short lead-in. It is the text in **What the refine model is told about the checks**, on the Model tab. You can change it, and **Use the built-in text** puts it back. In it, `{{second_model}}` becomes the name of the model that answered, and `{{checks_line}}` becomes your line. The built-in lead-in says another model scored the passage against checks you wrote, and that each check is a lead to check. Where a check does not fit the passage, the model is told to leave that part alone. An empty box sends the checks with no lead-in.
- Each check that reached your line, strongest first, with its score, like `- reply repeats itself. (91%)`. The backticks are taken out, and `previous_reply` is written as "the reply before it".

The block is empty, and left out of the prompt, whenever the second model did not read the reply or could not decide. That includes one model, a selection, and a button refine with **Let it check refines you start yourself** off.

The second model can be wrong, which is why the lead-in calls the checks leads. Your other rules still apply as they are.

To see that it was sent:

- **The Log** says, for example, "what jev-latest found went to the refine model", with how many checks, on each refine that sent it.
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

While it runs, the panel says, for example, "jev-latest is reading the rewrite", then "Refining once more" if a check reached the line. **Stop** works at both points, and nothing is saved.

## It can be wrong

The second model gives each check a chance, not a certain answer. It is a small model, and it makes mistakes:

- It can score a check low on a reply that has the problem. The reply is left alone.
- It can score a check high on a reply that is fine. The reply is refined when it did not need it.
- A score close to your line is the least certain. With a line of 30, a reply at 27% was nearly refined, and one at 33% was nearly left alone.

When a reply is left alone, the decision card on the Log tab says the second model can be wrong, and how to refine that reply anyway.

When it gets a reply wrong:

- Press the refine button on the message. With **Let it check refines you start yourself** off, which is the default, a refine you start goes straight to the refine model.
- If it keeps missing one kind of problem, add an example of that kind to the check. See [How the second model reads a check](#how-the-second-model-reads-a-check).
- If it lets too much through, lower **Refine when a check reaches**. If it refines too much, raise it.

The refine model is told the same. **Checks Found** calls each check a lead, and says to leave alone any part a check does not fit.

## When it cannot answer

The reply is refined, the same as with one model. This happens when there is no Decision connection to use, the permission is refused, the key is missing or refused, the account has no credit, the provider is down, it takes over 30 seconds, or the answer has nothing usable in it. The Log says which, with the provider's own message where Lumiverse passes one on. The beta failing costs you a refine you might not have needed, never a refine you did.

## Reading what it decided

The decision card, on the Log tab, shows the last reply the second model read. It is named after the model of the Decision connection in use, such as **What jev-latest decided**. It is there while two models are on.

- Whether the reply was refined or left alone, or why the model could not decide.
- Each check with its percentage and a bar. A mark on each bar shows your line. A check that reached it is in bold.
- Which model answered, and what the answer cost.
- A count since the page opened: how many replies were read, how many were left alone, and so how many refines you did not pay for. Use it to see whether two models are saving you anything.
- With **Have it check the rewrite** on, a read of a rewrite shows here too, marked **rewrite kept** or **refined again**. It is counted apart from the replies, as rewrites read and how many were sent back.
- **Clear** empties the card and the count. It is kept only until you close the tab, like the Log.

Every answer also goes in the Log as one line:

```
jev-latest (typesafe/jev-1.14) says leave it: reply uses the same phrase of three or more words twice within a few sentences. 12%; ...
jev-latest (typesafe/jev-1.14) says refine: reply contains a stock phrase, such as a shiver ran down his spine 71%; ...
```

A reply left alone also says so where a refine that stood down would, with the highest percentage given. If the second model is letting through replies you would have refined, lower the line or add the check it is missing. If it refines replies that were fine, raise the line or drop the check that keeps firing.

### Reading a test

**Test** puts its answer in the same card, marked **test**. A test is not a reply from your chat, so it is not added to the count.

- The question is always the same: the text "The door is open." and the check "The door in reply is open." The door is open, so a score near 100% is right.
- The Decision connection it went through.
- Which model answered.
- What the provider said it cost. If the provider reported no cost, the card says so.
- If the test failed, why.

## What it costs

The second model is billed by the provider of your Decision connection, not by your refine provider. Each reply the automatic pass reaches is one call, and so is each press of **Test**. **Also compare with the reply before it** makes each call longer, which costs more on a provider that charges for what is sent. Some decision models are free on some providers.

With **Have it check the rewrite** on, each refine costs one more call. A reply refined once more also costs a second refine from your refine provider, one call per pass. Where the provider reports the cost of a call, the Log and the card show it.

A test is very small, so its cost can be a tiny part of a cent. A provider's own billing page may round it to nothing.

## Privacy

What goes to the second model is on the [Privacy](privacy.md#the-second-model) page.

---

[Back to the README](../README.md)
