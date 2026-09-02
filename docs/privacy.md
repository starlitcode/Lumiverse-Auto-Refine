# Privacy

## What leaves your machine

One thing: the model call that does the refining. It goes through Lumiverse to the provider you already configured, on the connection you picked.

What it carries is the list of blocks you can see under **How the prompt is built**, and nothing else:

- the message being refined
- the rules and structure rules you wrote
- the character card for this chat, if the block is on and the permission is granted
- the last few messages of the chat, if the block is on, trimmed to a ceiling
- the fixed instruction that makes it an edit rather than another turn
- any block of your own text that you added

The panel is the honest list. A block switched off is not sent, **Messages of run-up to send** set to zero sends no history, and switching off **Who the character is** sends no card. Nothing in that request is chosen anywhere you cannot see.

Your settings themselves are never sent. Neither is anything from a chat you are not in.

The extension has no networking of its own. It never opens a connection and never contacts a server of mine or anyone else's, which you can confirm by searching the two source files for `fetch(`, `XMLHttpRequest`, `WebSocket`, `sendBeacon` or `EventSource` and finding nothing.

## The four permissions

- **`generation`** runs the refine. Without it the extension does nothing at all, and says so.
- **`chat_mutation`** saves the result over the message. Refuse it and refining still runs but nothing can be written, so nothing changes.
- **`chats`** answers which chat you are looking at, so the per-chat switch and the buttons act on the right one, and which card the chat belongs to. Refuse it and the extension falls back to the last chat it saw a reply in, and sends no card.
- **`characters`** reads that card, so a rewrite knows who is speaking rather than smoothing every voice into the same one. Refuse it and refining carries on with the card block left out.

The last two are the ones that read rather than write, and they are the reason a rewrite sounds like the character. Refusing either costs you quality, not the feature.

The tab it lives in costs nothing. Drawer tabs are open to every extension, so there is no permission behind the whole of the interface.

## What it keeps

Your settings, in your browser and in Lumiverse's per-user storage so they follow your account.

The list of chats you switched it off in, in your browser. Chat ids and nothing else: no titles, no text.

The text from before each refine, in memory, so you can put a refine back. It is never written to disk and is gone on reload. That is on purpose: an undo is worth having, and keeping your writing in storage to provide one is not a fair trade for it.

## What it never does

It never refines the greeting. It never sends anything the block list does not show. It never keeps a copy of a reply after the refine finishes. It never writes to a message other than the one it refined.
