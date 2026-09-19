# Settings

Auto Refine lives in a tab in Lumiverse's sidebar drawer, not behind a settings window. Open it from the drawer, or find it with `Ctrl+K`. It is not in the Extras menu and there is no settings window: the drawer is the one place it lives.

It is a tab, not a window, on purpose. This is something you keep open and glance at while you write: what the last refine did to your prose, and a way to disagree with it, sitting where you are already looking.

**Your settings follow your account, not this browser.** They are written to Lumiverse under your account and read back on load, so opening a different browser, or a different machine, finds the setup you left. This browser keeps a copy as a cache, which is what draws the panel instantly and what carries on working if the account cannot be reached. On a server with several accounts on it, each account's settings and presets are stored separately and one cannot read another's. If a save to your account fails, the panel says so, so settings never look saved when they are not.

**There is no Save button.** A tab has no moment where it closes, so a "nothing sticks until you press Save" contract would have nothing to hang on. Everything saves as you change it. That is safe here because almost nothing on the tab is destructive on its own: a block is only text until a reply arrives, and the switches that make something happen are switches, which is the control people expect to act at once. The two that do throw something away, deleting a preset and starting again, ask first.

## Finding a setting

The search box above the tabs looks across every one of them, not just the one you are standing on. A setting you cannot remember the home of is exactly the one you are searching for. Matches are grouped by the tab they live on, folds are opened so nothing hides from it, and the tab strip steps out of the way while a search is running.

## Above the tabs

Three things never move, whichever tab you left open, because they are what you came for.

- **The switch** is the master switch. Off, nothing is refined and no model call is made, by any path.
- **Refine the latest reply** does one, now. While one is running, both buttons are replaced by **Stop this refine**, so calling one off never depends on the floating button being switched on. **Refine every reply here**, beside it, goes through a chat you already have, oldest first, one model call each, and asks before it starts. **every reply, automatically** is the automatic pass, off by default. The greeting is never included by any of them, and neither are your own messages unless you press the button on one.
- **Refines you can put back** shows what changed, with **Put it back** next to each one. Every refine in this chat is in there, newest first, not just the most recent: a second refine used to take away the way back from the first without saying so. The tab carries a badge with the count.

## Prompt

- **Your prompt** is the whole request, block by block. Rename them, reorder them, switch them off, change the role each is sent as, write your own. **Expand** opens one in an editor the size of the screen, and does not focus the box, so no keyboard jumps up on a phone. In [How the prompt is built](prompt.md).
- **Macros you can use** is the list of what a block can carry, with a tap to copy each one and a **?** beside it for what it becomes, the same **?** every other row on the panel uses.
- **Presets** save how a refine reads under a name, and can name a model setup to load with them. Four are built in and work as they stand, and the menu offers the two for the list you are editing rather than all four, in [Presets](prompt.md#presets).

## Context

- **How much it is told** is the message count, whether the run-up names who said each line, and the two token budgets, for the run-up and the lorebook. In [How much it is told](prompt.md#how-much-it-is-told).
- **See what gets sent** builds the real request and shows it to you, message by message, without calling a model. **Raw** shows the same thing as the JSON that goes over the wire, and **Expand** opens either at the size of the screen.

## Model

- **Refine using** picks which model does the refining. The list is your own connection profiles, by name. Leave it on the default to use whatever you are chatting with.
- **Let it think first** is off by default, and can be left at whatever your connection is set to, or given an effort level of its own. In [How much thinking it does](prompt.md#how-much-thinking-it-does).
- **Give up waiting after** cancels a refine that has not come back. The default is four minutes, the most is an hour, and 0 means never give up.

  Four minutes is the slow end on purpose. A fast model answers in seconds and never reaches it, so all the number really decides is how long you wait before being told a refine that was never coming back has been given up on. A reasoning model on a high effort level can think for minutes before it writes anything, and a local model can spend that long loading, and a cap that fires mid-thought throws away work that was about to arrive.

  Turning it off does not leave you stuck, since **Stop this refine** is always there and a backend that is not running says so within a few seconds.
- **Input price, per million tokens** and **Output price, per million tokens** are your provider's own prices, copied off its price list, which is where those two words come from: input is what you send, output is what the model writes back. Nothing here knows what a model charges and no two providers agree, so this is the only way the panel can turn a token count into money. Both start at 0, which leaves every cost line off; fill in one and the line says which half it is pricing. There is no currency anywhere: the number you type is the number you are shown, in whatever your provider bills you in. In [What a refine costs](prompt.md#what-a-refine-costs).
- **Samplers** are blank to begin with, and blank means the connection's own preset decides. In [Sampler settings](prompt.md#sampler-settings).
- **Saved model setups** keeps everything on this tab under a name: the connection, the thinking, the wait, the samplers and the two prices. Save one for a cheap model and one for a careful one, and move between them in a tap. The prices travel with the rest because they belong to the model: a setup that swapped the model and left the old prices standing would put a figure on the panel that was true of neither. A setup you saved before the price boxes existed carries none, and loading it leaves the ones you have alone.

  Your prompt is not in one, so loading a setup changes what runs the refine and nothing about how it reads. That is the point of keeping the two apart.

  They are kept in this browser and in your account. A setup carries a connection id, which a preset refuses to: presets go into files people share, and an id names nothing on somebody else's account. A preset can still point at a setup by name, so the two load together. A setup whose connection you have since deleted says so on the card rather than leaving the refine pointed at nothing.

## Limits

- **Extra reasoning tag names** folds away under **Keep the reply's own reasoning out of the refine**, and **Patterns of your own to hide** folds away under the markup switch. Both are lists of text most people never open, and a search reaches inside a fold anyway. The common wrappers are already known: think, thinking, thought, thoughts, reasoning, reflection, scratchpad and analysis. Add a name only if your model uses an unusual one. This is worth getting right, because working that is not recognised is handed to the refiner as prose, rewritten, and saved over the reply.
- **Hide markup from the model**, **Hide plain italic and bold too** and the two switches that keep reasoning out of the way keep a rewrite away from what is not prose, in [Protecting what is not prose](prompt.md#protecting-what-is-not-prose).
- **Reading the answer** is its own card. **Take the answer from between the tags** is what makes a model's preamble harmless instead of fatal, in [The answer it asks for](prompt.md#the-answer-it-asks-for). Asking for the tags is your prompt's job; this decides what is done with the answer.
- **Say how much has come back** streams the refine so the line under the switch can count what has arrived rather than sitting on one word for a minute. The answer is judged when it is complete either way, so this changes nothing about what gets saved, and a connection that cannot stream falls back on its own.
- **Longest a rewrite may get** and **Shortest a rewrite may get** are the two length limits, in [What it refuses to save](guardrails.md).
- **Refuse an answer that declines the job**, **Refuse an answer that talks about the edit** and **Refuse a rewrite that sanitised the reply** are the three checks on what an answer says, each with a switch of its own. The last compares the rewrite against the original and has its own threshold and word list under it. Switching all three off is said out loud, because a refusal written by the model could then be saved over your reply.
- **Refine something that has been refined before** decides whether the same words go through twice. Off by default, so each passage is refined once. It covers everything: the automatic pass, every button, and your own messages. Swiping, regenerating, deleting a swipe or editing puts different words behind the message, and those are a passage nothing has seen, so they are refined either way. Turn it on and pressing refine on a reply still holding its refine sends it again. Two announcements of one generation are still one reply whichever way this sits, so a build that reports a reply as finished twice cannot get it refined twice.

  Off means "still holding the refine it was given", not "has an id we have seen". A reply you swiped, regenerated, deleted a swipe from or edited is holding different words, and different words are a reply this pass has never seen, so it is refined whichever way this sits. That is what keeps it working alongside [Auto Retry](https://github.com/starlitcode/Lumiverse-Auto-Retry): every reply Auto Retry re-rolls is a new one, and each gets its refine. On, the same reply is refined again even when nothing about it changed.
- **Wait out a provider that will not take the call** waits and asks again when the provider answers "too many requests", is overloaded, or is a local server still loading a model, twice by default. A refused call cost nothing, so this buys the refine you asked for rather than a second one. It never waits on a wrong key or a prompt too long for the model. Where the provider says how long to wait, that is what it waits. See [Waiting out a provider that will not take the call](guardrails.md#waiting-out-a-provider-that-will-not-take-the-call).
- **Ask again when a check fails** retries a refine that failed one of the checks a second try could fix, 0 times by default.
- **Add the refine as a swipe instead of writing over the reply** is off by default. On, the rewrite goes in beside the reply as another swipe and the original stays one swipe back. That is worth knowing about because it is the only way back that survives a reload: **Keep what a refine replaced** is held in memory and is gone when you close the tab, while a swipe is Lumiverse's own, with the arrows already on the message. **Put it back** then takes the swipe off again rather than writing over it, and refuses where you have swiped another one since, because cutting the end off a list you have been working in is not an undo. A build that does not give a message swipes writes over the reply as before.

  Under it is **Your next / swipe button**, which works the way **Where the input box is** does: a box of CSS selectors, separated by commas and tried in the order you write them, with **Test**, **Use the built-in list**, and every selector listed under the box with the one in use highlighted. Emptying the box falls back to the built-in list.

  It is only needed if a Lumiverse update renames the arrows on a message. The refine is written into the message either way, and Lumiverse is told that new swipe is the one to show. Where a build draws it on its own, nothing here is pressed and the box never matters. Where a build leaves the old reply on screen instead, the arrow is pressed for you so the refine is what you are looking at, and that is the press this box aims. It is pressed once, and only while the writing the refine replaced is still on screen, because that same arrow asks for a fresh reply when there is no swipe ahead of it.

- **Keep what a refine replaced** holds the original so you can put it back.
- **Ask before saving a refine** holds every refine until you say. Both versions appear in a **Waiting for you** card at the top of the tab, with **Accept it** and **Turn it down**, and the tab carries a badge until you answer. Where Lumiverse can draw one, the same question also opens as a window; answering either settles both. The floating button's menu can answer it too, though a tap on the button only opens the tab, since accepting a rewrite of your writing on a stray tap is the one thing it must not do.
- **Your own messages** are refined only when you press a button on one, and never by the automatic pass. They get their own prompt, under **For your messages** on the Prompt tab, so tidying your own line does not turn it into the narrator's. It arrives written and runs as it stands; edit it and yours runs instead.

## Log

- **Right now** is the live view. It names the stage instead of just saying busy: asking, thinking, writing with a character count when your connection streams, then checking. The clock runs, and past eight seconds it also says how long is left before the timeout gives up. It writes into the line in place, so the panel never repaints under you, and the dot beside it pulses while something is running.
  Under the counters it says what the last refine actually put through the model, tokens of input and tokens of output, and what that cost once you have set prices. That is the real figure rather than the one a preview worked out beforehand. It covers the whole refine, so a rewrite that was dropped is on it, and so is every extra ask **Ask again when a check fails** made: the calls were paid for whether or not anything was saved.
- **What the model worked out** keeps the working from the last refine that finished, whether that was a reply or the draft in your input box, and says which. It has a **Copy**, an **Expand** that opens it at the size of the screen, and a **Clear**.

  It reads as prose: the tags the model wrapped it in are taken off here and everywhere else, so the working reads the same wherever you see it.

  Only a refine that finished replaces it, so stopping one leaves the last lot alone. A prompt that does not ask the model for its working has none to keep, and the card says so.
- **What it has been doing** is the running list, newest first.
- **Reporting a problem** copies everything somebody would otherwise have to ask you for. **What it carries** decides which parts go in: your settings, the shape of your prompt, the counts, the recent log, where you are, and your browser. What your blocks actually say is never in it, only their names, roles and macros, so it is safe to paste in public. **Read and edit it first** opens the whole thing so you can take out anything you would rather not post before it is copied.

  The first two lines are always there and cannot be ticked off. They name the version the panel is running and the version the server side is running. Those are usually the same. They differ when you update while a tab is open and have not reloaded that tab since, and a report that says so saves the first round of questions.

## Setup

- **This chat** leaves one chat completely alone while every other chat carries on. It is written down in your browser, so it survives a reload, and it is a list of chat ids and nothing else.

  A **temporary chat**, the scratch conversation with no character card on it, is told apart from an ordinary one and the card says so. The switch works there for as long as the chat is open, but it is not written down: the chat is discarded on the way out and the next one carries a different id, so a remembered entry could never match anything again. It would sit in storage looking like a setting and doing nothing. A chat whose card could not be read at all is not a temporary chat, and is not treated as one.
- **When a refine finishes** is how you find out.

  **Show the before and after on screen** puts a card on the page itself, not in this tab: what the reply said before, what it says now, and a button to put it back. On by default, because a refine changes writing you were reading, so the change is shown on the page instead of only in this tab.

  **Read them side by side** sits above every before and after there is: the card on the page, the **Put it back** card on the tab, and each pass under **What each pass changed** on the Log tab. It puts the original in one column and the rewrite in the other. Each column reads as the whole text it stands for, and each keeps its own marks, so what was taken out is on the left and what was put in is on the right. **Read them together** goes back to one text with the changes coloured where they happened.

  Pressing it changes every before and after on screen at once, and the view you were last on is the one the next card opens on. On a narrow screen the two columns stack one above the other rather than squeeze.

  **Show a brief message** is the one-line note at the edge of the screen. A sound is off by default, and with nothing attached it is a short built-in blip made in the browser, so there is no file to include.

  Closing the card loses nothing: every refine stays under **The last refine** here until you dismiss it.
- **Ways to reach it** are four optional ways in, all off by default.

  **A floating button** puts a round button over the chat. One tap refines the latest reply, and that is the only thing a tap does. It needs the interface panels permission.

  The button carries the extension's mark, which is an eye. It is shut while nothing is running. A refine opens it and sets it reading: the pupil crosses from one side to the other at the pace of somebody scanning a line, snaps back to the start the way your eye does at the end of one, and blinks on the way back. The button itself pulses gently underneath, so it is visible as working from across the screen, at a glance that is too quick to read an eye by. That is often the only part of the extension on screen, so it says what is happening rather than only that something is.

  A refine that finishes closes the eye on one long blink. One you stop closes it quickly and without the blink, since a blink is what an eye does when it has read something. While it refines a selection the button shows the mark for that. Taking a selection out never changes it, since that is over the moment you press it.

  Holding the button fills a ring around its edge, which closes a moment before the menu opens. Letting go early wipes it back. A press also dips the button a little: a dip on its own is a tap, a dip with the ring running is a hold. Auto Retry's floating button does the same.

  Asking your device for less movement leaves the eye open and still and draws no ring. The hold still opens the menu and the tooltip still says when a refine is running.

  Holding it, or right clicking, opens Lumiverse's own menu. That menu carries the tab, refining every reply in the chat, stopping one that is running, an undo when there is one, refining your draft when that is switched on, a way to hide the button, and the master switch.

  Drag it where you want it and that is where it stays, including after you change its size, which it grows around its own middle. Where you leave it is kept in the browser rather than in your settings, so it does not travel in an export.

  The button keeps its own mark whatever has just happened. A refine that landed used to turn it into an arrow, which put a control over your chat that you had not asked for and took the extension's mark off the screen; the way back is a line in the menu instead. Refining the latest reply is not in that menu, because that is what the tap does.

  The automatic pass and the per chat switch stay on the tab rather than in that menu, so their explanations are next to them instead of appearing as bare labels over the chat.

  **Refining part of a reply** is not a setting and has nothing to switch on. Select part of a reply and **Refine the part I selected** appears on the panel, in the chat input's Extras menu, and in the floating button's menu while that button is on screen. The two buttons in the chat carry it as well when they are switched on, which is covered further down. It rewrites what you picked and leaves the rest of the reply alone. It is only there while something is selected. A selection that runs out of italics takes the whole italic run with it, because leaving one marker behind would turn the rest of the reply into emphasis. It works in your own messages as well as in replies, and it uses the prompt for your own writing when it does.

  **Refining the draft in your input box** is the other way in, off by default because it writes into the box you are typing in. On, a **Refine what I am typing** button joins the other two above the tabs, and an entry for it appears in the chat input's Extras menu, or in the floating button's menu while that button is on screen. It greys out alongside the other two when no chat is open, since there is no input box out there to read, and the menu entry comes off on the same terms.

  A refine of your draft asks the chat for nothing, so it works in a chat the panel is still working out, and outside a chat entirely. Switching Auto Refine off, here or everywhere, still stops it.

  **A button in the chat's row of controls** goes in Lumiverse's own row of chat buttons, in the place the app leaves there for extensions. One tap refines the latest reply, the same as a tap on the floating button.

  **A button on every message** refines that message in one tap. It is the only way to refine a message that is not the latest without selecting all of it first, and it works on your own messages as well as on replies. On the greeting it says the greeting is never refined, which is true of every other way in too.

  It stands in Lumiverse's own row of message buttons, beside Copy, Edit and the rest. Every display mode draws that row somewhere, and it goes in whichever one is there. A display mode that draws no row at all gets it under the message instead, centred, which is where Lumiverse would have put the row.

  A message open for editing carries no button. Lumiverse takes its row of actions away while the editor is up, and what the button would work on is the reply as it stands saved rather than the words being typed over it. It comes back with the rest of the row when you close the editor.

  How it looks is not decided here. Both of these buttons take their appearance from the button standing next to them: the same classes, so the same size, spacing, colour, hover and focus. That means a theme reaches them, and so does CSS you wrote yourself. A rule you write for Lumiverse's own buttons applies to these without knowing they exist.

  Both of these buttons sit where Lumiverse puts its own, so an update that moves its controls carries these along with them rather than leaving them behind.

  Both of these turn into a stop while a refine is running. The first tap starts it, the next one calls it off, and the button names itself **Stop this refine** while it works.

  Select text inside a message and two more appear:

  - **Refine the part I selected** rewrites the selection and leaves the rest of the message alone. It is the same thing the panel and the menus offer, without opening either.
  - **Take out what I selected** deletes the selection. No model is asked anything, so it costs nothing and happens straight away.

  Where they appear follows the two switches above them. With **A button on every message** on they appear under the message holding the selection, and on no other message. With **A button in the chat's row of controls** on they appear in the toolbar as well, since the toolbar belongs to the chat rather than to one message. Either switch on its own is enough, and with both on you get both sets.

  In either place, the button that starts a plain refine steps aside while something is selected, so what you are offered is what to do with the text you picked. It comes back when you put the selection down, and the other messages keep theirs.

  Both actions are also in the chat input's Extras menu, and in the floating button's menu while that button is on screen, so neither needs a button in the chat switched on at all.

  Both go away when you put the selection down, and they follow the selection if you make a new one in another message.

  Taking text out closes the gap the way you would: one space between the two halves rather than two, no space left sitting in front of a full stop, and a whole paragraph out leaves one blank line rather than two. Nothing else in the message is touched.

  Selecting the whole message and pressing it is refused rather than leaving you with an empty message. **Put it back** undoes a snip exactly as it undoes a refine.

  Neither page says where on screen either button lands, because that is not this extension's to decide. A theme is CSS and can put anything anywhere.

  It shows itself the way a reply's refine does: the button turns while it runs, **Stop this refine** ends it, a card lands with the before and after on it, and the working goes to the Log. **Your draft, refined** then stands at the top of the tab, carrying what changed, **Put it back**, **Dismiss** and **Read it in full**.

  The floating button offers your draft back the same way it offers a reply back. Both stop offering once you have typed over the rewrite, since putting it back then would throw away the newer writing.

  Finding that input box is the one thing this extension reads Lumiverse's own layout for. It works from a built-in list that needs nothing set, and **Where the input box is** on the Setup tab is there for the day an update moves the box.

Those last two live in one place at a time. While the floating button is on screen, its menu holds anything that would otherwise be a row in the chat input's Extras menu. With the button off, or refused because the permission is not granted, or on a Lumiverse too old to draw a menu, the rows come back to Extras, which is the only way to reach them on a phone. Only one of the two carries them at a time, so a menu opened for something else stays short.
- **Where the input box is** points **Refine what I am typing** at a box that a Lumiverse update has moved. Nothing here needs setting until that happens.

  **The selectors it looks under** holds the list itself, so you can read what is being tried and edit it in place. Separate them with commas. They are tried in the order you write them.

  Emptying the box does not switch anything off. It falls back to the built-in list.

  Under the box, every selector is listed in the order it is tried. The one finding the box is highlighted. The rest are shown plainly, so you can see where yours sits in the order.

  A selector the browser cannot read is marked in red. **Test** covers the box as a whole, and a box with one typo and four good selectors still passes, so the mark goes on the line instead.

  **Test** reads the page at the moment you press it. It says one of:

  - the box was found, and can be typed into
  - something was found, but it cannot be typed into right now
  - nothing on the page matches
  - that is not a selector the browser can read
  - the box is empty, so only the built-in list is used

  It reads the page when pressed rather than on a timer, so the answer is never left over from earlier.

  **Use the built-in list** puts the box back. It is also its own part in the export, import and reset lists, so putting your selectors back does not take the buttons and switches with them.

- **Your whole setup** exports to a file, imports one back, and puts things back to their defaults. All three work in the same list of parts: your prompt, context, model, samplers, limits, alerts, buttons, switches, presets and the chats you switched off. **What goes in the file**, **What to take from a file** and **What to put back** each have their own choice, so you can export only your prompt, take only somebody's samplers, or start your prompt again without losing your connection. In [Import and export](prompt.md#import-and-export) and [Starting again](prompt.md#starting-again).

---

[Back to the README](../README.md)
