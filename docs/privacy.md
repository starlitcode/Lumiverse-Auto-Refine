# Privacy

## What leaves your machine

One thing: the model call that does the refining. It carries the text of the single message being refined and the rules you wrote, and it goes through Lumiverse to the provider you already configured, on the connection you picked.

Nothing else from your chat goes with it. Not the other messages, not your character card, not your settings. The refine sees one message at a time and no history, which is also why it cannot continue the scene.

The extension has no networking of its own. It never opens a connection and never contacts a server of mine or anyone else's, which you can confirm by searching the two source files for `fetch(`, `XMLHttpRequest`, `WebSocket`, `sendBeacon` or `EventSource` and finding nothing.

## The three permissions

- **`generation`** runs the refine. Without it the extension does nothing at all, and says so.
- **`chat_mutation`** saves the result over the message. Refuse it and refining still runs but nothing can be written, so nothing changes.
- **`chats`** answers which chat you are looking at, so the per-chat switch and the buttons act on the right one. Refuse it and the extension falls back to the last chat it saw a reply in.

The tab it lives in costs nothing. Drawer tabs are open to every extension, so there is no permission behind the whole of the interface.

## What it keeps

Your settings, in your browser and in Lumiverse's per-user storage so they follow your account.

The list of chats you switched it off in, in your browser. Chat ids and nothing else: no titles, no text.

The text from before each refine, in memory, so you can put a refine back. It is never written to disk and is gone on reload. That is on purpose: an undo is worth having, and keeping your writing in storage to provide one is not a fair trade for it.

## What it never does

It never refines the greeting. It never sends more than the one message being refined. It never keeps a copy of a reply after the refine finishes. It never writes to a message other than the one it refined.
