# Security

## Reporting

Open a [security advisory](https://github.com/starlitcode/Lumiverse-Auto-Refine/security/advisories/new) rather than a public issue. I will confirm I have it, and say what I am doing about it.

## What this extension reaches

It has no networking of its own. It never opens a connection and never contacts a server of mine or anyone else's. The one thing that leaves your machine is the model call that does the refining, and that goes through Lumiverse to the provider you already configured, on the connection you picked.

What goes in that call: the text of the one message being refined, and the rules you wrote. Nothing else from your chat is sent, and nothing is kept after the answer comes back.

It never treats text as code. There is no `eval` and no `new Function`, so nothing in a reply, a rule, or a model's answer can be run.

## What it writes

One thing: the message it just refined, through Lumiverse's own chat API. It writes nothing else, and it never creates or deletes a message.

The text from before each refine is held in memory so it can be put back, and is gone on reload. Your settings are kept in your browser and in Lumiverse's per-user storage.

## Verifying it

`dist/` is committed as readable JavaScript built from `src/` with types stripped and nothing else changed. CI rebuilds on every push and fails if the two drift, so the file Lumiverse loads is one you can read and check against the source.
