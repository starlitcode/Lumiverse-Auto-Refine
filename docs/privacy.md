# Privacy

## What leaves your machine

One thing: the model call that does the refining. It goes through Lumiverse to the provider you already configured, on the connection you picked.

What it carries is the list of blocks you can see under **How the prompt is built**, and nothing else:

- the message being refined
- the rules and structure rules you wrote
- the character card for this chat, if the block is on and the permission is granted
- the last few messages of the chat, if the block is on, trimmed to a ceiling
- the lorebook entries this chat has active, if the block is on, trimmed to a ceiling
- the fixed instruction that makes it an edit rather than another turn
- any block of your own text that you added

The panel is the honest list. A block switched off is not sent, **Messages of run-up to send** set to zero sends no history, and switching off **Who the character is** sends no card. Nothing in that request is chosen anywhere you cannot see.

Your settings themselves are never sent. Neither is anything from a chat you are not in.

The extension has no networking of its own. It never opens a connection and never contacts a server of mine or anyone else's, which you can confirm by searching the two source files for `fetch(`, `XMLHttpRequest`, `WebSocket`, `sendBeacon` or `EventSource` and finding nothing.

**Show me the request**, under Prompt, is the check on all of this. It builds the real request and shows it to you, message by message, without sending it anywhere.

## The six permissions

- **`generation`** runs the refine. Without it the extension does nothing at all, and says so.
- **`chat_mutation`** saves the result over the message. Refuse it and refining still runs but nothing can be written, so nothing changes.
- **`chats`** answers which chat you are looking at, so the per-chat switch and the buttons act on the right one, and which card the chat belongs to. Refuse it and the extension falls back to the last chat it saw a reply in, and sends no card.
- **`characters`** reads that card, so a rewrite knows who is speaking rather than smoothing every voice into the same one. Refuse it and refining carries on with the card block left out.

- **`world_books`** reads the lorebook entries the chat has active, so a rewrite does not contradict what the world has already established. Refuse it and refining carries on with the lore block left out.
- **`ui_panels`** is only for the floating button, which is off by default. Refuse it and everything works except that button, and the panel says so rather than the switch quietly doing nothing.

The three that read rather than write are why a rewrite sounds like the character rather than like generic prose. Refusing any of them costs you quality, not the feature.

## The one part that touches the page

**Refine what I am typing** reads and writes the chat input box directly, because Lumiverse has no API for it. It is off until you turn it on, it only ever reads the box you are typing in, and the text goes to the same place a refine goes: your provider, on your connection. It is not sent anywhere else and it is not saved to your chat, since you have not sent it yet.

The tab it lives in costs nothing. Drawer tabs are open to every extension, so there is no permission behind the whole of the interface.

## What it keeps

Your settings, in your browser and in Lumiverse's per-user storage so they follow your account.

The list of chats you switched it off in, in your browser. Chat ids and nothing else: no titles, no text.

Your presets, in your browser, under a key of their own so exporting your settings and keeping your presets are separate choices.

If you chose a sound of your own, that file, held with your settings as text. It never leaves your machine.

The text from before each refine, in memory, so you can put a refine back. It is never written to disk and is gone on reload. That is on purpose: an undo is worth having, and keeping your writing in storage to provide one is not a fair trade for it.

## What it never does

It never refines the greeting. It never sends anything the block list does not show. It never keeps a copy of a reply after the refine finishes. It never writes to a message other than the one it refined.
