# Changelog

Every released version of Auto Refine, newest first.

Versions follow [Semantic Versioning](https://semver.org). A new major version means a reinstall rather than an update, a minor version adds something, and a patch version only fixes things.

---

## 1.12.0

_2026-09-17_

### Added

- **Where the input box is**, a new card on the **Setup** tab. Refining a draft is the one thing here that reads Lumiverse's own layout, so a release that moves the input box stops that and nothing else. Until now the only fix was waiting for a new version.

  The box holds the list itself, so what is being tried can be read and edited in place. Separate the selectors with commas. They are tried in the order you write them, and emptying the box falls back to the list this shipped with.

  Every selector is listed under the box in the order it is tried. The one finding the box is highlighted, and the rest are shown plainly, so you can see where yours sits in the order.

  A selector the browser cannot read is marked in red. **Test** covers the box as a whole, and a box with one typo and four good selectors still passes, so the mark goes on the line instead.

  **Use the shipped list** puts the box back, and **Where the input box is** is its own part in the reset and transfer lists, so putting it back does not take the widget and the buttons with it.

- **Tap a running refine to stop it.** The buttons in the chat already turned into a spinner while one was working, and tapping the spinner did nothing but say a refine was already running.

  Now the first tap starts it and the next one calls it off. While it runs the button names itself **Stop this refine**, so a screen reader says the same thing the mark shows.

  This is the two buttons in the chat: the one in the toolbar and the one under a message. The panel and the floating button already had a stop of their own.

- **Two buttons for the part you selected**, on the message you selected it in.

  **Refine the part I selected** does what the panel entry of the same name does, without opening the panel.

  **Take out what I selected** deletes the selection. There is no model call, so it costs nothing and is as quick as pressing it.

  Both appear only while text is selected, and only on the message holding the selection, so neither is ever a button sitting there doing nothing. Both need **A button on each message** switched on, under **Ways to reach it**.

  Taking text out closes the gap the way a person would. One space between two halves rather than two, no space left in front of a full stop, and a paragraph taken out leaves one blank line rather than two. Nothing else in the message is touched.

  Selecting the whole message is refused rather than emptying it. **Put it back** works on a snip exactly as it works on a refine.

### Fixed

- **A connection that refuses one of the fields sent with a refine no longer stops the refine.** A strict OpenAI-compatible endpoint turns the whole request down over a single field it does not take, rather than ignoring it, and the panel showed a 400 that read like a fault in your rules. NVIDIA's build does this with the context size and the thinking setting.

  The refusal is read and the refine is asked again without the fields it named, once. Only fields that actually went out are dropped, so a message mentioning something the extension never sent changes nothing, and a second refusal is treated as real.

- **The tab strip no longer slides sideways under a finger.** It scrolled, and the padding put its contents a few pixels over the box, so a drag meant for the panel moved the tabs instead. It is one row now and does not scroll. On a narrow screen the tabs get narrower rather than the last one dropping to a second line.

### Changed

- **Typing in the search box no longer stalls between letters.** Every keystroke rebuilt the whole tab and then re-measured every line on it against your theme, which on the **Prompt** tab is about forty milliseconds a character. Typing one word cost nearly three tenths of a second of that, and it was felt as the field being slow to take letters.

  It waits for a gap in the typing now and repaints once. Measured on the **Prompt** tab: 42ms a keystroke before, under 1ms after.

- **The tabs share the row evenly.** Each was sized to its own label, so the gaps between them all differed and the selected one looked cramped next to the wide ones.

- **A clearer line when a refine is already running.** It said "Press it again to stop that one", which was only ever true of the panel's own button, and that button is replaced by **Stop this refine** while one runs. It now says to stop it first or wait for it to finish.

- **Plainer words in the shipped prompts and the panel.** A rewrite is returned rather than handed back, a last line sets up what comes next rather than reaching for it, a voice is short rather than clipped, and a refine finishes rather than lands. **When a refine lands** is **When a refine finishes**.

  Your own prompt is not touched. To take the new wording, load a shipped prompt from the **Prompt** tab.

## 1.11.0

_2026-09-15_

### Added

- **Four more reasoning formats are recognised, so the working inside them is no longer rewritten and saved over the reply.** Harmony, which gpt-oss writes, Gemma 4, Cohere Command A Reasoning, and Seed-OSS.

  None of these could be reached by adding a name under **Extra reasoning tag names**. The three wrappers already recognised are matched by tag name, with the same name closing the block. In all four of these the tag is not what names the reasoning: the word sits in the content, and the block closes on a different token again. Harmony has no closer of its own at all, and runs to the next control token.

  The `final` channel is the reply, not working, and is refined like any other passage. A pattern that had taken it would have deleted the answer rather than the reasoning in front of it.

  Adding a name to the list is still the answer for an unusual tag. These four are matched whatever is in that list, since their tag is not what names the reasoning.

- **The markers that open and close a turn are held back with the reasoning and put back around the rewrite.** A local backend can pass `<|turn>model`, `<turn|>`, `<|im_start|>`, `<|eot_id|>` and the rest through into the message text. They are not prose, and a refiner handed one either drops it or rewords it.

  This holds whether or not **Keep the reply's own reasoning out of the refine** is on. That switch governs the model's working, which is writing of a kind; a turn marker is not, and letting one through would leave the reply framed differently from the one Auto Retry reads.

- **The markers come off the refiner's answer whether or not the reasoning switches are on.** Both switches govern the model's working, which is writing of a kind. A turn marker is not, and one left in the answer is saved into your chat as text.

- **A hard line break in a rewrite survives.** Two spaces before a line break are a hard break in markdown. Tidying up after a marker was removed swept the whole answer, so a break the model meant to write was deleted on a rewrite that had no markers in it at all. The tidy now acts only where something actually came out.

- **A marker with no role after it keeps the first word of the reply.** The markers that name a speaker take the name with them, and a bare one sitting straight in front of the reply was taking the first word of it instead. That word is your writing.

- **A message that is nothing but the model working is refused rather than refined.** It has no prose in it to rewrite, and the refiner used to be handed an empty passage and asked to improve it.

### Fixed

- **A reasoning block sitting behind a turn marker was treated as prose.** The wrapper had to be the very first thing in the message, so one `<|turn>model` in front of it was enough to defeat every wrapper and every name in the list. This is the shape a local backend actually hands over.

- **The refiner's own working, when it answers in one of these formats, no longer reaches the chat.** It was already caught for the three tag-name wrappers and went through for the rest.

Cloud connections are unaffected by all of this. They hand reasoning back in a field of its own, so it never reaches the reply text and there has never been anything to cut off. This is what a local backend needs.

### Removed

- **Everything about prompt caching is gone from the panel and the pages.** The line under the block list that counted blocks below the passage, the paragraphs on the prompts page, and the clause on the cost note.

  The order the shipped prompts use has not changed and neither has anything the extension sends. What is gone is the commentary about it. The prompts page still says what the order is and why the shape of the answer sits at the bottom.

## 1.10.0

_2026-09-14_

### Added

- **The softening check now reads what the model put in, not only what it took out.** Counting the strong words that went missing only sees half of a toned-down rewrite. The other half is the word that arrives in their place: killed becomes unalived, blood becomes crimson liquid, sex becomes intimacy. A list of those pairs ships with the extension and is read on every refine.

  It only counts when **both halves happen**: the soft word is in the rewrite and was not in your reply, and the blunt word it stands in for was in your reply and is gone. Either on its own proves nothing, since a model can write eliminate about a possibility and a refine can drop the word kill while tightening a line. Needing both is what lets ordinary words like defeat, intimacy and shaft sit on the list without it firing all day.

  One confirmed swap is enough, with no fraction to clear. That is what this half is for: a reply whose only killed came back unalived was softened, and the counting check cannot see it, because one word going is below the floor it needs before it will speak.

  A refused rewrite is refused the same way as any other: your reply is left exactly as it was, and **Ask again when a check fails** covers it if you have that on.

- **Swaps of your own to watch**, under the same switch as the words. One per line as `soft => blunt`. An exported find-and-replace list pastes in as it stands, and a line with nothing on the right is skipped, since a deletion has no pair in it.

## 1.9.2

_2026-09-14_

### Fixed

- **Picking a preset loads it now, so a save can no longer land on the wrong one.** Picking one put its name in the name box and left your rules exactly as they were. The panel then showed one preset while the picker named another, and pressing **Update selected** wrote what was on screen over the preset you had just picked. The preset you overwrote was gone, with nothing to get it back from.

  Choosing one in the list loads it straight away. What you are looking at always matches what the picker says, which is what makes **Update selected** safe to press.

  **Put it back** appears beside the buttons after a pick has loaded over something. One press restores exactly what was there before, the picker included, so looking inside a preset cannot cost you work you had not saved yet. It only shows when there is something to put back.

  **Load** is now **Load it again**, since picking already loads. Its job is reloading the preset you are already on, which is how you throw away edits and get the saved wording back.

  The **Model setups** card had the same fault and got the same fix.

### Changed

- **The two chat buttons no longer say where on screen they end up.** Their names and descriptions said one goes at the end of Lumiverse's row of chat buttons and the other sits under the message text. Both were true of a stock Lumiverse, and neither is something this extension decides. A theme is CSS and can put anything anywhere, so anything naming a position is wrong for whoever moved it.

  **A button in the row above the input box** is now **A button in the chat's row of controls**, and **A button under every message** is now **A button on every message**. Both descriptions name the place the app hands the button and stop there.

  Only the wording changed. Neither button has moved, both are still where you left them on the Setup tab, and switching either on or off works exactly as it did.

## 1.9.1

_2026-09-13_

### Fixed

- **The description of A button under every message gave the wrong reason for where it sits.** It said Lumiverse leaves no room inside its own row of message buttons. That is not the reason. The button goes under the message text because that is where it is wanted, and [Settings](docs/settings.md) says the same now.

  Nothing about the button has changed. It is in the same place, and it works the same way.

- **A problem report now says which version each half of the extension is running.** Auto Refine is two files. Lumiverse loads one of them in your browser and runs the other on the server. Updating restarts the server side and leaves an open tab alone, so a tab you had open before the update goes on running the old panel against the new server side, until you reload it.

  The report only ever printed the panel's version and presented it as the version of the whole thing. It now prints both, and says plainly when they do not match. The Log says so too, as soon as it finds out.

  Nothing about this makes the halves agree. It makes a report that would have sent somebody looking in the wrong file say where to look instead.

## 1.9.0

_2026-09-13_

### Changed

- **The note about protected formatting has a block of its own now, called Protected Formatting.** It used to hang off the end of **How to Answer** with no tag around it, which made `{{protect_notes}}` the one macro in the list not sitting in one.

  A tag needs a block rather than a line. A block whose content comes out as nothing but tags is dropped before it is sent, and that macro is empty on any refine where nothing needed protecting, which is most of them. Left inside **How to Answer**, that check could never fire, because that block always has writing in it, so an empty pair would have gone out on every refine.

  It sits last, under **How to Answer**, which is where the macro already was. What a model is sent when protection does fire is what it was sent before, with the tag around it.

  It is not counted by the line about blocks below the passage, for the same reason the block carrying the reply around a part-refine is not: its macro answers to the passage, so it was never going to be reused.

A prompt you already have is yours and is not touched by this. To take the new arrangement, load a shipped prompt from the **Prompt** tab, which overwrites the list you are on. A prompt that still has the macro on the end of **How to Answer** goes on working exactly as it did.

## 1.8.1

_2026-09-13_

### Fixed

- **A setting's description is sized to the setting now, not to the screen.** Tapping a `?` opened a box capped at the width of the screen, and the tab is narrower than the screen on a phone, so the description came out wider than the panel and hung off the side of it. It is capped at the width of its own row instead, which lands it in the same column as the setting with the panel's own gutter either side.

  On a wider screen the row is wider than the cap the descriptions already had, so nothing about them changes there. Auto Retry had the same thing wrong with its descriptions and got the same fix.

## 1.8.0

_2026-09-13_

### Added

- **Two optional buttons that put a refine in the chat itself.** Both are under **Ways to reach it** on the Setup tab and both are off until you ask for them.

  **A button in the row above the input box** goes at the end of Lumiverse's own row of chat controls. One tap refines the latest reply.

  **A button under every message** refines that message. It is the only way to refine a message that is not the latest without selecting all of it first, and it works on your own messages as well as on replies.

  Both sit in the places Lumiverse hands out to extensions, which is the difference between these and the button on every message that came out in an earlier version: that one reached for a row by class name, and those names change whenever Lumiverse rebuilds its CSS. The message one sits under the message text, above the app's own row of buttons rather than among them.

### Changed

- **The shipped prompts no longer assume one character on each side.** A card can hold a cast and a chat can be a group, so **Your Character** is now **Your Characters** holding `<your_characters>`, and **The User's Character** is **The User's Characters** holding `<the_users_characters>`. Four lines inside the prompts said the other person where they meant anybody else in the scene: something hanging between two people, a hand finding the other's, eyes tracing the other's face, speech repeating back what the other person said. All of them read for any number of characters now.
- **One prompt still called you the other author.** That framing came out of the rest of them in 1.6.0 and this line was missed. A passage ending by pointing at what happens next is asking the user to do the work.

A prompt you already have is yours and is not touched by any of this. To take the new wording, load a shipped prompt from the **Prompt** tab, which overwrites the list you are on.

- **It says when the prompts that ship with it have changed.** One line on the **Prompt** tab, with a **Got it** that puts it away for good. Your own prompt is never touched by it and it never loads anything for you: loading a shipped prompt writes over the list you are on, so that stays your call.

  Only for somebody who has loaded one of the eight before. A prompt that is entirely your own is not affected by the shipped ones changing, so there is nothing to tell you. A fresh install is marked as up to date, so this release is quiet for everybody and the first thing it says is about the next change.

- **How to Answer is the last block now, and it goes out as you rather than as the setup.** It used to sit near the top with the rest of the rules. A rule about the shape of an answer is followed most closely when it is the last thing read: put it at the top and the model has the whole prompt between that rule and the answer, and some hand back a rewrite with the tags missing or wrapped around the wrong thing. That rule is also the one you cannot work around, since a rewrite without its tags is dropped rather than saved. The role is **User** because it is your instruction about what you want back rather than part of the setup, and it lands in the same message as the passage.

  It costs a little where prompts are cached, since it used to sit in the run that never changes and now sits under the part that changes every turn. It is a short block and the trade is the point. The line on the Prompt tab that counts blocks below the passage does not count this one, because every shipped prompt puts it there.

- **The tabs are a tray with the one you are on filled in.** They were a row of labels with a line under the selected one, which is the tab strip every panel has, and telling two of them apart at a glance is the one thing a tab strip has to do. The tab you are on is filled and its label is brighter; the rest are plain. Auto Retry marks its tabs the same way, so the two read as a pair. No label changes weight when you pick it, since a label that goes bold gets wider and shifts the row under the finger that just tapped it.

### Fixed

- **Dragging the tabs up and down moved them.** The titles shifted by a pixel and the line under the strip looked like it thickened. A strip that scrolls sideways scrolls up and down too unless it is told not to, and the tabs were pulled a pixel down over that line, so the strip was one pixel taller than it could show. Dragging scrolled that pixel and stacked the selected tab's underline onto the line. The line is gone with the redraw above, and the strip is locked to sideways now.
- **A token count Lumiverse called a guess was reported as a count.** It counts with a real tokeniser where it has one for the model and says so when it has none and fell back to characters over four. That flag was not read, so a guess came back through the panel as an exact figure, and every price on the Model tab is worked out from it. The flag is read now: a guess says roughly, the same as a build with no counter at all.
- **The `{{overused}}` macro never showed what it puts in.** The macro list described it and left you to run a refine to find out what the shape was. It now shows a line the way `{{protect_notes}}` shows its wording, and [How the prompt is built](docs/prompt.md) has the block as it arrives, counts and all.
- **Refining part of a reply was documented inside the floating button's paragraph.** It has three ways in and none of them is the floating button, so it has its own paragraph in [Settings](docs/settings.md) now, and the README says it exists.

## 1.7.0

_2026-09-12_

### Fixed

- **The run-up called you Co-author instead of using your character's name.** Every one of your messages in **See what gets sent** was labelled that way, while the character you are writing with got their name off the card. A job title is not anybody in the story, and a model reading it has to work out who is meant. Both sides are named now, so the run-up reads the way the chat page does. A chat with no persona set, or a build that will not resolve one, falls back to **You** rather than labelling a blank.

### Added

- **Name the speakers in the run-up**, on by default, under **Context**. The run-up goes out as one block of text, so the labels are the only thing separating your lines from the character's in it. A chat whose messages already begin with a name, which is what a group chat looks like, gets that name twice on every line, and switching this off sends the messages as they were written. It also skips the persona lookup, since the label is the only thing that reads it.

## 1.6.0

_2026-09-11_

### Fixed

- **The preview never said which of your two prompts it built.** There are two lists, one for replies and one for your own writing, and the preview builds whichever fits the message it is previewing. Loading a preset writes to one list and leaves the other alone, so loading a reply preset while your own message is the newest one built a preview of the list you had not touched, and it read as a preset that failed to load. It says which list it used now, and that a preset loaded into the other one will not show there. The backend had been working this out and sending it all along; nothing on the panel read it.

### Changed

- **Refining the same words twice is refused everywhere now, not only on the automatic pass.** The setting is **Refine something that has been refined before**, still off by default, and it covers the buttons and your own messages as well. Pressing refine on a reply still holding its refine used to go ahead and buy a second opinion on a passage nobody had changed. Swiping, regenerating, deleting a swipe or editing puts different words behind the message, and those are refined either way. The setting no longer hides itself when the automatic pass is off, because it applies whether or not that is running.
- **The phrase list the prompts cut from is half again as long.** It covered bodies and a few sentence shapes. It now covers feeling handed over in a container, faces and voices running stock business, the room doing the characters' work, pauses named instead of filled, and softened double negatives, alongside what it already had. Named as shapes wherever a shape catches more than an example does.
- **The Speech block knows about register.** Lines that announce themselves before arriving, lines that only grade what was just said, counselling talk from characters who do not counsel for a living, and a soft name dropped in to take the edge off. None of it touches how a character is allowed to sound: somebody who speaks badly goes on speaking badly, and a character who already talks that way keeps it.

- **The prompts that ship with it now name you and the user plainly.** They called the person writing with you your co-author, which put a word in the prompt that means nothing to a model and reads as a role it has to work out. The user is the user. Their character is **The User's Character**, yours is **Your Character**, and both are written with they and them throughout, so nothing in the prompt assumes a gender for either.
- **The rhetorical framing is gone.** Two prompts opened on a question asked for effect and four descriptions repeated it. A rule reads as a rule; the standard and the test say what they want outright now.
- **Every block is named after the tag it holds.** The block called The Job holds `<your_job>`, What to Cut holds `<what_to_cut>`, Copy These Exactly holds `<copy_these_exactly>`. Reading the Prompt tab and reading the prompt are now the same thing, rather than two sets of names to hold in your head.
- **The examples inside the prompts use they and them.** They were written with he and she, which reads as an instruction about who is in the scene.

## 1.5.0

_2026-09-11_

### Fixed

- **Refine what I am typing stayed lit on the home screen.** The two buttons beside it grey out when no chat is open, and this one did not, so the odd one out read as the one that still worked. There is no input box out there to read, so pressing it could only ever fail. It greys with the others now and its tooltip says why, and the entry in the floating button's menu comes off on the same terms.

### Changed

- **Every cost figure now says what it is worth.** A line under the price boxes on the Model tab, and only once a price is typed. The tokens are counted from the prompt this extension builds rather than taken from your provider, so their tokeniser may disagree and whatever they wrap around the prompt is missing from the figure. It also prices every token sent at the full rate, so on a model with prompt caching switched on a refine usually costs less than the panel says, sometimes a lot less.

## 1.4.0

_2026-09-11_

### Fixed

- **Exporting only your saved model setups was refused.** The check that decides whether a file would be empty never looked at the setups, so ticking that part on its own and nothing else said there was nothing to put in a file, with your setups sitting right there. It counts what is going in now, setups included. An empty list counts as nothing too, so ticking a part you have never saved anything under says so plainly instead of writing a file holding an empty list and reporting it as exported.

### Added

- **Import takes more than one file at a time.** Two files one after the other reported each on its own, so a pair carrying a preset each said one preset, twice, and left you adding them up. Picked together they are one import with one total. They go on in the order you picked them, so where two files name the same preset, setup or setting the last one is what stands, and a file that cannot be read stops the whole import and names which one rather than taking half.

## 1.3.0

_2026-09-11_

### Fixed

- **Picking a model setup for a prompt that ships with the extension said nothing about where the pick was going.** The eight shipped prompts are fixed, so **Update selected** is greyed out on them and there is nowhere to write the link. **Save as new** does write it, onto your copy, which is the way to do it, but nothing said that: the box took the pick and then switching the preset list put it back to what the next preset carried. The card now says the copy is what keeps it, and only while a shipped prompt is the one selected.
- **A name clash with a shipped prompt counted wrong.** Saving a preset under a name one of them already has is refused, and the refusal said there were two of them. There are eight.

### Added

- **A measurement mark is no longer read as somebody speaking.** Dialogue is left out of the worn phrase counting, and a straight quote after a digit, the kind in `the gap was 6" wide`, opened a line of dialogue that never closed. Every word after it in that reply was thrown away, so a habit sitting past one was never found. Curly quotes are read by their shape, which says which end they are without guessing.
- **A chain stops when the reply is on its way out.** A chain is several model calls with real time between them, so the window for Auto Retry to swipe the reply, or for you to press regenerate, is as many times wider as there are passes. It was only checked before the first pass and after the last, which meant a reply replaced during the second of six bought four more calls that were never going to be saved. Checked between one pass and the next now, and the Log says which pass it stopped after.
- **A chain runs at most six passes.** Each pass is a model call, so a list of fifty lines would have fired fifty calls off one button press, and the bill would have arrived before anybody noticed. Six is past any chain worth building.
- **The Log tab says what each pass of a chain changed.** One before and one after, with three calls somewhere between them, tells you a chain came out worse and never which link did it. **What each pass changed** on the Log tab is a fold holding every pass in order, what each was handed, what it gave back, and how much it changed the length. A chain turned down on its total reports them too, which is when they matter most: the refusal says which limit was hit and this says which pass hit it. Nothing is there for a single pass, which has nothing to break down.
- **The shipped prompts carry the two new macros.** A setting with nowhere to put its answer does nothing, and says nothing about why, so every prompt that ships with the extension now has a block for `{{overused}}` and one for `{{whole_reply}}`. Both are switched on, which costs nothing: each is empty until the thing that fills it happens, and a block whose macros came back empty leaves the prompt, tags and all. A prompt you saved before this version does not gain them, so switching **Find phrases this chat has worn out** on without a block for it now says so instead of filling nothing.
- **A pass can name a prompt that ships with the extension.** Those are a separate list from the presets you save, and a pass naming one resolved to nothing and was skipped without saying why. Yours still wins where the two share a name.
- **A refine can make several passes instead of one.** **How many passes a refine makes** on the Limits tab, set to one pass by default, which is what every refine did before this. Several walks a list of your saved presets in order, each pass handed what the one before it wrote, so cutting the filler and fixing the rhythm can be two prompts rather than one doing both. **The passes, in order** takes one preset name per line. A name matching nothing is skipped, and so is a preset with no block carrying `{{message}}`; with no usable line the Prompt tab's own list runs as a single pass. Each pass is judged against what it was given rather than against the reply, since a pass that tightens by a fifth has not shrunk the reply by a fifth, and the end of the chain is judged once more against the reply it started from, because three passes each tightening by a third leave a reply half its length with no single pass doing anything the limits object to. A refusal stops the chain where it happens. It costs one call per pass, and the Log adds them up.
- **This version's settings travel in an export, and so does the button's size.** Six of them did not: the passes, the mode, and the four for worn phrases. An export ran, a file came down, and the settings were quietly not in it, which turns restoring a backup on another device into finding out later. **How big it is** for the floating button was missing too, and had been for longer. A check holds every setting to it now, so one added later is either in a part or named as belonging to this screen.
- **The words your story is made of are not counted as a habit.** A place, a job, an institution, a thing the chat is about, all repeat because the chat is about them. The phrases are checked against your character card, and against your lorebook where a block was already asking for it, and anything written into the story is left out of the report. Telling somebody their own setting is a habit is telling them to stop writing their story.
- **Eight more shapes in the shipped prompts.** Shapes rather than particular phrases, because a model reaches for these whatever the scene is: a thing said by what it is not and then corrected, the same thing twice with the weaker one kept, three of anything in a row, a pause named instead of filled, actions strung onto one sentence with "as", a sound that escapes somebody, a sentence opened on a participle, and an action given and then graded.
- **It can find the phrases this chat has worn out.** A refine judges one reply at a time, so a phrase reads as fine every time it is met; used in eleven of the last fifteen replies it is the model's crutch, and nobody notices because nobody reads fifteen replies at once. **Find phrases this chat has worn out** on the Limits tab fills `{{overused}}` with them, so a block can name them and ask for something else. Counted across replies rather than within one, because five times in a single reply is that reply's choice. Dialogue is left out, since a character repeating a phrase is characterisation. So are your own messages, the character's name, runs of only common words, and anything in backticks. The longest phrase wins, so a finding is not also reported as the shorter runs inside it. **Phrases to leave alone** takes one per line for the times repetition is the point. It reads replies the refine already has, so it costs no extra call, and it ships off.
- **Refine part of a reply instead of all of it.** Select a sentence or a paragraph in a message, then press **Refine the part I selected**. It appears on the panel beside the other buttons, in the floating button's menu, and in the chat input's Extras menu on the same terms as the other rows there. The panel one is there whatever the button and the row are doing, so nobody who switched those off is shut out of it. The rest of the reply is left exactly as it was. The model is given the part and nothing else, so every check on the answer, its length included, is measured against the part rather than the reply around it. The entry is only in the menu while something is selected. Selecting inside your own message works too and uses your own prompt list, the same as pressing the button on one does, and the greeting is refused the same as ever. A selection that grew out of italics takes the whole italic run with it, since leaving one marker behind would turn the rest of the reply into emphasis.
- **The length limits leave room on a short passage.** **How much longer** and **how much shorter** are shares of what was sent, and a share of one sentence is a handful of characters: sixty per cent of "it was fine" is six, which turns down every rewrite of it that is not nearly the same length. Each limit now gives the share or a floor in characters, whichever is larger. A reply long enough for the share to matter is judged by the share exactly as before. The two floors are not the same number, because a short passage coming back longer is the rewrite working and one coming back much shorter is a model answering with a stub.
- **`{{whole_reply}}` shows the model what surrounds the part it was given.** The reply as it stands, with the part being rewritten wrapped in `<<<` and `>>>`, for a prompt that wants a fragment read in context. Empty on an ordinary refine, which leaves the block carrying it out of the prompt rather than sending an empty heading.

## 1.2.0

_2026-09-10_

### Fixed

- **Sizing the floating button sent it back to the corner it started in.** The host sets the size when the button is made, so changing it builds the button again, and the rebuild was handed a fixed spot near the top of the screen rather than wherever you had dragged it to. Where you put it is written down now and the rebuild starts from there. It grows around its middle as well, since the position a host is given is a top-left corner: carrying that across unchanged pins the corner and lets the button grow down and to the right, which against an edge is a jump to somewhere you never put it. [Auto Retry](https://github.com/starlitcode/Lumiverse-Auto-Retry) already worked this way, so the two behave the same. Where it sits is kept in the browser rather than in your settings, so it does not travel in an export or land on your phone at a position a phone has no room for.
- **The automatic pass could not refine anything on some installs.** A reply finishing said which chat and which message and never which account, and a Lumiverse installed for an operator refuses a model call that names no account. So every automatic refine came back saying Lumiverse could not tell whose it was, while the buttons carried on working, because pressing one says who pressed it. The panel hands its account over with its settings, and that is the account the automatic pass now runs as. On a server with several accounts it is whichever panel loaded last, the same as the rules themselves.
- **The spinner could turn forever after a run through a chat.** A reply refined inside a run sends its own ending and that stopped the spinner; a reply the run left alone sends nothing, because the run counts those itself. So a run whose last reply was left alone finished with the panel still marked busy, and with **Give up waiting after** set to 0 there was no timer left to notice. The run's own ending stops it now, and with the wait switched off the panel stops waiting at an hour rather than never, which is the ceiling every other setting is already held to.
- **The panel said the backend was not answering when it was.** It turns the spinner on the moment a reply lands rather than waiting for this extension to answer, so a turn does not open with a second of nothing. Several ways out of the automatic pass returned in silence, and five seconds later the panel reported a backend that was not installed and counted a refine it never made as turned down. Every way out says so now, in words, on the Log tab.
- **A run through a chat gave up partway through itself.** The timer that gives up on a refine was armed once at the first reply and covered the whole run, so on a long chat it came due while the run was working.
- **Put it back could write over the wrong swipe.** The text from before a refine is the only copy there is, and it went back into the message whatever the message was holding by then. A reply swiped, regenerated or edited since the refine keeps what it has, the row comes off the tab, and it says why.
- **Ask before saving a refine could save a rewrite of the swipe before it.** The card waits for a yes, and a reply swiped while it waited had the rewrite of the old one written over the new one. The save is refused if the reply moved while the card was up.
- **Not every row under a switch faded in and out.** Four were built only while their switch was on, so switching it rebuilt the panel around them and they arrived between two frames: the sound rows, **Refine what I am typing**, and the two folds under the protection switches. All four are built either way and hidden now, the same as every other row.
- **A line on the Log tab rebuilt the whole panel.** A run through a chat writes a line per reply, which was forty rebuilds of every box on the tab, back to back, while somebody watched it.
- **A block switched off still cost what it would have cost switched on.** The lorebook, the chat memory and the run-up are each a call to Lumiverse, and all three were made on every refine whether or not any block being sent asked for them. A macro nobody is going to see is a call nobody has to make.

### Added

- **`{{memories}}` puts what Lumiverse remembers of the chat into the prompt.** Everything from further back than the run-up, and Lumiverse's own answer rather than one assembled here: the same pieces it would have retrieved, as many as your chat memory settings ask for, written out with your own header and chunk templates. Every shipped prompt carries it in a block of its own, **What has happened before now**, under the setting and above the pages before this one. That block ships switched off, because its size is decided by your chat memory settings rather than by anything on the Prompt tab and it would be sent on every refine; switch it on there when you want it. It needs no new permission, and a chat with memory switched off or nothing vectorised sends no block at all rather than an empty heading.
- **Refine a reply that has been refined before**, off by default, on the Limits tab under the automatic pass. Off means "still holding the refine it was given", not "has an id this pass has seen": a reply you swiped, regenerated, deleted a swipe from or edited is holding different words, and different words are a reply the pass has never seen, so it is refined either way. That is what keeps the pass working alongside [Auto Retry](https://github.com/starlitcode/Lumiverse-Auto-Retry), since every reply Auto Retry re-rolls is a new one. On, the same reply goes through again even when nothing about it changed. Either way a build that announces one generation twice buys one refine, not two, and pressing a button always refines what you pressed it on.
- **It waits out a provider that will not take the call.** A "too many requests", a shared key at its limit, or a local server answering 503 while it loads a model is not a bad answer, because there was no answer and nothing was spent. **Wait out a provider that will not take the call** on the Limits tab does this twice by default, waiting longer each time, and where the provider says how long to wait, that is what it waits. It never waits on a wrong key or a prompt too long for the model, since waiting cannot fix either. The status line counts down while it waits, and Stop ends the wait as well as the call.
- **Add the refine as a reroll instead of writing over the reply**, on the Limits tab, off by default. On, the rewrite goes in beside the reply as another reroll and the original stays one swipe back. That is Lumiverse's own way back, it survives a reload, and the arrows for it are already on the message, where **Put it back** is held in memory and gone the moment you close the tab. **Put it back** then takes that reroll off again rather than writing the original over it, and it refuses where you have rolled another one since. A build that does not give a message rerolls writes over the reply as before.
- **A ceiling on how many times the automatic pass will refine one reply**, at twelve. A swipe, a regenerate or an edit is new writing and is refined, which is the point above. What that cannot see is a loop: another extension rewriting what this one wrote, or a build announcing the same generation under new ids. Twelve is far past anything anyone does by hand, so it is a stop on something going wrong rather than a budget. Pressing the button still refines it, and the Log says why the pass stopped.
- **Blocks fold shut on the Prompt tab.** A caret on each one, and **Fold them all** for the list. A folded block is its switch and its name, so a prompt of twenty is a list you can read at once rather than twenty text boxes to scroll past. Which are folded is remembered, and it is not part of a preset: it is where you were looking, not part of the request.
- **A row that hangs off a switch closes rather than vanishing.** The same movement a deleted block makes, so the panel below travels instead of jumping by the row's whole height in one frame.

### Changed

- **Nothing is refined while the next reply is being written.** Auto Retry swiping a refusal, or you pressing regenerate, means the reply in front of it is on its way out. The pass stands down before the call where it can, and refuses to save where the call was already out.
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
