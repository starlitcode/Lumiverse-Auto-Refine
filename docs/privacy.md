# Privacy

## What leaves your machine

With one model, which is the default, only one thing: the model call that does the refining. It goes through Lumiverse to the provider you set up, on the connection you picked.

With two models there is a second call, to the second model you picked. See [The second model](#the-second-model) below.

The refine call carries the blocks you see under **How the prompt is built**, and nothing else:

- the message being refined
- the rules you wrote
- the character card, if that block is on and the `characters` permission is granted
- the last few messages of the chat, if that block is on, cut to a size limit
- the lorebook entries this chat has active, if that block is on and the `world_books` permission is granted, cut to a size limit
- what Lumiverse remembers of the chat, if that block is on and the `chats` permission is granted
- any block you wrote yourself

The panel shows what is sent:

- A block that is switched off is not sent.
- **Messages of run-up to send** set to 0 sends no chat history.
- Switching off the **Cast Sheet** block sends no card.
- **Show me the request**, on the Context tab, builds the request a refine would send and shows it to you without sending it anywhere. What the checks found is not in it, since a preview does not ask the second model. The Log says when a refine sent it.

Two things are taken out of a message before it is sent:

- **The model's own thinking.** It is never sent.
- **Your markup.** Tags, code and image links are replaced with tokens and put back afterwards, so a rewrite cannot change them.

Your settings are never sent. Nothing from a chat you are not in is sent.

The extension has no networking of its own. It never contacts a server of mine. You can check by searching the two source files for `fetch(`, `XMLHttpRequest`, `WebSocket`, `sendBeacon` or `EventSource`. None of them appear. With two models on, the call to the second model goes through Lumiverse, with `spindle.decisions`, to the Decision connection in use.

## The second model

With **How many models** set to two, each finished reply is sent to the second model before it is refined. It goes through Lumiverse to the provider of the Decision connection in use: the one picked under **Which Decision connection**, or your default one. That provider is a separate service with its own terms. It receives:

- the reply, with its thinking taken out
- the checks you wrote under **What the second model checks**
- the list of phrases this chat has worn out, if **Also check for worn-out phrases** is on
- the reply before it, with its thinking taken out, if **Also compare with the reply before it** is on

Nothing else goes to the second model. Your card, your own messages, the rest of the chat, lore, memories and settings stay out of it.

A refine you start yourself is only sent to it when **Let it check refines you start yourself** is on. A selection and your own messages are never sent to it.

The key for the Decision connection is kept by Lumiverse, with the connection. Auto Refine never sees it. The panel is only told whether one is saved.

Older versions kept a key for the second model in Lumiverse's secure store. This version deletes those keys the first time it loads your settings.

## The eight permissions

| Permission | What it is for | Without it |
| --- | --- | --- |
| `generation` | Runs the refine. | Nothing is refined, and the panel says so. |
| `chat_mutation` | Saves the rewrite over the message. | Refines run, but nothing can be saved. |
| `chats` | Knows which chat you are in and which card it belongs to. Reads what Lumiverse remembers of the chat, for `{{memories}}`. It only reads memories, never changes them. With **Refine using** left on its default, reads which connection and model the chat is set to. | It uses the last chat it saw a reply in, sends no card, and leaves out memories. A refine goes to your default connection. |
| `interceptor` | Lets Auto Refine see which connection you chat with, so **The model I am chatting with** really uses it. It does not read, keep or change your prompt. | If you have not picked a model under **Refine using**, it uses the chat's own connection, or your default one if the chat has none. |
| `characters` | Reads the character card, so a rewrite keeps each character's voice. | The card block is left out. Refining carries on. |
| `world_books` | Reads the lorebook entries this chat has active, so a rewrite does not contradict them. | The lore block is left out. Refining carries on. |
| `ui_panels` | The floating button, which is off by default. | Everything works except that button, and the panel says so. |
| `decisions` | Asks the second model through your Decision connection, with two models on, which is off by default. | Two-model mode refines every reply, like one model. Nothing else changes. |

The ones that read your chat, card and lore make a rewrite sound like your characters. Refusing them lowers quality, but the extension still works.

## The part that reads the page

**Refine what I am typing** reads and writes the chat input box directly, because Lumiverse has no API for it. It is off by default.

- It only reads the box you are typing in.
- The text goes to the same place a refine goes: your provider, on your connection.
- It is not sent anywhere else, and it is not saved to your chat.

**Pick it for me** reads the page only while you use it.

- It reads the attributes of the one box or button you hold, such as its `name`, to write a selector. It reads no text from the page.
- It asks Lumiverse to close the drawer, with `spindle.ui.closeDrawer`, and opens the Auto Refine tab again after. Neither needs a permission.

The Auto Refine tab itself needs no permission. Every extension can add a drawer tab.

## What it keeps

- **Your settings**, in your browser and in Lumiverse's storage for your account, so they follow you to other devices.
- **The chats you switched it off in**, in your browser and your account, so every browser and device you use has the same chats switched off. Only the chat ids are kept. Chat titles and text are not.
- **Your presets and model setups**, in your browser and your account, stored apart from your settings.
- **Your own sound**, if you chose one, with your settings. It never leaves your machine.
- **The text from before and after each refine**, so you can put a refine back. Your server keeps the last 30 at most.
  - It is held in your server's memory, so a reload keeps it. An update or a restart of Lumiverse clears it.
  - With **Keep them through an update** on, it is also saved on your server, in Lumiverse's storage for your account. It is off by default. Turning it off empties the saved copy.
  - Only your account can read or put back your own refines.

## What it never does

- It never refines the greeting, unless you turn on **Refine the greeting**.
- It never sends anything the block list does not show.
- It never keeps a copy of a reply after the refine finishes, apart from what **Put it back** needs.
- It never writes to any message except the one it refined.
- It never runs text as code. There is no `eval` and no `new Function`, so nothing in a reply, a rule or a model's answer can run.

## Checking any of this yourself

Lumiverse loads two files, named in `spindle.json`: `dist/frontend.js` and `dist/backend.js`. They are readable code, not minified or bundled. What you read is what runs. If you are checking this extension, or pointing a scanner at it, those two files are all of it.

The rest of the repo is for working on the extension and never reaches your browser:

- `src/` is the TypeScript the two files are built from. A scanner that only reads JavaScript cannot read it. The `dist/` files are plain JavaScript.
- `test/` only runs when a developer runs `bun run check`.
- `setup.sh` prepares a developer's machine. Nothing runs it when you install.
- `docs/` is these pages.
- `.github/workflows/` runs the checks on pull requests.

The checks rebuild `dist/` on every push and fail if it differs from `src/`, so the files Lumiverse loads always match the source.

---

[Back to the README](../README.md)
