# Two models

A beta. With one model, which is the default, every reply the automatic pass reaches is refined. With two, a second model reads each finished reply first and says whether it needs a refine, and the refine model runs only on the replies it picks out. Replies that were fine already stop costing a refine.

The second model is a small scoring model. It does not write text. It is handed the reply and a list of statements about it, and it answers each with the chance, from 0 to 100 percent, that the statement is true. That is the whole of what it can do, so it has nothing of its own to save over a reply.

There are thirteen to pick from. Some come in more than one size or kind, picked under the model. See [Sizes and kinds](#sizes-and-kinds).

| Model | Made by | Cost | What is it? |
| --- | --- | --- | --- |
| **Jev** | TypeSafe | Paid, per call | [Introducing Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev) |
| **Span** | Respan | Span-01 Lite is free on OpenRouter. Span-01 is paid. Span-02, on Respan's own API, is paid, per call. | [Introducing Span-01](https://www.respan.ai/blog/introducing-span-1), [Introducing Span-02](https://www.respan.ai/blog/introducing-span-2) |
| **Mercury Decide**, free or without the free limits | Inception | The free one costs nothing. The other is paid, per call. | [Inception: Decisions](https://docs.inceptionlabs.ai/capabilities/decisions) |
| **D1** | Liquid AI | Paid on OpenRouter. On Liquid's own API it is called `d1:free`. | [Liquid AI: Decision Models](https://docs.liquid.ai/lfm/models/decision-models) |
| **Solar Decide**, and **Solar Decide Flash** | Upstage | Paid, per call | [Upstage: Solar Decide](https://console.upstage.ai/docs/models/solar-decide) |
| **Kev 4B** | Jared Palmer | Paid, per call | [Introducing Kev](https://jaredpalmer.com/blog/introducing-kev) |
| **GPT-6 Luna Decisions** | OpenAI | Paid, per call | [OpenAI: Decisions](https://developers.openai.com/api/docs/guides/decisions) |
| **Clef**, **Clef Flash** and **Clef Omni** | Cloudflare | Paid, per call | [Cloudflare: Clef](https://developers.cloudflare.com/workers-ai/models/clef/), [Cloudflare: Clef Flash](https://developers.cloudflare.com/workers-ai/models/clef-flash/), [Cloudflare: Clef Omni](https://developers.cloudflare.com/workers-ai/models/clef-omni/) |
| **Decider** | Perplexity | Paid, per call | [Perplexity: Decisions API](https://docs.perplexity.ai/docs/decisions/quickstart) |
| **Microsoft-Decision-1** | Microsoft | Paid, per call | [Microsoft: Microsoft-Decision-1](https://commandline.microsoft.com/microsoft-decision-1-model-foundry/) |
| **Drex** | Nace.AI | Paid, per call | [Drex v2.0 on Hugging Face](https://huggingface.co/nace-ai/drex-v2.0) |
| **Classify-1** | ScaleDown | Paid, per call | [ScaleDown: Decisions](https://docs.scaledown.ai/api-reference/decisions-overview) |
| **Mapika Decider**, in 0.8B, 2B and 4B | Mapika | Paid, per call | [Mapika Decider on GitHub](https://github.com/Mapika/decider) |

All of them answer the same checks, and everything on this page works the same for all of them, unless a section says it is for one. The Model tab shows the link for the model you picked, such as **What is Jev?**, while **How many models** is set to two. The link goes to the maker's own introduction to its decision model. It does not have to be about the exact model or size picked. Where the maker has a page for one size, such as Clef Flash, that size links to it.

Mapika has no hosted API of its own. Its link goes to its page for the models, which are open. With Kev 4B picked, a warning that it is a small model shows next to its link. With any Clef picked, a note says how much of a reply Cloudflare reads.

Solar Decide Flash links to Upstage's page for Solar Decide. Nace.AI's page for Drex is its model card on Hugging Face.

## Setting it up

Everything is on the Model tab, in **One model or two**.

1. Set **How many models** to two.
2. Pick **Which second model**. The list names each model and its maker.
3. Pick **Where it is reached**. The list only shows hosts that serve the model you picked. **Another address** is for any other host. It is there for every second model. See [Another address](#another-address).
4. Pick which version. For Jev, see [Which Jev](#which-jev). For Span, see [Which Span](#which-span). For Mercury Decide, Solar Decide, Clef and Mapika Decider, see [Sizes and kinds](#sizes-and-kinds). The others have one version each, so there is nothing to pick. See the section for your model below, such as [Mercury Decide](#mercury-decide) or [Clef](#clef).
5. Paste a key from that host into the key box and press **Save key**. The box is named after the host, such as **Key for OpenRouter**. The key has to come from that host.
6. Press **Test**. It asks one small question with nothing from any chat in it, and says whether an answer came back, and which model answered. The Log tab shows the test in full. See [Reading a test](#reading-a-test).

Two-model mode also needs the `cors_proxy` permission, since the second model is not a chat model and no connection profile can reach it. Without it the panel says so and every reply is refined, the same as with one model.

A key is kept for each host:

- Save a key once for each host you use. Picking a host uses the key saved for it.
- A key belongs to the host, not the model. An OpenRouter key is used for Jev and for Span on OpenRouter.
- **Keys are saved for**, under the box, lists the hosts that have a key.
- **Forget key** deletes the key for the host shown. The others are kept.
- **Another address** keeps a key for each address. A different address, such as one set by importing somebody else's settings, has no key until you save one for it. The same host with a different path uses the same key.
- A key saved before keys were kept per host is moved to the host you have picked the first time it is used.

## Which Jev

**Which Jev** shows when Jev is picked. It has these choices:

- **The latest Jev**, the default. It moves to each new Jev by itself, with no update to this extension. Its answers can change when a new Jev comes out, even though nothing changed on your side.
- **The preview Jev**, only when the host is TypeSafe. It runs ahead of the latest when TypeSafe has a preview build, for earlier access. When there is none, it is the same as the latest.
- **Jev 1.14 exactly**, only when the host is TypeSafe or NanoGPT. Its answers stay steady. Pick this if you have tuned **Refine when a check reaches** and want it to keep meaning the same thing.

The name each host is sent:

| Host | The latest Jev | The preview Jev | Jev 1.14 exactly |
| --- | --- | --- | --- |
| OpenRouter | `~typesafe/jev-latest` | not offered | not offered |
| TypeSafe | `jev-latest` | `jev-preview` | `jev-1.14.0` |
| NanoGPT | `typesafe/jev-latest` | not offered | `typesafe/jev-1.14` |

- OpenRouter and NanoGPT have no preview name, so **The preview Jev** is not in the list for them.
- OpenRouter has no name for Jev 1.14 exactly, so that is not in the list for OpenRouter.
- A choice that is not in the list for the host sends the latest. Change back to a host that has it, and it is picked again.
- **Jev 1.14 exactly** is the newest Jev. When a newer one comes out, this choice moves to it. To keep an older Jev, type its name in **Model name**, such as `jev-1.13.0` on TypeSafe or `typesafe/jev-1.13` on NanoGPT and OpenRouter. It works for as long as the host serves it.

**Model name**, under **Which Jev**, is the same box every second model has. It shows the name your choice above sends. Type a different name and that name is sent instead, whatever **Which Jev** says. See [When a model is renamed, or a new one comes out](#when-a-model-is-renamed-or-a-new-one-comes-out).

## Which Span

**Which Span** shows when Span is picked and the host is OpenRouter. It has these choices:

- **Span-01 Lite, free**, the default. It costs nothing at the moment. OpenRouter sets its price.
- **Span-01**, the full model. It is paid.

The name each host is sent:

| Host | Span-01 Lite, free | Span-01 |
| --- | --- | --- |
| OpenRouter | `respan/span-01-lite` | `respan/span-01` |
| Respan | `span-02` | `span-02` |

**Respan's own API** serves Span-02, the newest Span, so **Which Span** is not shown there. Span-02 is on Respan's own API only.

Span reads a conversation, not named fields. It takes the same kind of request as Jev, with the reply sent as a conversation. The panel does this for you:

- The reply is sent as the assistant's turn of a conversation.
- The word `reply` in backticks is written out as "the reply" in each check.
- With **Also compare with the reply before it** on, that reply is sent as the turn before, and `previous_reply` is written out as "the previous reply". See [Comparing with the reply before it](#comparing-with-the-reply-before-it).
- A key for Respan's own API comes from your Respan account, at [platform.respan.ai](https://platform.respan.ai).
- To use Span-01 on Respan's own API, pick **Another address**, with the address `https://api.respan.ai/api/v1/scores` and the model name `span-01-pro`. That address takes a scores request: each check is sent as a behavior, and the chance the behavior is present is the score.

## Sizes and kinds

Some models come in more than one size, or as a free kind and a paid kind. Each is one entry under **Which second model**, with a picker under it:

| Model | Picker | Choices |
| --- | --- | --- |
| Mercury Decide | **Which Mercury Decide** | free, or without the free limits |
| Solar Decide | **Which Solar Decide** | Solar Decide, or Solar Decide Flash |
| Clef | **Which Clef** | Clef, Clef Flash, or Clef Omni |
| Mapika Decider | **Which Mapika Decider** | 0.8B, 2B or 4B |

- A different size is a different model, so each size has its own **Refine when a check reaches**. The panel shows the line for the size in use.
- The free and paid kinds of Mercury Decide are the same model, so they share one line.
- A host only offers the sizes it serves. If the size you picked is not served on the host you change to, the standard size is used there, with its line. Change back and your size is picked again.
- One **Model name** box serves every size of a model. It shows the name for the one picked. A name typed in it is sent whichever size is picked.

## Mercury Decide

Mercury Decide is reached on OpenRouter. It takes the same request as Jev, so nothing about the checks changes.

**Which Mercury Decide** picks one of two kinds of the same model:

- **Mercury Decide, free**, the default. It costs nothing at the moment.
- **Mercury Decide, without the free limits**. It is paid, per call. OpenRouter's limits for free models do not apply to it.

| Host | Free | Without the free limits |
| --- | --- | --- |
| OpenRouter | `inception/mercury-decide:free` | `inception/mercury-decide` |

- OpenRouter limits free models to 20 calls a minute. It also limits them to 50 calls a day, or 1000 a day once you have bought 10 credits or more.
- Inception's own API serves it too, as `mercury-decide`, at `https://api.inceptionlabs.ai/v1/decisions`. To use it there, pick **Another address**, fill in that address and model name, and save a key from your Inception account. See [Inception: Decisions](https://docs.inceptionlabs.ai/capabilities/decisions).

## D1

D1 is Liquid AI's decision model. It takes the same request as Jev. It reads up to 65,536 tokens on OpenRouter.

| Host | Model name |
| --- | --- |
| OpenRouter | `liquid/d1` |
| NanoGPT | `liquid/d1` |
| Liquid AI | `d1:free` |

- On OpenRouter and NanoGPT it is paid, per call. Each host's own page shows the price.
- NanoGPT lists D1, but its docs for the decisions route only name Jev so far. If **Test** fails on NanoGPT, use OpenRouter or Liquid AI.
- On Liquid's own API, the key comes from your Liquid account, at [console.liquid.ai](https://console.liquid.ai), under **API Keys**. Liquid's keys start with `liquid_`.

## Solar Decide

Solar Decide is Upstage's decision model. It takes the same request as Jev. Upstage gives it 512K tokens of context, so a long reply fits easily.

**Which Solar Decide** shows when Solar Decide is picked:

- **Solar Decide**, the default.
- **Solar Decide Flash, faster**. A faster Solar Decide, with the same 512K tokens of context. It is only offered where it is served.

| Host | Solar Decide | Solar Decide Flash |
| --- | --- | --- |
| OpenRouter | `upstage/solar-decide` | `upstage/solar-decide-flash` |
| Upstage | `solar-decide` | not offered |

- Each of the two has its own **Refine when a check reaches**. The panel shows the line for the one in use.
- Upstage has not published its own name for Solar Decide Flash, so it is not offered on Upstage. If you picked it on OpenRouter and then change to Upstage, Solar Decide is sent, and its line is used. Change back to OpenRouter and Solar Decide Flash is picked again.
- One **Model name** box serves both. It shows the name for the one picked. A name typed in it is sent for both.
- On OpenRouter both are paid, per call. OpenRouter's page for each shows the price.
- On Upstage's own API, the key comes from your Upstage account, at [console.upstage.ai](https://console.upstage.ai/api-keys), under **API Keys**.
- Upstage marks it as a beta.

## Kev 4B

Kev 4B is an open model made by Jared Palmer. It takes the same request as Jev. Its weights are on [Hugging Face](https://huggingface.co/jaredpalmer/kev-4b).

| Host | Model name |
| --- | --- |
| OpenRouter | `jaredpalmer/kev-4b` |

It is a small model, so keep these in mind:

- It can miss more problems than the larger models, and score more checks wrongly.
- OpenRouter gives it 8,192 tokens. That covers the reply, the checks, and the reply before it when **Also compare with the reply before it** is on.
- Its maker trained it on texts up to about 7,500 tokens. A very long reply can be more than it handles well.
- When a call is too long for it, OpenRouter refuses the call. The reply is then refined, the same as when any second model cannot answer.
- It is paid, per call. OpenRouter's page for it shows the price.

## GPT-6 Luna Decisions

GPT-6 Luna Decisions is GPT-6 Luna, from OpenAI, answering through OpenAI's decisions API. OpenRouter gives it 1,050,000 tokens of context, so a long reply fits easily.

| Host | Model name |
| --- | --- |
| OpenRouter | `openai/gpt-6-luna-decisions` |
| OpenAI | `gpt-6-luna` |

- On OpenRouter it takes the same request as Jev.
- On OpenAI's own API the request is laid out the way OpenAI asks. The panel does this for you:
  - The reply, and the reply before it when that is sent, go as JSON text, so the checks can still call them `reply` and `previous_reply`.
  - Each check goes as a named yes-or-no question.
- OpenAI can decline to answer a check. That check then has no score, and the others are read as usual. If it declines every check, the Log says so and the reply is refined.
- On OpenAI's own API, the key comes from your OpenAI account, at [platform.openai.com](https://platform.openai.com/api-keys).
- It is paid, per call. OpenAI marks the decisions API as a beta.

## Clef

Clef, Clef Flash and Clef Omni are Cloudflare's decision models. All three take the same request as Jev. Their weights are open.

**Which Clef** shows when Clef is picked:

- **Clef**, the default. The larger one.
- **Clef Flash, smaller and faster**. It is only offered where it is served.
- **Clef Omni, which also reads pictures and sound**. Auto Refine sends it text only, the same as the others.

| Host | Clef | Clef Flash | Clef Omni |
| --- | --- | --- | --- |
| OpenRouter | `cloudflare/clef` | `cloudflare/clef-flash` | `cloudflare/clef-omni` |
| NanoGPT | `cloudflare/clef` | `cloudflare/clef-flash` | `cloudflare/clef-omni` |
| Cloudflare | `clef` | `clef-flash` | `clef-omni` |

- **How much they read.** OpenRouter says that Cloudflare reads only about the first 2,000 tokens of the text it is sent. NanoGPT limits them to about 1,800. The end of a long reply may not be read. OpenRouter can send them to Cloudflare too. Turning off **Also compare with the reply before it** leaves more room for the reply.
- **On Cloudflare's own API** you need two things, both from the Workers AI page of your Cloudflare dashboard, under **Use REST API**:
  1. Your account ID. Paste it into **Cloudflare account ID**, which shows when Cloudflare is the host. It is 32 letters and numbers. Anything else is not used.
  2. An API token made with the **Workers AI** template. Save it in the key box.
- With no account ID saved, Cloudflare is not called, the Log says what is missing, and the reply is refined.
- Each of the three has its own **Refine when a check reaches**. The panel shows the line for the one in use.
- NanoGPT serves all three, on the same decisions route as Jev.
- One **Model name** box serves all three. It shows the name for the one picked. A name typed in it is sent for all three. On Cloudflare the name is also part of the address, so it has to be `clef`, `clef-flash` or `clef-omni`.
- All three are paid, per call. Each host's own page shows the price.

## Decider

Decider is Perplexity's decision model. Auto Refine uses Decider V1.1 27B. It takes the same request as Jev, on OpenRouter, NanoGPT and Perplexity's own API. It reads up to 262,144 tokens.

| Host | Model name |
| --- | --- |
| OpenRouter | `perplexity/pplx-decider-v1.1-27b` |
| NanoGPT | `perplexity/pplx-decider-v1.1-27b` |
| Perplexity | `pplx-decider-v1.1-27b` |

- On Perplexity's own API, the key comes from your Perplexity account, under **API Keys**.
- The older Decider V1 27B is `pplx-decider-v1-27b` on Perplexity and `perplexity/pplx-decider-v1-27b` on OpenRouter. Type it in **Model name** to use it.
- It is paid, per call. Each host's own page shows the price.

## Microsoft-Decision-1

Microsoft-Decision-1 is Microsoft's decision model. It takes the same request as Jev on OpenRouter. It reads up to 32,768 tokens, which covers the reply, the checks, and the reply before it when **Also compare with the reply before it** is on.

| Host | Model name |
| --- | --- |
| OpenRouter | `microsoft/microsoft-decision-1` |

- It is on OpenRouter only. If another host is left picked, OpenRouter is used.
- It is paid, per call. OpenRouter's page for it shows the price.

## Drex

Drex is Nace.AI's decision model. Auto Refine uses Drex v2.0. It takes the same request as Jev on OpenRouter. It reads up to 131,072 tokens.

| Host | Model name |
| --- | --- |
| OpenRouter | `nace-ai/drex-v2.0` |

- It is on OpenRouter only. If another host is left picked, OpenRouter is used.
- The older Drex v1.5 is `nace-ai/drex-v1.5` on OpenRouter. Type it in **Model name** to use it.
- Its weights are open. You can run it yourself with Nace.AI's server and reach it under **Another address**. See [Drex v2.0 on Hugging Face](https://huggingface.co/nace-ai/drex-v2.0).
- It is paid, per call. OpenRouter's page for it shows the price.

## Classify-1

Classify-1 is ScaleDown's decision model. It takes the same request as Jev on OpenRouter. It reads up to 1,000,000 tokens, so a long reply fits easily.

| Host | Model name |
| --- | --- |
| OpenRouter | `scaledown/classify-1` |

- It is on OpenRouter only. If another host is left picked, OpenRouter is used.
- ScaleDown says it reads only the text of the request. So the reply goes to it as JSON text, and the names the checks use, such as `reply`, are still in it.
- ScaleDown's own API takes the key in an `x-api-key` header. Auto Refine sends the key the way OpenRouter takes it, so ScaleDown's own API is not offered.
- It is paid, per call. OpenRouter's page for it shows the price.

## Mapika Decider

Mapika Decider is an open decision model from Mapika. It takes the same request as Jev. LLM Tech hosts it on NanoGPT, made smaller to run, in three sizes.

**Which Mapika Decider** picks the size:

- **Decider 0.8B, the smallest**. The fastest. Its maker says it knows less than the 2B, so it does worse on questions that need knowledge.
- **Decider 2B**, the default. Its maker's default size.
- **Decider 4B, the largest**. Its maker says it scores above the 2B on most of their tests.

| Host | 0.8B | 2B | 4B |
| --- | --- | --- | --- |
| NanoGPT | `llmtech/decider-0.8b-fp8` | `llmtech/decider-2b-fp8` | `llmtech/decider-4b-nvfp4` |

- It is on NanoGPT only. If OpenRouter or another host is left picked, NanoGPT is used.
- NanoGPT gives each size 32,768 tokens.
- All three are paid, per call. NanoGPT's page for each shows the price.
- Mapika's models are open, so you can run them yourself with Mapika's server and reach them under **Another address**. See [Mapika Decider on GitHub](https://github.com/Mapika/decider).

## When a model is renamed, or a new one comes out

The model names are built in, and a host can change them. You do not have to wait for an update to Auto Refine.

**An older version of a model in the list.** When a model has a new version, the new one takes the old one's place in the list, so the list holds only models that work today. An older version still works for as long as its host serves it:

1. Pick the model, and its host.
2. Type the older version's name in **Model name**, such as `jev-1.13.0` on TypeSafe.
3. Press **Test**.

**A model in the list was renamed, or has a new version on the same host:**

1. Pick the model under **Which second model**, and its host under **Where it is reached**.
2. Type the new name in **Model name**, under the host. The box shows the built-in name as an example, and an empty box uses it.
3. Press **Test**. It says whether the model answered, and which one.

**A new model that is not in the list:**

1. Pick the model under **Which second model** that is most like it. Its **Refine when a check reaches** line is the one used.
2. Pick **Another address** under **Where it is reached**.
3. Fill in **Address** and **Model name** with what the new model's host gives. For a model on OpenRouter, the address is `https://openrouter.ai/api/alpha/decisions`.
4. Save the key for that host, and press **Test**.

The new model has to answer the same kind of request as the models in the list: a list of yes-or-no checks, each answered with a chance from 0 to 100 percent. See [Another address](#another-address) for the kinds of request it can take.

## Another address

Pick **Another address** for any host not in the list. It works for every second model. Fill in two boxes:

1. **Address**: your host's full address for the model. Paste the whole thing, not only the base. `https://example.com/v1` will not work. `https://example.com/v1/chat/completions` will.
   - It has to start with `https://`. Over `http://` your key could be read by anyone on the network between Lumiverse and the host, so the key is not sent.
   - An address on the same computer as Lumiverse can use `http://`, since it never goes over a network. That is `localhost`, `127.0.0.1`, `[::1]` and, in Docker, `host.docker.internal`.
   - For any other `http://` address on your own machine or network, such as another Docker container by its name, switch on **Let the key go over http://**. It is off by default. Only switch it on for an address you run yourself. With **It needs no key** on, this is not needed.
2. **Model name**: what your host calls the model, spelled the way its docs spell it.
3. **It needs no key**: off by default, so the key box shows as it does for every host. Switch it on for a model you run yourself that takes no key. Then:
   - No key is sent, and the key box, **Save key** and **Forget key** are hidden.
   - **Test** works with no key saved.
   - `http://` works at any address, because nothing secret is sent. **Let the key go over http://** is hidden.
   - If the address answers that it wants a key, the Log says so. Switch it off and save the key.

### A model you run yourself

Kev 4B is an open model, so you can run it on your own computer with its maker's server. See [Kev 4B on Hugging Face](https://huggingface.co/jaredpalmer/kev-4b) for how to start it. Then:

1. Pick **Kev 4B** under **Which second model**.
2. Pick **Another address** under **Where it is reached**.
3. Fill in **Address** with your server's address, such as `http://localhost:8008/v1/systemone`.
4. Fill in **Model name** with `jaredpalmer/kev-4b`.
5. Switch on **It needs no key**, unless you set a key on your server.
6. Press **Test**.

The address is reached from the machine Lumiverse runs on. `localhost` is that machine. If Lumiverse runs on your phone, it is your phone.

Hosts take a scoring model in one of six ways, and the address decides which:

- **Ending in `/chat/completions`**: the OpenAI chat format. The reply goes as the text of one user message, and the checks go with it.
- **Ending in `/responses`**: the OpenAI responses format. The same, laid out the way that format expects.
- **Ending in `/messages`**: the Claude format. The same again, with the key also sent in the header Claude-style hosts read.
- **Ending in `/scores`**: the scores format that Respan's own API takes. See [Which Span](#which-span).
- **OpenAI's own decisions address**, `https://api.openai.com/v1/decisions`: OpenAI's own decisions request. See [GPT-6 Luna Decisions](#gpt-6-luna-decisions).
- **Any other ending**: a decisions request, the same kind OpenRouter, NanoGPT and TypeSafe take.

Addresses known to work:

| Host | Address | Model name |
| --- | --- | --- |
| OpenRouter | `https://openrouter.ai/api/alpha/decisions` | `~typesafe/jev-latest`, `respan/span-01-lite`, `respan/span-01`, `inception/mercury-decide:free`, `liquid/d1`, `upstage/solar-decide`, `jaredpalmer/kev-4b`, `openai/gpt-6-luna-decisions`, `cloudflare/clef`, `cloudflare/clef-flash`, `cloudflare/clef-omni`, `perplexity/pplx-decider-v1.1-27b`, `microsoft/microsoft-decision-1`, `nace-ai/drex-v2.0`, `scaledown/classify-1`, `upstage/solar-decide-flash` or `inception/mercury-decide` |
| NanoGPT | `https://nano-gpt.com/api/v1/decisions` | `typesafe/jev-1.14`, `typesafe/jev-latest`, `liquid/d1`, `cloudflare/clef`, `cloudflare/clef-flash`, `cloudflare/clef-omni`, `perplexity/pplx-decider-v1.1-27b`, `llmtech/decider-0.8b-fp8`, `llmtech/decider-2b-fp8` or `llmtech/decider-4b-nvfp4` |
| TypeSafe | `https://api.typesafe.ai/v1/systemone` | `jev-1.14.0`, `jev-latest` or `jev-preview` |
| Respan | `https://api.respan.ai/api/v1/decisions` | `span-02` |
| Respan, scores | `https://api.respan.ai/api/v1/scores` | `span-01-free` or `span-01-pro` |
| Liquid AI | `https://api.liquid.ai/decisions/v1/systemone` | `d1:free` |
| Upstage | `https://api.upstage.ai/v1/systemone` | `solar-decide` |
| OpenAI | `https://api.openai.com/v1/decisions` | `gpt-6-luna` |
| Cloudflare | `https://api.cloudflare.com/client/v4/accounts/` your account ID `/ai/run/@cf/cloudflare/clef` | `clef`, or `clef-flash` or `clef-omni` with the address ending in that name |
| Perplexity | `https://api.perplexity.ai/v1/decisions` | `pplx-decider-v1.1-27b` |

NanoGPT also takes Jev at `/api/v1/chat/completions`, `/api/v1/responses` and `/api/v1/messages` on the same host. It serves Jev on `nano-gpt.com`, not `api.nano-gpt.com`.

The hosts in this table are in the list already, so only use their rows here if you need a different model name. Press **Test** after filling the boxes in: it says whether the model answered, and which one.

Every answer says which exact model gave it. The Log shows it next to each decision, for example "Jev (jev-1.14.0) says leave it".

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
- Each check is one more question in every call. Some hosts take only so many in one call. If **Test** fails after you add them, take a few out.

### How the second model reads a check

The second model is not a chat model. It reads the meaning of a check, not only its words. But it scores whether the statement you wrote is true of the reply, and it does not stretch a check to cover what you meant. So a check that describes a different pattern from the one you have in mind scores low, even on a reply that has your pattern.

For example, a check that says "says what something was not before saying what it was, as in 'it wasn't a request, it was a command'" does not catch "The kettle didn't whistle. It screamed." That line is about what something did, not what it was. The statement in the check is false of it, so it scores low. The built-in check names both forms for this reason.

Write each check so that:

- **It names what is on the page.** "Contains a stock phrase, such as a shiver ran down his spine" works. "Is badly written" or "names a feeling the actions already show" asks for a judgement. Scores for a judgement change more from one reply to the next.
- **It gives examples, one for each form.** Examples show which pattern you mean. With one example, another form of the same habit can score low.
- **It asks about one thing.** A statement that joins two patterns with "and" or "or" is two checks. The second model scores the whole statement, so a reply with only one of the two can score low.
- **A high score means there is a problem.** Write each check so that "true" means the reply needs a refine. A check can be written as a statement or as a question. TypeSafe, who make Jev, say both work as well. The built-in checks are statements.
- **It is false of a reply with nothing wrong in it.** A check that is true of most replies sends every reply to be refined.

To test a check, find a reply that has the problem and refine it with **Let it check refines you start yourself** on. **What Jev decided**, **What Span decided** and so on, on the Log tab, shows the score for each check. If a reply you know has the problem scores low, add an example shaped like it.

**Refine when a check reaches** is the line. A reply is refined when any check reaches it. Lower refines more replies, higher refines fewer.

Each second model has its own line, and the panel shows the one for the model you picked:

| Model | Line by default |
| --- | --- |
| **Jev** | 30 percent |
| **Span** | 30 percent |
| **Mercury Decide** | 30 percent |
| **D1** | 30 percent |
| **Solar Decide** | 30 percent |
| **Solar Decide Flash** | 30 percent |
| **Kev 4B** | 30 percent |
| **GPT-6 Luna Decisions** | 30 percent |
| **Clef** | 30 percent |
| **Clef Flash** | 30 percent |
| **Clef Omni** | 30 percent |
| **Decider** | 30 percent |
| **Microsoft-Decision-1** | 30 percent |
| **Drex** | 30 percent |
| **Classify-1** | 30 percent |
| **Mapika Decider 0.8B** | 30 percent |
| **Mapika Decider 2B** | 30 percent |
| **Mapika Decider 4B** | 30 percent |

### Where the defaults come from

- These defaults come from testing during the beta. They are a starting point, not a measured or correct value.
- The second models are new, and their makers can change them. A model that changes can score differently.
- So the defaults can change in a later version, if testing finds one that works better or a model changes.
- None of the makers gives one line that suits every use. TypeSafe, Respan and Jared Palmer each say to pick the line by testing on your own replies.

Span splits each answer three ways: the problem is there, it is not there, or it cannot be told from the reply. The three add up to 100 percent, and Auto Refine reads the first. Some of each answer goes to the other two, so Span's scores can run lower than the other models' scores on the same reply. If Span leaves alone replies you know have a problem, lower its line.

To find the line that suits you:

1. Turn on **Let it check refines you start yourself**.
2. Refine a few replies. Include some you know have a problem and some you know are fine.
3. Read the scores under **What Jev decided**, **What Span decided** and so on, on the Log tab.
4. If a reply you know has a problem scores under your line, lower the line.
5. If replies that were fine keep reaching your line, raise it.

The check from **Also check for worn-out phrases** is different. It asks whether the reply uses a phrase from a list, so a reply that does often scores well over 50%. The line matters most for the other checks.

Changing one line does not change the others. If you switch model, the line you set for each of the others is kept for when you switch back.

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
- It only changes the checks. The model, the host, the key, the threshold and the number of models stay as they are.

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

It is asked after **Seconds between automatic refines**, when that is set, and the panel says, for example, "Span is reading the reply" while it does. **Stop** works while it is reading.

## Passing on what the checks found

The second model works out which of your checks a reply matches. The refine model can be given that list, so it starts from the problems found.

To turn it on:

1. Go to the **Prompt** tab, on **For replies**.
2. Switch on the block called **Checks Found**. Both built-in prompts for replies have it, switched off.

If your prompt is your own, add a block with `{{checks_found}}` in it instead. It is the one macro for this, whichever second model you pick. The **One model or two** card says when no block is taking what is found.

What the refine model is given:

- A short lead-in. It is the text in **What the refine model is told about the checks**, on the Model tab. You can change it, and **Use the built-in text** puts it back. In it, `{{second_model}}` becomes the name of the second model you picked, and `{{checks_line}}` becomes your line. The built-in lead-in says another model scored the passage against checks you wrote, and that each check is a lead to check. Where a check does not fit the passage, the model is told to leave that part alone. An empty box sends the checks with no lead-in.
- Each check that reached your line, strongest first, with its score, like `- reply repeats itself. (91%)`. The backticks are taken out, and `previous_reply` is written as "the reply before it".

The block is empty, and left out of the prompt, whenever the second model did not read the reply or could not decide. That includes one model, a selection, and a button refine with **Let it check refines you start yourself** off.

The second model can be wrong, which is why the lead-in calls the checks leads. Your other rules still apply as they are.

To see that it was sent:

- **The Log** says, for example, "what Span found went to the refine model", with how many checks, on each refine that sent it.
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

While it runs, the panel says, for example, "Jev is reading the rewrite", then "Refining once more" if a check reached the line. **Stop** works at both points, and nothing is saved.

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

The reply is refined, the same as with one model. This happens when the key is missing or refused, the account has no credit, the host is down, or the answer has nothing usable in it. The Log says which. When the host refuses the call, it also gives the status the host sent and the host's own message. The beta failing costs you a refine you might not have needed, never a refine you did.

## Reading what it decided

The decision card, on the Log tab, shows the last reply the second model read. It is named after the model you picked, such as **What Jev decided** or **What Span decided**. It is there while two models are on.

- Whether the reply was refined or left alone, or why the model could not decide.
- Each check with its percentage and a bar. A mark on each bar shows your line. A check that reached it is in bold.
- Which model answered, and what the answer cost.
- A count since the page opened: how many replies were read, how many were left alone, and so how many refines you did not pay for. Use it to see whether two models are saving you anything.
- With **Have it check the rewrite** on, a read of a rewrite shows here too, marked **rewrite kept** or **refined again**. It is counted apart from the replies, as rewrites read and how many were sent back.
- **Clear** empties the card and the count. It is kept only until you close the tab, like the Log.

Every answer also goes in the Log as one line:

```
Jev (jev-1.14.0) says leave it: reply uses the same phrase of three or more words twice within a few sentences. 12%; ...
Span (span-02) says refine: ... uses a stock phrase, such as a held breath or a shiver down a spine 71%; ...
```

A reply left alone also says so where a refine that stood down would, with the highest percentage given. If the second model is letting through replies you would have refined, lower the line or add the check it is missing. If it refines replies that were fine, raise the line or drop the check that keeps firing.

### Reading a test

**Test** puts its answer in the same card, marked **test**. A test is not a reply from your chat, so it is not added to the count.

- The question is always the same: the text "The door is open." and the check "The door in reply is open." The door is open, so a score near 100% is right.
- The address the test went to, the format it was sent in, and the model name it asked for.
- Which model answered.
- What the host said it cost. If the host reported no cost, the card says so.
- If the test failed, why, and where it was sent. Use this to check an address or model name you typed.

The key is never shown.

## What it costs

The second model is billed by the host you picked, not by your refine provider. Each reply the automatic pass reaches is one call, and so is each press of **Test**. **Also compare with the reply before it** makes each call longer, which costs more on a host that charges for what is sent. Span-01 Lite, free, and Mercury Decide cost nothing at the moment.

With **Have it check the rewrite** on, each refine costs one more call. A reply refined once more also costs a second refine from your refine provider, one call per pass. Where the host reports the cost of a call, the Log and the card show it.

A test is very small, so its cost can be a tiny part of a cent. A host's own billing page may round it to nothing.

## Privacy

What goes to the second model, and where the key is kept, is on the [Privacy](privacy.md#the-second-model) page.

---

[Back to the README](../README.md)
