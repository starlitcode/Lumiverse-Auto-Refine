# Writing rules

The rules are the whole of what the model is told to do. Everything else in the extension is about deciding whether to keep what comes back.

## Write them as sentences

Plain instructions, one per line, the way you would tell a person:

```
Cut filler words: suddenly, just, really, very.
Keep paragraphs to four lines or under.
Never open a reply with the weather.
Do not start consecutive sentences with the same word.
```

The model is also told, before your rules, to keep the same events, the same speech and the same meaning, and not to continue the scene. That part is not yours to write and cannot be switched off: it is what separates a refine from another turn of roleplay.

## Structure rules are separate on purpose

**Structure and formatting rules** is a second box, and it holds a different kind of instruction: layout rather than wording.

```
Actions in asterisks, speech in double quotes.
One blank line between paragraphs, never two.
No headers, no bullet lists.
```

Keeping them apart matters more than it looks. Wording rules and layout rules pull against each other when they are mixed in one list, and a model handed a single pile obeys whichever it read last. Split, each one gets its own sentence in the prompt.

## Rules for a model that reasons

If you have turned **Let the model think first** on, the prompt gains one more line telling the model to think before it writes and to keep that thinking out of the answer. That happens on its own; you do not need a rule for it.

Whether to turn it on at all is a question about your rules. A rule like "cut filler words" needs no thought. A rule like "make the pacing match the tension of the scene" does. Most rule sets do not, which is why it is off by default.

## Trying them before turning anything on

**Try it on some text** in the panel runs one refine on whatever you paste, using the rules as they stand in the boxes rather than as they were last saved, and shows what comes back. Nothing goes near your chat.

This is worth doing before you switch automatic refining on. The alternative is finding out what a rule means by watching it rewrite a scene you liked.

## Rules that will not work

Anything that asks the model to write more. **Continue this scene**, **add a line of dialogue**, **describe the room in more detail**: these are asking for new writing, and the length limit will drop the result. That is not a bug in the limit. A refine that adds a paragraph is another turn of roleplay wearing a different name, and if that is what you want, ask for a reply rather than a refine.
