# Settings

Open the panel from the **Auto Refine** button in the chat input's Extras menu, or from the floating button's menu if you have that on.

Only **Save** keeps what you changed. Closing the panel puts everything back, so you can try things freely.

## Basics

- **Turn Auto Refine on** is the master switch. Off, nothing is refined and no model call is made, by any path.
- **Refine every reply as it arrives** is the automatic pass, off by default. On, each finished reply is refined and the result saved. The greeting is never included.
- **Also refine your own messages** lets the button refine something you wrote, keeping your voice rather than the character's. The automatic pass never touches your messages whatever this says.
- **Show a 'refine this reply' button** adds the on-demand button to the Extras menu.
- **Floating on/off button** puts a small round button over the chat.
- **Show a pop-up when a reply is refined** is on by default.
- **Show the on-screen panel** adds a small panel with the last twenty things it did and why. It is the quickest way to see what a rule is actually doing.

## The rules it follows

Covered in [Writing rules](rules.md).

## How the pass runs

Starts shut, because the defaults are already the cheap answer.

- **Refine using this connection** picks which model does the refining. The list is your own connection profiles, by name. Leave it on the default to use whatever you are chatting with.
- **Let the model think first** is off by default.
- **Give up waiting after** cancels a refine that has not come back. The default is 90 seconds. A hung call is cancelled rather than left running.
- **Longest a rewrite may get** and **Shortest a rewrite may get** are the two length limits, in [What it refuses to save](guardrails.md).
- **Keep what a refine replaced** holds the original so you can put it back.
- **Ask before saving a refine** shows you both versions and waits for a yes.

## This chat

At the bottom of the panel, **Turn off here** leaves one chat completely alone while every other chat carries on. It is written down in your browser, so it survives a reload, and it is a list of chat ids and nothing else.
