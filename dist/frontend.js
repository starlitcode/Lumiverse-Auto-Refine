/*
 * Auto Refine frontend.
 *
 * The panel, the buttons, and the running log. None of the refining happens
 * here: this side collects what the reader wants, hands it to the backend, and
 * shows what came back. The backend holds the rules and does the model pass.
 *
 * Everything on screen is built by hand rather than with a framework, styled
 * from the host's own --lumiverse-* variables so it arrives in the reader's
 * theme rather than in one of ours.
 */
// Bumped on each release. Shown in the log line the panel writes on startup, so
// a bug report always says which version it came from.
const VERSION = "0.1.0";
const STORE_KEY = "lv-auto-refine:settings:v1";
const CHATS_OFF_KEY = "lv-auto-refine:chats-off:v1";
// Every setting, with the value a fresh install starts on. The panel is built
// from the schema below rather than from this, but a key missing here is a key
// that never loads, so the two are checked against each other.
const CONFIG = {
    enabled: true,
    // The automatic pass is off until the reader turns it on. This rewrites
    // saved messages with a model, which is not something to start doing to
    // somebody's chat because they installed an extension.
    refineOn: false,
    rules: "",
    structureRules: "",
    refineUserMessages: false,
    connectionId: "",
    thinkingMode: "off",
    timeoutSecs: 90,
    maxGrowthPct: 60,
    minShrinkPct: 40,
    keepOriginal: true,
    confirmBeforeSave: false,
    showRefineButton: true,
    showFloatingButton: false,
    toast: true,
    liveLog: false,
};
// A labelled run of rows inside a section, so a long list says what its parts
// have in common instead of reading as one wall.
const RUNS = {
    guardrails: {
        title: "What it refuses to save",
        note: "A model asked to rewrite prose sometimes answers with something else. These are the limits on what comes back, and a rewrite that fails one of them is dropped and the reply is left exactly as it was.",
    },
    cost: {
        title: "What the pass costs",
        note: "A refine is a second model call on every reply, so these two are where the money and the waiting go. Both default to the cheap answer.",
    },
};
const SCHEMA = [
    {
        title: "Basics",
        desc: "The main switch, and the ways to reach it.",
        fields: [
            {
                key: "enabled",
                label: "Turn Auto Refine on",
                type: "bool",
                hint: "The master switch. Off, nothing is refined and no model call is made, automatic or by hand.",
            },
            {
                key: "refineOn",
                label: "Refine every reply as it arrives",
                type: "bool",
                hint: "Off by default. On, each finished reply is sent for a refine and the result is saved over it. The greeting is never included. Leave it off and use the button instead if you would rather decide reply by reply.",
            },
            {
                key: "refineUserMessages",
                label: "Also refine your own messages",
                type: "bool",
                hint: "Off by default. On, the button will refine a message you wrote as well as a reply, keeping your voice rather than the character's. Automatic refining never touches your messages whatever this says: only the button does.",
            },
            {
                key: "showRefineButton",
                label: "Show a 'refine this reply' button",
                type: "bool",
                hint: "Adds a button to the chat input's Extras menu that refines the latest reply on demand. It works whether or not automatic refining is on.",
            },
            {
                key: "showFloatingButton",
                label: "Floating on/off button",
                type: "bool",
                hint: "Off by default. Puts a small round button over the chat that turns Auto Refine on and off in one tap, and holds the settings and the refine button in its own menu.",
            },
            {
                key: "toast",
                label: "Show a pop-up when a reply is refined",
                type: "bool",
                hint: "On by default. A short message saying a reply was refined, or why one was left alone. Turn it off if you would rather it worked quietly.",
            },
            {
                key: "liveLog",
                label: "Show the on-screen panel",
                type: "bool",
                hint: "Off by default. A small panel over the chat with the last twenty things it did and why, which is the quickest way to see what a rule is actually doing.",
            },
        ],
    },
    {
        title: "The rules it follows",
        desc: "What you want changed about a reply. This is the whole of what the model is told to do, so it is worth writing plainly.",
        fields: [
            {
                key: "rules",
                label: "Your refinement rules",
                type: "text",
                rows: 6,
                hint: "Written to the model as instructions, exactly as you type them. Plain sentences work best: \"cut filler words\", \"keep paragraphs under four lines\", \"never start a sentence with And\". Nothing is refined until there is something here.",
            },
            {
                key: "structureRules",
                label: "Structure and formatting rules",
                type: "text",
                rows: 4,
                hint: "Optional, and kept separate because it is a different kind of instruction. Layout rather than wording: how dialogue is marked, whether actions go in asterisks, how long a paragraph runs. Sent alongside the rules above.",
            },
        ],
    },
    {
        title: "How the pass runs",
        collapsed: true,
        desc: "Which model does the refining, what it costs, and what is done with an answer that looks wrong.",
        fields: [
            {
                key: "connectionId",
                run: "cost",
                label: "Refine using this connection",
                type: "pick",
                options: [{ value: "", label: "The one I am chatting with" }],
                hint: "A refine is a rewrite, not a performance, so it does not need the model you roleplay with. Pointing this at a cheaper or faster connection is the single biggest saving here. Leave it on the default to use whatever you are chatting with.",
            },
            {
                key: "thinkingMode",
                run: "cost",
                label: "Let the model think first",
                type: "pick",
                options: [
                    { value: "off", label: "No, keep it quick" },
                    { value: "inherit", label: "Yes, whatever the connection does" },
                ],
                hint: "Off by default. Rewriting a paragraph is not a reasoning problem, and extended thinking on every single reply is the cost nobody notices until the bill arrives. Turn it on if your rules ask for real judgement.",
            },
            {
                key: "timeoutSecs",
                label: "Give up waiting after (seconds)",
                type: "num",
                int: true,
                min: 5,
                max: 600,
                hint: "How long to wait for the refine before dropping it and leaving the reply alone. The default of 90 suits most models. A hung call is cancelled rather than left running.",
            },
            {
                key: "maxGrowthPct",
                run: "guardrails",
                label: "Longest a rewrite may get (%)",
                type: "num",
                int: true,
                min: 0,
                max: 500,
                hint: "A rewrite this much longer than the original is dropped. A refine that grows a reply by half has written new scene rather than polished what was there. Set to 0 to allow any length.",
            },
            {
                key: "minShrinkPct",
                run: "guardrails",
                label: "Shortest a rewrite may get (%)",
                type: "num",
                int: true,
                min: 0,
                max: 99,
                hint: "A rewrite this much shorter than the original is dropped, because writing has gone missing rather than been tightened. Set to 0 to allow any length.",
            },
            {
                key: "keepOriginal",
                run: "guardrails",
                label: "Keep what a refine replaced",
                type: "bool",
                hint: "On by default. Holds the text as it stood before each refine so you can put it back from the panel. Kept in this browser session only and never written anywhere, so a reload clears it.",
            },
            {
                key: "confirmBeforeSave",
                run: "guardrails",
                label: "Ask before saving a refine",
                type: "bool",
                hint: "Off by default. On, every refine shows you the rewrite and waits for a yes before it saves. Slow with automatic refining on, which is the point for anyone who does not want surprises.",
            },
        ],
    },
];
// ---- the icon ----
// A page of writing with a spark over it. Drawn rather than borrowed so it sits
// at the same weight as the host's own icons, and readable at the 20px the
// Extras menu gives it: three lines of text, one shortened to read as a
// paragraph rather than a list, and a four-point spark at the corner for the
// pass that goes over it.
function refineIcon() {
    return ('<svg viewBox="0 0 24 24" width="20" height="20" fill="none" ' +
        'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" ' +
        'stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M4 6.5h11" /><path d="M4 12h9" /><path d="M4 17.5h6.5" />' +
        '<path d="M18.5 3.2l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z" ' +
        'fill="currentColor" stroke="none" />' +
        '<path d="M17.8 14.6l.55 1.5 1.5.55-1.5.55-.55 1.5-.55-1.5-1.5-.55 1.5-.55z" ' +
        'fill="currentColor" stroke="none" opacity="0.7" />' +
        "</svg>");
}
export function setup(ctx, overrides) {
    const disposers = [];
    let tornDown = false;
    const cfg = Object.assign({}, CONFIG);
    // ---- what is remembered in this browser ----
    function loadSaved() {
        try {
            if (typeof localStorage === "undefined")
                return {};
            const raw = localStorage.getItem(STORE_KEY);
            return raw ? JSON.parse(raw) : {};
        }
        catch (_) {
            return {};
        }
    }
    function saveLocal() {
        try {
            if (typeof localStorage !== "undefined")
                localStorage.setItem(STORE_KEY, JSON.stringify(cfg));
        }
        catch (_) { }
    }
    Object.assign(cfg, loadSaved(), overrides || {});
    // Chats the reader switched Auto Refine off in. A list of ids and nothing
    // else, kept in this browser: it would mean nothing on another account, so it
    // is not synced.
    let chatsOff = [];
    try {
        if (typeof localStorage !== "undefined") {
            const raw = localStorage.getItem(CHATS_OFF_KEY);
            const list = raw ? JSON.parse(raw) : [];
            if (Array.isArray(list))
                chatsOff = list.map((x) => String(x)).slice(0, 500);
        }
    }
    catch (_) { }
    const send = (msg) => {
        try {
            if (ctx && typeof ctx.sendToBackend === "function")
                ctx.sendToBackend(msg);
        }
        catch (_) { }
    };
    const newId = () => "ar-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    // ---- the running log ----
    const LOG_MAX = 20;
    const logLines = [];
    let paintLog = null;
    function log(text) {
        logLines.push({ at: Date.now(), text: String(text) });
        while (logLines.length > LOG_MAX)
            logLines.shift();
        if (paintLog) {
            try {
                paintLog();
            }
            catch (_) { }
        }
    }
    // ---- telling the backend what it needs ----
    // Everything the backend knows arrived over this bridge, and a backend that
    // restarts comes back knowing none of it. It cannot look the settings up
    // either: that read runs before any user is known. So the panel says it all
    // again the moment the backend announces itself.
    function armBackend() {
        send({ type: "set_settings", settings: baselineOrCfg() });
        send({ type: "set_chats_off", chats: chatsOff.slice() });
    }
    // The values as last saved, while the panel is open with edits in it. Edits
    // change cfg as they are typed and are rolled back if the panel is dismissed,
    // so sending cfg would hand the backend a setting nobody saved.
    let modalBaseline = null;
    const baselineOrCfg = () => modalBaseline || cfg;
    // ---- toasts ----
    function toast(text, force) {
        if (!cfg.toast && !force)
            return;
        try {
            if (ctx.ui && typeof ctx.ui.toast === "function") {
                ctx.ui.toast(text);
                return;
            }
        }
        catch (_) { }
        try {
            if (typeof document === "undefined")
                return;
            const el = document.createElement("div");
            el.textContent = text;
            el.setAttribute("data-arf-toast", "1");
            el.style.cssText =
                "position:fixed;left:50%;transform:translateX(-50%);bottom:88px;z-index:2147483000;" +
                    "max-width:min(420px,calc(100vw - 32px));padding:10px 14px;border-radius:10px;" +
                    "font:13px/1.45 var(--lumiverse-font-family,system-ui);" +
                    "background:var(--lumiverse-card-bg-solid,rgb(35,30,48));" +
                    "color:var(--lumiverse-text,#eee);" +
                    "border:1px solid var(--lumiverse-border,rgba(255,255,255,.16));" +
                    "box-shadow:var(--lumiverse-shadow-md,0 8px 24px rgba(0,0,0,.35))";
            document.body.appendChild(el);
            const go = setTimeout(() => {
                try {
                    el.remove();
                }
                catch (_) { }
            }, 4200);
            disposers.push(() => {
                clearTimeout(go);
                try {
                    el.remove();
                }
                catch (_) { }
            });
        }
        catch (_) { }
    }
    // ---- where the reader is ----
    let lastChatId = null;
    let lastMessageId = null;
    const chatIsOff = (id) => id != null && chatsOff.indexOf(String(id)) >= 0;
    function setChatOff(id, off) {
        if (id == null)
            return;
        const s = String(id);
        const at = chatsOff.indexOf(s);
        if (off && at < 0)
            chatsOff.push(s);
        else if (!off && at >= 0)
            chatsOff.splice(at, 1);
        while (chatsOff.length > 500)
            chatsOff.shift();
        try {
            if (typeof localStorage !== "undefined")
                localStorage.setItem(CHATS_OFF_KEY, JSON.stringify(chatsOff));
        }
        catch (_) { }
        send({ type: "set_chats_off", chats: chatsOff.slice() });
    }
    // ---- what a refine left behind ----
    // One entry per chat, so the panel can offer to put the last one back.
    const undoable = new Map();
    // ---- styling helpers ----
    const MUTED = "var(--lumiverse-text-muted,rgba(255,255,255,.65))";
    const FIELD_CSS = "width:100%;box-sizing:border-box;padding:9px 11px;border-radius:var(--lumiverse-radius,8px);" +
        "border:1px solid var(--lumiverse-border,rgba(255,255,255,.16));" +
        "background:var(--lumiverse-fill-subtle,rgba(0,0,0,.1));" +
        "color:var(--lumiverse-text,#eee);font:13px var(--lumiverse-font-family,system-ui)";
    function btn(label, primary) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.style.cssText =
            "min-height:36px;padding:9px 14px;border-radius:var(--lumiverse-radius,8px);cursor:pointer;" +
                "font:13px var(--lumiverse-font-family,system-ui);border:1px solid " +
                (primary
                    ? "transparent;background:var(--lumiverse-primary,rgba(147,112,219,.9));color:#fff"
                    : "var(--lumiverse-border,rgba(255,255,255,.16));background:var(--lumiverse-secondary,rgba(255,255,255,.06));color:var(--lumiverse-text,#eee)");
        return b;
    }
    // ---- the settings panel ----
    let modalHandle = null;
    let connections = [];
    let repaintConnections = null;
    function buildRow(f) {
        const row = document.createElement("div");
        row.setAttribute("data-arf-row", f.key);
        row.style.cssText = "display:flex;flex-direction:column;gap:5px";
        const top = document.createElement("label");
        top.style.cssText =
            "display:flex;align-items:center;gap:10px;justify-content:space-between;cursor:pointer";
        const name = document.createElement("span");
        name.textContent = f.label;
        name.style.cssText = "flex:1;min-width:0;font-size:13.5px";
        top.appendChild(name);
        let input = null;
        if (f.type === "bool") {
            input = document.createElement("input");
            input.type = "checkbox";
            input.checked = !!cfg[f.key];
            input.style.cssText = "flex:none;width:18px;height:18px;cursor:pointer";
            input.addEventListener("change", () => {
                cfg[f.key] = !!input.checked;
                applyDeps();
            });
            top.appendChild(input);
            row.appendChild(top);
        }
        else if (f.type === "pick") {
            row.appendChild(top);
            input = document.createElement("select");
            input.style.cssText = FIELD_CSS;
            const fill = () => {
                input.innerHTML = "";
                const opts = f.key === "connectionId"
                    ? [{ value: "", label: "The one I am chatting with" }].concat(connections.map((c) => ({
                        value: c.id,
                        label: (c.name || c.provider || "Connection") +
                            (c.model ? " (" + c.model + ")" : "") +
                            (c.isDefault ? " - default" : ""),
                    })))
                    : f.options || [];
                for (const o of opts) {
                    const el = document.createElement("option");
                    el.value = o.value;
                    el.textContent = o.label;
                    input.appendChild(el);
                }
                input.value = String(cfg[f.key] == null ? "" : cfg[f.key]);
            };
            fill();
            if (f.key === "connectionId")
                repaintConnections = fill;
            input.addEventListener("change", () => {
                cfg[f.key] = input.value;
            });
            row.appendChild(input);
        }
        else if (f.type === "text") {
            row.appendChild(top);
            input = document.createElement("textarea");
            input.rows = f.rows || 4;
            input.value = String(cfg[f.key] == null ? "" : cfg[f.key]);
            input.style.cssText = FIELD_CSS + ";resize:vertical;line-height:1.5";
            input.addEventListener("change", () => {
                cfg[f.key] = input.value;
            });
            row.appendChild(input);
        }
        else {
            row.appendChild(top);
            input = document.createElement("input");
            input.type = "number";
            if (f.min != null)
                input.min = String(f.min);
            if (f.max != null)
                input.max = String(f.max);
            input.value = String(cfg[f.key]);
            input.style.cssText = FIELD_CSS;
            input.addEventListener("change", () => {
                let v = Number(input.value);
                if (!Number.isFinite(v))
                    v = Number(CONFIG[f.key]);
                if (f.int)
                    v = Math.round(v);
                if (f.min != null)
                    v = Math.max(f.min, v);
                if (f.max != null)
                    v = Math.min(f.max, v);
                cfg[f.key] = v;
                input.value = String(v);
            });
            row.appendChild(input);
        }
        const hint = document.createElement("div");
        hint.textContent = f.hint;
        hint.style.cssText = "font-size:12px;line-height:1.45;color:" + MUTED;
        row.appendChild(hint);
        return row;
    }
    const depRows = [];
    let applyDeps = () => { };
    function buildBody(root) {
        root.innerHTML = "";
        depRows.length = 0;
        root.style.cssText =
            "display:flex;flex-direction:column;gap:14px;max-height:min(78vh,760px);overflow-y:auto;" +
                "font:13px var(--lumiverse-font-family,system-ui);color:var(--lumiverse-text,#eee)";
        const head = document.createElement("div");
        head.style.cssText = "display:flex;align-items:center;gap:10px";
        const mark = document.createElement("span");
        mark.innerHTML = refineIcon();
        mark.style.cssText = "flex:none;display:inline-flex;color:var(--lumiverse-primary,rgba(147,112,219,.9))";
        const title = document.createElement("div");
        title.textContent = "Auto Refine";
        title.style.cssText = "font-size:16px;font-weight:600;flex:1";
        const ver = document.createElement("div");
        ver.textContent = "v" + VERSION;
        ver.style.cssText = "font-size:11px;color:" + MUTED;
        head.appendChild(mark);
        head.appendChild(title);
        head.appendChild(ver);
        root.appendChild(head);
        for (const g of SCHEMA) {
            const sec = document.createElement("div");
            sec.style.cssText = "display:flex;flex-direction:column;gap:10px";
            const h = document.createElement("div");
            h.textContent = g.title;
            h.style.cssText = "font-size:13px;font-weight:600";
            sec.appendChild(h);
            if (g.desc) {
                const d = document.createElement("div");
                d.textContent = g.desc;
                d.style.cssText = "font-size:12px;line-height:1.45;color:" + MUTED;
                sec.appendChild(d);
            }
            let openRun = null;
            for (const f of g.fields) {
                if (f.run && RUNS[f.run] && f.run !== openRun) {
                    openRun = f.run;
                    const rh = document.createElement("div");
                    rh.textContent = RUNS[f.run].title;
                    rh.style.cssText =
                        "font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:" + MUTED;
                    const rn = document.createElement("div");
                    rn.textContent = RUNS[f.run].note;
                    rn.style.cssText = "font-size:12px;line-height:1.45;color:" + MUTED;
                    sec.appendChild(rh);
                    sec.appendChild(rn);
                }
                else if (!f.run) {
                    openRun = null;
                }
                const row = buildRow(f);
                if (f.needs && f.needs.length)
                    depRows.push({ row: row, needs: f.needs });
                sec.appendChild(row);
            }
            root.appendChild(sec);
        }
        root.appendChild(buildTryItOut());
        root.appendChild(buildChatRow());
        const bar = document.createElement("div");
        bar.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;padding-top:4px";
        const save = btn("Save", true);
        save.addEventListener("click", () => {
            saveLocal();
            modalBaseline = snapshot();
            send({ type: "set_settings", settings: cfg });
            syncActions();
            syncLog();
            toast("Settings saved.", true);
            log("settings saved");
        });
        bar.appendChild(save);
        root.appendChild(bar);
        applyDeps = () => {
            for (const d of depRows)
                d.row.style.display = d.needs.some((k) => !!cfg[k]) ? "flex" : "none";
        };
        applyDeps();
    }
    function snapshot() {
        const out = {};
        for (const g of SCHEMA)
            for (const f of g.fields)
                out[f.key] = cfg[f.key];
        return out;
    }
    // Somewhere to try the rules on real text before turning anything on. Without
    // this the only way to find out what a rule does is to let it rewrite a reply
    // and read the result, which is a poor way to discover you meant something
    // else. Nothing here is saved to the chat.
    function buildTryItOut() {
        const wrap = document.createElement("div");
        wrap.style.cssText = "display:flex;flex-direction:column;gap:8px";
        const h = document.createElement("div");
        h.textContent = "Try it on some text";
        h.style.cssText = "font-size:13px;font-weight:600";
        const note = document.createElement("div");
        note.textContent =
            "Runs one refine on whatever is in the box, using the rules as they stand rather than as they were saved, and shows you what comes back. Nothing is written to your chat.";
        note.style.cssText = "font-size:12px;line-height:1.45;color:" + MUTED;
        const ta = document.createElement("textarea");
        ta.rows = 3;
        ta.placeholder = "Paste a reply here";
        ta.setAttribute("aria-label", "Text to try the rules on");
        ta.style.cssText = FIELD_CSS + ";resize:vertical;line-height:1.5";
        const out = document.createElement("div");
        out.style.cssText =
            "font-size:12px;line-height:1.5;white-space:pre-wrap;color:" + MUTED + ";min-height:1em";
        const row = document.createElement("div");
        row.style.cssText = "display:flex;gap:8px;flex-wrap:wrap";
        const grab = btn("Use my last reply", false);
        const go = btn("Try it", false);
        grab.addEventListener("click", () => {
            const t = lastRenderedReply();
            if (!t) {
                out.textContent = "Could not find a reply on screen to read.";
                return;
            }
            ta.value = t;
            out.textContent = "Filled in from the reply on screen.";
        });
        go.addEventListener("click", () => {
            const text = String(ta.value || "").trim();
            if (!text) {
                out.textContent = "Put some text in the box first.";
                return;
            }
            if (!String(cfg.rules || "").trim() && !String(cfg.structureRules || "").trim()) {
                out.textContent = "Write some rules above first, or there is nothing to apply.";
                return;
            }
            out.textContent = "Working...";
            // The rules as they stand in the boxes, so a change can be tried before
            // it is saved. This is the one place the unsaved values are sent.
            send({ type: "set_settings", settings: cfg });
            const id = newId();
            tryWaiting = { id: id, out: out };
            send({ type: "try_refine", requestId: id, text: text, asUser: false });
        });
        row.appendChild(grab);
        row.appendChild(go);
        wrap.appendChild(h);
        wrap.appendChild(note);
        wrap.appendChild(ta);
        wrap.appendChild(row);
        wrap.appendChild(out);
        return wrap;
    }
    let tryWaiting = null;
    // The switch for the chat in front of you, and the only place it is.
    let paintChatRow = null;
    function buildChatRow() {
        const row = document.createElement("div");
        row.setAttribute("data-arf-chat-switch", "1");
        row.style.cssText = "display:flex;flex-direction:column;gap:5px";
        const top = document.createElement("div");
        top.style.cssText = "display:flex;align-items:center;gap:10px;justify-content:space-between";
        const label = document.createElement("span");
        label.textContent = "This chat";
        label.style.cssText = "flex:1;min-width:0;font-size:13.5px";
        const act = btn("", false);
        act.style.cssText += ";min-height:0;padding:5px 12px;font-size:12px;flex:none";
        const note = document.createElement("div");
        note.style.cssText = "font-size:12px;line-height:1.45;color:" + MUTED;
        const paint = () => {
            const known = lastChatId != null;
            const off = chatIsOff(lastChatId);
            act.textContent = off ? "Turn on here" : "Turn off here";
            act.disabled = !known;
            act.style.opacity = known ? "1" : "0.45";
            act.style.cursor = known ? "pointer" : "not-allowed";
            note.textContent = !known
                ? "No chat is open, so there is nothing to switch here."
                : off
                    ? "Auto Refine is switched off in this chat. Every other chat carries on as it is."
                    : "Switch Auto Refine off in this chat alone, for a scene you would rather it left completely alone.";
        };
        act.addEventListener("click", () => {
            const off = chatIsOff(lastChatId);
            setChatOff(lastChatId, !off);
            paint();
            toast(off ? "Auto Refine is back on in this chat." : "Auto Refine is off in this chat.", true);
        });
        paint();
        paintChatRow = paint;
        top.appendChild(label);
        top.appendChild(act);
        row.appendChild(top);
        row.appendChild(note);
        return row;
    }
    // The last reply as the page is showing it. Read at the moment it is asked
    // for, so nothing is held between replies.
    function lastRenderedReply() {
        try {
            if (typeof document === "undefined")
                return "";
            const all = document.querySelectorAll('[data-component="MessageContent"]');
            for (let i = all.length - 1; i >= 0; i--) {
                const t = String(all[i].innerText || all[i].textContent || "").trim();
                if (t)
                    return t;
            }
        }
        catch (_) { }
        return "";
    }
    function openSettings() {
        try {
            if (!ctx.ui || typeof ctx.ui.showModal !== "function") {
                toast("This Lumiverse cannot open the settings window.", true);
                return;
            }
            const modal = ctx.ui.showModal({ title: "Auto Refine" });
            modalHandle = modal;
            modalBaseline = snapshot();
            buildBody(modal.root);
            // The connections are asked for each time the panel opens, since one can
            // be added or removed without this panel hearing about it.
            send({ type: "list_connections", requestId: newId() });
            if (typeof modal.onDismiss === "function")
                modal.onDismiss(() => {
                    // Nothing sticks unless Save was pressed.
                    if (modalBaseline)
                        Object.assign(cfg, modalBaseline);
                    modalBaseline = null;
                    modalHandle = null;
                    paintChatRow = null;
                    repaintConnections = null;
                    tryWaiting = null;
                });
        }
        catch (e) {
            log("could not open the settings window");
        }
    }
    // ---- the buttons on the chat ----
    const actions = new Map();
    function dropActions() {
        for (const [, a] of actions) {
            try {
                a.off && a.off();
            }
            catch (_) { }
            try {
                a.action && a.action.destroy && a.action.destroy();
            }
            catch (_) { }
        }
        actions.clear();
    }
    function addAction(id, label, icon, onClick) {
        if (actions.has(id))
            return;
        try {
            if (!ctx.ui || typeof ctx.ui.registerInputBarAction !== "function")
                return;
            const action = ctx.ui.registerInputBarAction({ id: id, label: label, icon: icon });
            const off = action && typeof action.onClick === "function" ? action.onClick(onClick) : null;
            actions.set(id, { action: action, off: off });
        }
        catch (_) { }
    }
    function syncActions() {
        dropActions();
        addAction("auto-refine-settings", "Auto Refine settings", refineIcon(), () => openSettings());
        if (cfg.showRefineButton)
            addAction("auto-refine-now", "Refine this reply", refineIcon(), () => refineNow());
    }
    function refineNow() {
        if (!cfg.enabled) {
            toast("Auto Refine is switched off.", true);
            return;
        }
        if (lastChatId == null) {
            toast("No chat is open. Open a chat and try again.", true);
            return;
        }
        if (!String(cfg.rules || "").trim() && !String(cfg.structureRules || "").trim()) {
            toast("No refinement rules are set up yet.", true);
            return;
        }
        toast("Refining the latest reply...", true);
        send({
            type: "refine_now",
            requestId: newId(),
            chatId: lastChatId,
            messageId: lastMessageId,
        });
    }
    // ---- the on-screen panel ----
    let logEl = null;
    function syncLog() {
        if (!cfg.liveLog || !cfg.enabled) {
            if (logEl) {
                try {
                    logEl.remove();
                }
                catch (_) { }
                logEl = null;
                paintLog = null;
            }
            return;
        }
        if (logEl || typeof document === "undefined")
            return;
        const el = document.createElement("div");
        el.id = "__lvRefineLog";
        el.setAttribute("data-arf-ui", "1");
        el.style.cssText =
            "position:fixed;right:16px;bottom:96px;z-index:2147482000;width:min(320px,calc(100vw - 32px));" +
                "max-height:40vh;overflow-y:auto;padding:10px 12px;border-radius:10px;" +
                "font:12px/1.5 var(--lumiverse-font-family,system-ui);" +
                "background:var(--lumiverse-card-bg-solid,rgb(35,30,48));color:var(--lumiverse-text,#eee);" +
                "border:1px solid var(--lumiverse-border,rgba(255,255,255,.16));" +
                "box-shadow:var(--lumiverse-shadow-md,0 8px 24px rgba(0,0,0,.35))";
        document.body.appendChild(el);
        logEl = el;
        paintLog = () => {
            if (!logEl)
                return;
            const at = (t) => new Date(t).toTimeString().slice(0, 8);
            logEl.textContent = "";
            const head = document.createElement("div");
            head.textContent = "Auto Refine";
            head.style.cssText = "font-weight:600;margin-bottom:6px";
            logEl.appendChild(head);
            for (const l of logLines) {
                const d = document.createElement("div");
                d.textContent = at(l.at) + "  " + l.text;
                d.style.cssText = "margin-bottom:3px";
                logEl.appendChild(d);
            }
        };
        paintLog();
    }
    // ---- what the host tells us ----
    try {
        const offs = [
            ctx.events.on("CHAT_CHANGED", (p) => {
                if (!p)
                    return;
                lastChatId = p.chatId || null;
                lastMessageId = null;
                if (paintChatRow)
                    paintChatRow();
            }),
            ctx.events.on("CHAT_SWITCHED", (p) => {
                if (!p || typeof p.chatId === "undefined")
                    return;
                lastChatId = p.chatId || null;
                lastMessageId = null;
                if (paintChatRow)
                    paintChatRow();
            }),
            ctx.events.on("CHARACTER_MESSAGE_RENDERED", (p) => {
                if (!p)
                    return;
                if (p.chatId)
                    lastChatId = p.chatId;
                if (p.messageId)
                    lastMessageId = p.messageId;
                if (paintChatRow)
                    paintChatRow();
            }),
            ctx.events.on("USER_MESSAGE_RENDERED", (p) => {
                if (p && p.chatId)
                    lastChatId = p.chatId;
                if (paintChatRow)
                    paintChatRow();
            }),
            ctx.events.on("GENERATION_ENDED", (p) => {
                if (!p)
                    return;
                if (p.chatId)
                    lastChatId = p.chatId;
                if (p.messageId)
                    lastMessageId = p.messageId;
            }),
        ];
        for (const o of offs)
            if (typeof o === "function")
                disposers.push(o);
    }
    catch (_) {
        log("could not listen for replies. Check that the generation permission is granted.");
    }
    // ---- what the backend tells us ----
    try {
        if (ctx && typeof ctx.onBackendMessage === "function") {
            const off = ctx.onBackendMessage((msg) => {
                try {
                    if (!msg)
                        return;
                    if (msg.type === "backend_ready") {
                        armBackend();
                        return;
                    }
                    if (msg.type === "connections") {
                        connections = Array.isArray(msg.list) ? msg.list : [];
                        if (repaintConnections)
                            repaintConnections();
                        return;
                    }
                    if (msg.type === "refined") {
                        if (msg.chatId != null && msg.canUndo)
                            undoable.set(String(msg.chatId), {
                                messageId: msg.messageId,
                                before: String(msg.before || ""),
                                after: String(msg.after || ""),
                            });
                        log("refined a reply");
                        toast("Reply refined.");
                        return;
                    }
                    if (msg.type === "refine_skipped") {
                        log("left a reply alone: " + String(msg.why || "no reason given"));
                        return;
                    }
                    if (msg.type === "refine_result") {
                        if (msg.ok) {
                            log("refined a reply on request");
                            toast("Reply refined.", true);
                        }
                        else {
                            log("could not refine: " + String(msg.why || "no reason given"));
                            toast("Not refined: " + String(msg.why || "no reason given"), true);
                        }
                        return;
                    }
                    if (msg.type === "try_result") {
                        if (!tryWaiting || tryWaiting.id !== msg.requestId)
                            return;
                        const out = tryWaiting.out;
                        tryWaiting = null;
                        out.textContent = msg.ok
                            ? String(msg.after || "")
                            : "This would not have been saved: " +
                                String(msg.why || "no reason given") +
                                (msg.after ? "\n\nWhat came back:\n" + String(msg.after) : "");
                        return;
                    }
                    if (msg.type === "undo_result") {
                        if (msg.ok) {
                            log("put a reply back the way it was");
                            toast("Put back.", true);
                        }
                        else {
                            toast("Could not put it back: " + String(msg.why || ""), true);
                        }
                        return;
                    }
                    if (msg.type === "confirm_refine") {
                        askToSave(msg);
                        return;
                    }
                }
                catch (_) { }
            });
            if (typeof off === "function")
                disposers.push(off);
        }
    }
    catch (_) { }
    // The confirmation, when the reader asked to see every rewrite first. Built
    // as a modal rather than a browser confirm so the two versions can be read
    // side by side, which is the only way to answer the question honestly.
    function askToSave(msg) {
        try {
            if (!ctx.ui || typeof ctx.ui.showModal !== "function")
                return;
            const modal = ctx.ui.showModal({ title: "Save this refine?" });
            const root = modal.root;
            root.innerHTML = "";
            root.style.cssText =
                "display:flex;flex-direction:column;gap:10px;max-height:70vh;overflow-y:auto;" +
                    "font:13px var(--lumiverse-font-family,system-ui);color:var(--lumiverse-text,#eee)";
            const pane = (title, text) => {
                const h = document.createElement("div");
                h.textContent = title;
                h.style.cssText = "font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:" + MUTED;
                const b = document.createElement("div");
                b.textContent = text;
                b.style.cssText =
                    "white-space:pre-wrap;line-height:1.5;padding:8px 10px;border-radius:8px;" +
                        "background:var(--lumiverse-fill-subtle,rgba(0,0,0,.1));" +
                        "border:1px solid var(--lumiverse-border,rgba(255,255,255,.16))";
                root.appendChild(h);
                root.appendChild(b);
            };
            pane("As it is now", String(msg.before || ""));
            pane("After the refine", String(msg.after || ""));
            const bar = document.createElement("div");
            bar.style.cssText = "display:flex;gap:8px;flex-wrap:wrap";
            const yes = btn("Save it", true);
            const no = btn("Leave it alone", false);
            yes.addEventListener("click", () => {
                send({
                    type: "apply_refine",
                    requestId: newId(),
                    chatId: msg.chatId,
                    messageId: msg.messageId,
                    after: msg.after,
                });
                try {
                    modal.dismiss && modal.dismiss();
                }
                catch (_) { }
            });
            no.addEventListener("click", () => {
                log("left a reply alone: you said no");
                try {
                    modal.dismiss && modal.dismiss();
                }
                catch (_) { }
            });
            bar.appendChild(yes);
            bar.appendChild(no);
            root.appendChild(bar);
        }
        catch (_) { }
    }
    // ---- start ----
    syncActions();
    syncLog();
    armBackend();
    log("ready v" + VERSION);
    return () => {
        tornDown = true;
        dropActions();
        if (logEl) {
            try {
                logEl.remove();
            }
            catch (_) { }
            logEl = null;
        }
        for (const d of disposers.splice(0)) {
            try {
                d();
            }
            catch (_) { }
        }
        try {
            if (modalHandle && modalHandle.dismiss)
                modalHandle.dismiss();
        }
        catch (_) { }
        modalHandle = null;
    };
}
// The defaults and the form built from them, so a check can hold the two
// against each other. A setting in one and not the other is the fault this
// catches: it looks fine and quietly never loads.
export const __testing = { CONFIG, SCHEMA, RUNS, refineIcon, VERSION };
