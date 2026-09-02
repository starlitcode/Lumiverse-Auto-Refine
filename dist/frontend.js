/*
 * Auto Refine frontend.
 *
 * The whole surface is one drawer tab. That is a deliberate choice rather than
 * a default: this is a thing you keep open and glance at while you write, not a
 * form you fill in and close. You want to see what the last refine did to your
 * prose, and put it back if you disagree, without stopping to open anything.
 *
 * A drawer tab has no moment where it closes, so there is no "nothing sticks
 * until Save" to build on. Everything here saves as you change it, which is
 * safe because nothing on this panel is destructive on its own: a rule is text
 * until a reply arrives, and the two switches that make something happen are
 * switches, which is exactly the control somebody expects to act at once.
 *
 * None of the refining happens on this side. This collects what the reader
 * wants, hands it to the backend, and shows what came back.
 */
const VERSION = "1.0.0";
const STORE_KEY = "lv-auto-refine:settings:v1";
const CHATS_OFF_KEY = "lv-auto-refine:chats-off:v1";
// Every setting, with the value a fresh install starts on.
const CONFIG = {
    enabled: true,
    // The automatic pass is off until asked for. This rewrites saved messages
    // with a model, which is not something to start doing to somebody's chat
    // because they installed an extension.
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
    toast: true,
};
const COST_FIELDS = [
    {
        key: "connectionId",
        label: "Refine using",
        type: "pick",
        options: [{ value: "", label: "The model I am chatting with" }],
        hint: "A rewrite does not need the model you roleplay with. Pointing this at a cheaper or faster connection is the biggest saving there is here.",
    },
    {
        key: "thinkingMode",
        label: "Let it think first",
        type: "pick",
        options: [
            { value: "off", label: "No, keep it quick" },
            { value: "inherit", label: "Yes, whatever the connection does" },
        ],
        hint: "Off by default. Rewriting a paragraph is not a reasoning problem, and extended thinking on every reply is the cost nobody notices until the bill arrives.",
    },
    {
        key: "timeoutSecs",
        label: "Give up waiting after (seconds)",
        type: "num",
        min: 5,
        max: 600,
        hint: "A refine that has not come back by then is cancelled and the reply is left alone.",
    },
];
const LIMIT_FIELDS = [
    {
        key: "maxGrowthPct",
        label: "Longest a rewrite may get (%)",
        type: "num",
        min: 0,
        max: 500,
        hint: "A rewrite this much longer has written new scene rather than polished what was there. 0 allows any length.",
    },
    {
        key: "minShrinkPct",
        label: "Shortest a rewrite may get (%)",
        type: "num",
        min: 0,
        max: 99,
        hint: "A rewrite this much shorter has lost writing rather than tightened it. 0 allows any length.",
    },
    {
        key: "keepOriginal",
        label: "Keep what a refine replaced",
        type: "bool",
        hint: "On by default, and what makes Put it back possible. Held while the page is open and written nowhere.",
    },
    {
        key: "confirmBeforeSave",
        label: "Ask before saving a refine",
        type: "bool",
        hint: "Off by default. On, every refine shows you both versions and waits for a yes.",
    },
    {
        key: "refineUserMessages",
        label: "Let the button refine your own messages",
        type: "bool",
        hint: "Off by default. The automatic pass never touches what you wrote whatever this says: only the button does.",
    },
    {
        key: "toast",
        label: "Show a pop-up on each refine",
        type: "bool",
        hint: "On by default. Turn it off if you would rather it worked quietly and you watched this tab instead.",
    },
];
// getComputedStyle hands colours back as rgb() or rgba() and nothing else, so
// those forms are the whole of what needs parsing. Anything else is unknown,
// and unknown means leave it alone.
function parseColor(input) {
    const s = String(input == null ? "" : input).trim();
    const m = s.match(/^rgba?\(([^)]+)\)$/i);
    if (!m)
        return null;
    const parts = m[1].replace(/\//g, " ").replace(/,/g, " ").split(/\s+/).filter(Boolean);
    if (parts.length < 3)
        return null;
    const num = (t, max) => {
        const v = t.indexOf("%") >= 0 ? (parseFloat(t) / 100) * max : parseFloat(t);
        return Number.isFinite(v) ? v : NaN;
    };
    const r = num(parts[0], 255), g = num(parts[1], 255), b = num(parts[2], 255);
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b))
        return null;
    let a = 1;
    if (parts.length > 3) {
        const v = num(parts[3], 1);
        a = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
    }
    return { r: r, g: g, b: b, a: a };
}
// One colour laid over another, which is what a translucent panel over a
// translucent drawer over the page actually is.
function blendColor(top, under) {
    const a = top.a + under.a * (1 - top.a);
    if (a <= 0)
        return { r: 0, g: 0, b: 0, a: 0 };
    const mix = (t, u) => (t * top.a + u * under.a * (1 - top.a)) / a;
    return { r: mix(top.r, under.r), g: mix(top.g, under.g), b: mix(top.b, under.b), a: a };
}
function relLuminance(c) {
    const f = (v) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}
function contrastRatio(a, b) {
    const x = relLuminance(a), y = relLuminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
// Below this, text is repainted near-white or near-black, whichever reads
// better on what is behind it.
const TEXT_FLOOR = 3.2;
// A filled button whose fill is this close to the surface behind it reads as
// plain text however legible its label is, so it is given an edge instead. Low
// enough that a merely quiet accent is left alone.
const FILL_FLOOR = 1.45;
const WHITE = { r: 255, g: 255, b: 255, a: 1 };
const BLACK = { r: 0, g: 0, b: 0, a: 1 };
const PAGE_FALLBACK = { r: 24, g: 20, b: 34, a: 1 };
function betterInk(back) {
    const onWhite = contrastRatio(WHITE, back);
    const onBlack = contrastRatio(BLACK, back);
    return onWhite >= onBlack
        ? { color: "rgba(255,255,255,0.94)", ratio: onWhite }
        : { color: "rgba(0,0,0,0.9)", ratio: onBlack };
}
// What an element is really sitting on. A panel is usually a solid colour with
// the theme's translucent tint laid over it as a gradient, and backgroundColor
// reports only the colour underneath. So the first stop of a gradient is read
// too: these tints are one colour repeated, so the first stop is the whole
// story.
function surfaceOf(el) {
    try {
        const cs = getComputedStyle(el);
        const base = parseColor(cs.backgroundColor);
        const img = String(cs.backgroundImage || "");
        if (img && img !== "none") {
            const stop = img.match(/rgba?\([^)]+\)/i);
            const tint = stop ? parseColor(stop[0]) : null;
            if (tint)
                return base ? blendColor(tint, base) : tint;
        }
        return base;
    }
    catch (_) {
        return null;
    }
}
// Walk up collecting surfaces until one is opaque, then blend them back down.
function backdropOf(el) {
    const stack = [];
    let node = el;
    let hops = 0;
    while (node && hops < 24) {
        const c = surfaceOf(node);
        if (c && c.a > 0) {
            stack.push(c);
            if (c.a >= 0.999)
                break;
        }
        node = node.parentElement;
        hops++;
    }
    let out = stack.length && stack[stack.length - 1].a >= 0.999
        ? stack.pop()
        : PAGE_FALLBACK;
    for (let i = stack.length - 1; i >= 0; i--)
        out = blendColor(stack[i], out);
    return out;
}
// A page of writing with a spark over it. Drawn rather than borrowed so it sits
// at the same weight as the host's own icons, and readable at the size a tab
// gives it: three lines of text, the last one short so it reads as a paragraph
// rather than a list, and a spark for the pass that goes over it.
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
    const cfg = Object.assign({}, CONFIG);
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
    Object.assign(cfg, loadSaved(), overrides || {});
    // Saved as it is changed, and pushed to the backend in the same breath. There
    // is no Save button here: a drawer tab has no moment where it closes, so a
    // "nothing sticks until you press Save" contract would have nothing to hang
    // on and would only ever surprise somebody who walked away mid-edit.
    let saveTimer = null;
    function persist(now) {
        const write = () => {
            saveTimer = null;
            try {
                if (typeof localStorage !== "undefined")
                    localStorage.setItem(STORE_KEY, JSON.stringify(cfg));
            }
            catch (_) { }
            send({ type: "set_settings", settings: cfg });
        };
        if (now) {
            if (saveTimer)
                clearTimeout(saveTimer);
            write();
            return;
        }
        // Typing in a rule box should not write on every keystroke. A short settle
        // is enough, and the box also writes on blur, so nothing is lost by
        // wandering off mid-sentence.
        if (saveTimer)
            clearTimeout(saveTimer);
        saveTimer = setTimeout(write, 400);
    }
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
    const newId = () => "arf-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    // Everything the backend knows arrived over the bridge, and a backend that
    // restarts comes back knowing none of it. It cannot look the settings up
    // either: that read runs before any user is known. So this says it all again
    // whenever the backend announces itself.
    function armBackend() {
        send({ type: "set_settings", settings: cfg });
        send({ type: "set_chats_off", chats: chatsOff.slice() });
    }
    // ---- state the tab shows ----
    const LOG_MAX = 20;
    const activity = [];
    function log(text, good) {
        activity.unshift({ at: Date.now(), text: String(text), good: !!good });
        while (activity.length > LOG_MAX)
            activity.pop();
        paint();
    }
    let lastChatId = null;
    let lastMessageId = null;
    let busy = false;
    // The refine that can still be undone, per chat. What the tab is really for:
    // seeing what happened to your prose and disagreeing with it.
    const undoable = new Map();
    let connections = [];
    let tryResult = null;
    let tryBusy = false;
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
        paint();
    }
    function toast(text, force) {
        if (!cfg.toast && !force)
            return;
        try {
            if (ctx.ui && typeof ctx.ui.toast === "function") {
                ctx.ui.toast(text);
            }
        }
        catch (_) { }
    }
    // ---- one stylesheet, not a style attribute per element ----
    // Kept in one place so the coarse-pointer rule is a second rule rather than a
    // branch at every call site, and so a tap target grows for a finger without
    // anything asking how wide the screen is. Sizes are pinned in px: the host's
    // font scale is the reader's story text, and chrome that inherits it grows
    // until a section stops fitting on a phone.
    const CSS = ".arf{display:flex;flex-direction:column;gap:14px;padding:14px;box-sizing:border-box;" +
        "font:13px/1.5 var(--lumiverse-font-family,system-ui);color:var(--lumiverse-text,rgba(255,255,255,.9))}" +
        ".arf *{box-sizing:border-box}" +
        ".arf-h{font-size:11px;letter-spacing:.05em;text-transform:uppercase;" +
        "color:var(--lumiverse-text-muted,rgba(255,255,255,.65))}" +
        ".arf-note{font-size:12px;line-height:1.45;color:var(--lumiverse-text-muted,rgba(255,255,255,.65))}" +
        ".arf-lab{font-size:12.5px;color:var(--lumiverse-text,rgba(255,255,255,.9))}" +
        ".arf-rule{height:1px;background:var(--lumiverse-border,rgba(147,112,219,.12));margin:2px 0}" +
        ".arf-col{display:flex;flex-direction:column;gap:5px}" +
        ".arf-sec{display:flex;flex-direction:column;gap:9px}" +
        ".arf-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}" +
        ".arf-between{display:flex;align-items:center;gap:9px;justify-content:space-between}" +
        // Inputs sit on a fill rather than an invented black, and take a neutral
        // border so a theme with a strong accent does not tint every box.
        ".arf-field{width:100%;padding:8px 10px;border-radius:var(--lumiverse-radius,8px);" +
        "border:1px solid var(--lumiverse-border-neutral,rgba(128,128,128,.15));" +
        "background:var(--lumiverse-fill,rgba(0,0,0,.15));" +
        "color:var(--lumiverse-text,rgba(255,255,255,.9));" +
        "font:13px/1.5 var(--lumiverse-font-family,system-ui)}" +
        ".arf-field:focus-visible{outline:2px solid var(--lumiverse-primary,rgba(147,112,219,.9));outline-offset:1px}" +
        "textarea.arf-field{resize:vertical;min-height:64px}" +
        // One transparent pixel of border always present, so giving a button an
        // edge when its fill is too quiet costs no layout.
        ".arf-btn{min-height:32px;padding:7px 12px;border-radius:var(--lumiverse-radius,8px);cursor:pointer;" +
        "font:12.5px var(--lumiverse-font-family,system-ui);border:1px solid transparent;" +
        "background:var(--lumiverse-secondary,rgba(128,128,128,.15));" +
        "color:var(--lumiverse-text,rgba(255,255,255,.9));" +
        "transition:background-color var(--lumiverse-transition-fast,150ms ease)}" +
        ".arf-btn:hover:not(:disabled){background:var(--lumiverse-secondary-hover,rgba(128,128,128,.25))}" +
        ".arf-btn.arf-primary{background:var(--lumiverse-primary,rgba(147,112,219,.9));color:#fff}" +
        ".arf-btn.arf-primary:hover:not(:disabled){background:var(--lumiverse-primary-hover,rgba(167,132,239,.95))}" +
        ".arf-btn:disabled{opacity:.5;cursor:not-allowed}" +
        ".arf-btn:focus-visible{outline:2px solid var(--lumiverse-primary,rgba(147,112,219,.9));outline-offset:1px}" +
        ".arf-box{width:17px;height:17px;flex:none;cursor:pointer;accent-color:var(--lumiverse-primary,rgba(147,112,219,.9))}" +
        ".arf-well{white-space:pre-wrap;line-height:1.5;font-size:12.5px;padding:8px 10px;" +
        "border-radius:var(--lumiverse-radius,8px);" +
        "border:1px solid var(--lumiverse-border-neutral,rgba(128,128,128,.15));" +
        "background:var(--lumiverse-fill,rgba(0,0,0,.15))}" +
        ".arf-well.arf-dim{color:var(--lumiverse-text-muted,rgba(255,255,255,.65))}" +
        ".arf-scroll{max-height:130px;overflow-y:auto}" +
        ".arf-dot{flex:none;width:7px;height:7px;border-radius:50%;" +
        "background:var(--lumiverse-text-dim,rgba(255,255,255,.4))}" +
        ".arf-dot.arf-live{background:var(--lumiverse-primary,rgba(147,112,219,.9))}" +
        ".arf-dot.arf-busy{background:var(--lumiverse-primary,rgba(147,112,219,.9));" +
        "box-shadow:0 0 6px 1px var(--lumiverse-primary-020,rgba(147,112,219,.2))}" +
        ".arf-when{flex:none;font-variant-numeric:tabular-nums;" +
        "color:var(--lumiverse-text-dim,rgba(255,255,255,.4))}" +
        ".arf-fold{display:flex;align-items:center;gap:7px;cursor:pointer;user-select:none;" +
        "background:none;border:0;padding:0;text-align:left;width:100%}" +
        ".arf-fold:focus-visible{outline:2px solid var(--lumiverse-primary,rgba(147,112,219,.9));outline-offset:2px}" +
        // A checkbox comfortable under a mouse is too small for a finger, and the
        // width of the screen does not say which is in use. This asks directly.
        "@media (pointer: coarse){" +
        ".arf-btn{min-height:40px;padding:10px 14px}" +
        ".arf-box{width:22px;height:22px}" +
        ".arf-field{padding:10px 12px}}";
    let styleEl = null;
    function injectStyle() {
        try {
            if (styleEl || typeof document === "undefined")
                return;
            styleEl = document.createElement("style");
            styleEl.setAttribute("data-arf-style", "1");
            styleEl.textContent = CSS;
            document.head.appendChild(styleEl);
            disposers.push(() => {
                try {
                    styleEl && styleEl.remove();
                }
                catch (_) { }
                styleEl = null;
            });
        }
        catch (_) { }
    }
    // ---- small builders ----
    const el = (tag, cls, text) => {
        const d = document.createElement(tag);
        if (cls)
            d.className = cls;
        if (text != null)
            d.textContent = text;
        return d;
    };
    const heading = (text) => el("div", "arf-h", text);
    const note = (text) => el("div", "arf-note", text);
    function button(label, primary) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "arf-btn" + (primary ? " arf-primary" : "");
        b.textContent = label;
        return b;
    }
    const rule = () => el("div", "arf-rule");
    // ---- the tab ----
    let tab = null;
    let badge = null;
    // The section that stays folded, remembered while the page is open so it does
    // not close itself every time the tab repaints.
    let costOpen = false;
    function setBadge(v) {
        // Written only when it changes. This goes to the host on every call, and a
        // panel that repaints on a timer would otherwise say the same thing several
        // times a second.
        if (v === badge)
            return;
        badge = v;
        try {
            tab && tab.setBadge && tab.setBadge(v);
        }
        catch (_) { }
    }
    function statusLine() {
        if (!cfg.enabled)
            return { text: "Off", tone: "off" };
        if (chatIsOff(lastChatId))
            return { text: "Off in this chat", tone: "off" };
        if (busy)
            return { text: "Refining a reply", tone: "busy" };
        if (!String(cfg.rules || "").trim() && !String(cfg.structureRules || "").trim())
            return { text: "Waiting for some rules to follow", tone: "off" };
        if (cfg.refineOn)
            return { text: "Refining every reply as it arrives", tone: "idle" };
        return { text: "Waiting for you to press Refine", tone: "idle" };
    }
    // Browser-drawn controls are painted from the page's colour scheme, and with
    // none set the browser assumes light, which is why a checkbox comes out as a
    // white block on a dark panel. Measured rather than assumed, so a light theme
    // still gets light controls.
    function setScheme(root) {
        try {
            const back = backdropOf(root);
            root.style.colorScheme = relLuminance(back) > 0.5 ? "light" : "dark";
        }
        catch (_) { }
    }
    // Walk the panel and repair only what genuinely fails. Elements with no text
    // yet are included: a status line waiting for something to say has already
    // been given its colour, and it will not change when the text arrives.
    function sweepReadable(root) {
        try {
            const nodes = [root].concat(Array.prototype.slice.call(root.querySelectorAll("*")));
            for (const n of nodes) {
                const tag = String(n.tagName || "").toLowerCase();
                const isControl = tag === "button" || tag === "input" || tag === "select" || tag === "textarea";
                const hasText = !isControl && n.firstChild && n.firstChild.nodeType === 3;
                const painted = n.getAttribute && n.getAttribute("data-arf-painted") != null;
                if (!isControl && !hasText && !painted)
                    continue;
                const cs = getComputedStyle(n);
                const fg = parseColor(cs.color);
                if (!fg)
                    continue;
                const back = backdropOf(n.parentElement || root);
                const shown = blendColor(fg, back);
                if (contrastRatio(shown, back) < TEXT_FLOOR) {
                    const ink = betterInk(back);
                    n.style.color = ink.color;
                }
                // A filled button whose fill is close to the surface behind it reads as
                // plain text, however legible the label is. It gets an edge instead of
                // having its label repainted, which would fix the wrong half.
                if (tag === "button") {
                    const fill = surfaceOf(n);
                    const behind = backdropOf((n.parentElement || root).parentElement || root);
                    if (fill && fill.a > 0.05) {
                        const solid = blendColor(fill, behind);
                        if (contrastRatio(solid, behind) < FILL_FLOOR)
                            n.style.borderColor = "var(--lumiverse-border-hover,rgba(147,112,219,.25))";
                    }
                }
            }
        }
        catch (_) { }
    }
    function paint() {
        if (!tab || !tab.root)
            return;
        const root = tab.root;
        // The rule boxes are rebuilt with everything else, so a repaint while
        // somebody is typing would take the cursor with it. Held and put back.
        const focusKey = document.activeElement?.getAttribute?.("data-arf-field");
        const caret = document.activeElement?.selectionStart;
        root.innerHTML = "";
        root.className = "arf";
        root.appendChild(buildHeader());
        const last = lastChatId != null ? undoable.get(String(lastChatId)) : null;
        if (last)
            root.appendChild(buildLastRefine(last));
        root.appendChild(buildRules());
        root.appendChild(buildTryIt());
        root.appendChild(buildFold());
        root.appendChild(buildChatSwitch());
        root.appendChild(buildActivity());
        setScheme(root);
        // Colours only resolve once the tree is in the page and laid out, so the
        // repair runs a frame later rather than against a half-built panel.
        try {
            requestAnimationFrame(() => sweepReadable(root));
        }
        catch (_) {
            sweepReadable(root);
        }
        if (focusKey) {
            const back = root.querySelector('[data-arf-field="' + focusKey + '"]');
            if (back && typeof back.focus === "function") {
                back.focus();
                try {
                    if (caret != null && back.setSelectionRange)
                        back.setSelectionRange(caret, caret);
                }
                catch (_) { }
            }
        }
    }
    function buildHeader() {
        const wrap = el("div", "arf-col");
        const top = el("div", "arf-row");
        const mark = el("span", "arf-mark");
        mark.innerHTML = refineIcon();
        const name = el("div", "arf-title", "Auto Refine");
        const sw = document.createElement("input");
        sw.type = "checkbox";
        sw.checked = !!cfg.enabled;
        sw.setAttribute("aria-label", "Turn Auto Refine on");
        sw.className = "arf-box";
        sw.addEventListener("change", () => {
            cfg.enabled = !!sw.checked;
            persist(true);
            paint();
        });
        top.appendChild(mark);
        top.appendChild(name);
        top.appendChild(sw);
        wrap.appendChild(top);
        const st = statusLine();
        const line = el("div", "arf-row arf-note");
        const dot = el("span", "arf-dot" + (st.tone === "off" ? "" : st.tone === "busy" ? " arf-busy" : " arf-live"));
        line.appendChild(dot);
        line.appendChild(el("span", "", st.text));
        wrap.appendChild(line);
        const row = el("div", "arf-row");
        const now = button("Refine the latest reply", true);
        now.disabled = busy || !cfg.enabled;
        now.style.opacity = now.disabled ? "0.5" : "1";
        now.addEventListener("click", () => refineNow());
        row.appendChild(now);
        const auto = document.createElement("label");
        auto.className = "arf-row arf-note";
        auto.style.cursor = "pointer";
        const autoBox = document.createElement("input");
        autoBox.type = "checkbox";
        autoBox.checked = !!cfg.refineOn;
        autoBox.className = "arf-box";
        autoBox.addEventListener("change", () => {
            cfg.refineOn = !!autoBox.checked;
            persist(true);
            paint();
        });
        auto.appendChild(autoBox);
        auto.appendChild(el("span", "", "every reply, automatically"));
        row.appendChild(auto);
        wrap.appendChild(row);
        return wrap;
    }
    // The heart of the tab. After a refine you want to see what it did to your
    // writing and be able to disagree, and this is that, sitting where you are
    // already looking rather than behind a menu.
    function buildLastRefine(last) {
        const wrap = el("div", "arf-col");
        wrap.setAttribute("data-arf-last", "1");
        wrap.appendChild(rule());
        wrap.appendChild(heading("The last refine"));
        const pane = (title, text, dim) => {
            wrap.appendChild(el("div", "arf-note", title));
            wrap.appendChild(el("div", "arf-well arf-scroll" + (dim ? " arf-dim" : ""), text));
        };
        pane("Before", last.before, true);
        pane("After", last.after, false);
        const row = el("div", "arf-row");
        const back = button("Put it back", false);
        back.addEventListener("click", () => {
            send({
                type: "undo_refine",
                requestId: newId(),
                chatId: lastChatId,
                messageId: last.messageId,
            });
        });
        const seen = button("Dismiss", false);
        seen.addEventListener("click", () => {
            if (lastChatId != null)
                undoable.delete(String(lastChatId));
            setBadge(null);
            paint();
        });
        row.appendChild(back);
        row.appendChild(seen);
        wrap.appendChild(row);
        return wrap;
    }
    function textBox(key, label, hint, rows) {
        const wrap = el("div", "display:flex;flex-direction:column;gap:5px");
        wrap.appendChild(el("div", "arf-lab", label));
        const ta = document.createElement("textarea");
        ta.rows = rows;
        ta.value = String(cfg[key] == null ? "" : cfg[key]);
        ta.setAttribute("data-arf-field", key);
        ta.setAttribute("aria-label", label);
        ta.className = "arf-field";
        ta.addEventListener("input", () => {
            cfg[key] = ta.value;
            persist();
        });
        // Written at once on the way out, so wandering off mid-sentence keeps it.
        ta.addEventListener("blur", () => {
            cfg[key] = ta.value;
            persist(true);
            paint();
        });
        wrap.appendChild(ta);
        wrap.appendChild(note(hint));
        return wrap;
    }
    function buildRules() {
        const wrap = el("div", "arf-sec");
        wrap.appendChild(rule());
        wrap.appendChild(heading("The rules it follows"));
        wrap.appendChild(textBox("rules", "What to change", "Plain sentences, one per line. Cut filler words. Keep paragraphs under four lines. Nothing is refined until there is something here.", 5));
        wrap.appendChild(textBox("structureRules", "Structure and formatting", "Optional, and separate because it is a different kind of instruction: layout rather than wording. How dialogue is marked, how long a paragraph runs.", 3));
        return wrap;
    }
    function buildTryIt() {
        const wrap = el("div", "arf-col");
        wrap.appendChild(rule());
        wrap.appendChild(heading("Try it"));
        wrap.appendChild(note("Runs one refine on whatever is in the box and shows what comes back. Nothing is written to your chat."));
        const ta = document.createElement("textarea");
        ta.rows = 3;
        ta.placeholder = "Paste a reply here";
        ta.setAttribute("data-arf-field", "tryText");
        ta.setAttribute("aria-label", "Text to try the rules on");
        ta.className = "arf-field";
        wrap.appendChild(ta);
        const row = el("div", "arf-row");
        const grab = button("Use my last reply", false);
        grab.addEventListener("click", () => {
            const t = lastRenderedReply();
            if (!t) {
                tryResult = { ok: false, text: "Could not find a reply on screen to read." };
                paint();
                return;
            }
            ta.value = t;
            ta.focus();
        });
        const go = button("Try it", false);
        go.disabled = tryBusy;
        go.style.opacity = tryBusy ? "0.5" : "1";
        go.addEventListener("click", () => {
            const text = String(ta.value || "").trim();
            if (!text) {
                tryResult = { ok: false, text: "Put some text in the box first." };
                paint();
                return;
            }
            if (!String(cfg.rules || "").trim() && !String(cfg.structureRules || "").trim()) {
                tryResult = { ok: false, text: "Write some rules first, or there is nothing to apply." };
                paint();
                return;
            }
            tryBusy = true;
            tryResult = null;
            persist(true);
            const id = newId();
            tryWaiting = id;
            send({ type: "try_refine", requestId: id, text: text, asUser: false });
            paint();
        });
        row.appendChild(grab);
        row.appendChild(go);
        wrap.appendChild(row);
        if (tryBusy)
            wrap.appendChild(note("Working..."));
        else if (tryResult)
            wrap.appendChild(el("div", "arf-well arf-scroll" + (tryResult.ok ? "" : " arf-dim"), tryResult.text));
        return wrap;
    }
    let tryWaiting = null;
    function fieldRow(f) {
        const wrap = el("div", "arf-col");
        if (f.type === "bool") {
            const lab = document.createElement("label");
            lab.className = "arf-between";
            lab.style.cursor = "pointer";
            lab.appendChild(el("span", "arf-lab", f.label));
            const box = document.createElement("input");
            box.type = "checkbox";
            box.checked = !!cfg[f.key];
            box.setAttribute("data-arf-field", f.key);
            box.className = "arf-box";
            box.addEventListener("change", () => {
                cfg[f.key] = !!box.checked;
                persist(true);
            });
            lab.appendChild(box);
            wrap.appendChild(lab);
        }
        else if (f.type === "pick") {
            wrap.appendChild(el("div", "arf-lab", f.label));
            const sel = document.createElement("select");
            sel.setAttribute("data-arf-field", f.key);
            sel.setAttribute("aria-label", f.label);
            sel.className = "arf-field";
            const opts = f.key === "connectionId"
                ? [{ value: "", label: "The model I am chatting with" }].concat(connections.map((c) => ({
                    value: c.id,
                    label: (c.name || c.provider || "Connection") +
                        (c.model ? " (" + c.model + ")" : "") +
                        (c.isDefault ? " - default" : ""),
                })))
                : f.options || [];
            for (const o of opts) {
                const op = document.createElement("option");
                op.value = o.value;
                op.textContent = o.label;
                sel.appendChild(op);
            }
            sel.value = String(cfg[f.key] == null ? "" : cfg[f.key]);
            sel.addEventListener("change", () => {
                cfg[f.key] = sel.value;
                persist(true);
            });
            wrap.appendChild(sel);
        }
        else {
            wrap.appendChild(el("div", "arf-lab", f.label));
            const num = document.createElement("input");
            num.type = "number";
            if (f.min != null)
                num.min = String(f.min);
            if (f.max != null)
                num.max = String(f.max);
            num.value = String(cfg[f.key]);
            num.setAttribute("data-arf-field", f.key);
            num.setAttribute("aria-label", f.label);
            num.className = "arf-field";
            num.addEventListener("change", () => {
                let v = Math.round(Number(num.value));
                if (!Number.isFinite(v))
                    v = Number(CONFIG[f.key]);
                if (f.min != null)
                    v = Math.max(f.min, v);
                if (f.max != null)
                    v = Math.min(f.max, v);
                cfg[f.key] = v;
                num.value = String(v);
                persist(true);
            });
            wrap.appendChild(num);
        }
        wrap.appendChild(note(f.hint));
        return wrap;
    }
    // Set once and left, so it stays folded and out of the way of the rules.
    function buildFold() {
        const wrap = el("div", "arf-sec");
        wrap.appendChild(rule());
        // A real button, so the keyboard and a screen reader get it for free
        // rather than from a role attribute and a keydown handler that has to
        // remember Space as well as Enter.
        const head = document.createElement("button");
        head.type = "button";
        head.className = "arf-fold";
        head.setAttribute("aria-expanded", costOpen ? "true" : "false");
        const caret = el("span", "arf-note", costOpen ? "\u25be" : "\u25b8");
        head.appendChild(caret);
        head.appendChild(heading("How the pass runs"));
        const toggle = () => {
            costOpen = !costOpen;
            paint();
        };
        head.addEventListener("click", toggle);
        wrap.appendChild(head);
        if (!costOpen)
            return wrap;
        wrap.appendChild(note("A refine is a second model call on every reply, so the first two are where the money and the waiting go. Both default to the cheap answer."));
        for (const f of COST_FIELDS)
            wrap.appendChild(fieldRow(f));
        wrap.appendChild(rule());
        wrap.appendChild(heading("What it refuses to save"));
        wrap.appendChild(note("A model asked to rewrite prose sometimes answers with something else. A rewrite that fails one of these is dropped and the reply is left exactly as it was, and the list below says which one fired."));
        for (const f of LIMIT_FIELDS)
            wrap.appendChild(fieldRow(f));
        return wrap;
    }
    function buildChatSwitch() {
        const wrap = el("div", "display:flex;flex-direction:column;gap:5px");
        wrap.setAttribute("data-arf-chat-switch", "1");
        wrap.appendChild(rule());
        const top = el("div", "arf-between");
        top.appendChild(el("span", "arf-lab", "This chat"));
        const known = lastChatId != null;
        const off = chatIsOff(lastChatId);
        const act = button(off ? "Turn on here" : "Turn off here", false);
        act.disabled = !known;
        act.style.opacity = known ? "1" : "0.45";
        act.style.cursor = known ? "pointer" : "not-allowed";
        act.addEventListener("click", () => setChatOff(lastChatId, !off));
        top.appendChild(act);
        wrap.appendChild(top);
        wrap.appendChild(note(!known
            ? "No chat is open, so there is nothing to switch here."
            : off
                ? "Auto Refine is switched off in this chat. Every other chat carries on as it is."
                : "Leave one chat completely alone while every other chat carries on."));
        return wrap;
    }
    function buildActivity() {
        const wrap = el("div", "arf-col");
        wrap.appendChild(rule());
        wrap.appendChild(heading("What it has been doing"));
        if (!activity.length) {
            wrap.appendChild(note("Nothing yet."));
            return wrap;
        }
        for (const a of activity) {
            const row = el("div", "arf-row arf-note");
            row.appendChild(el("span", "arf-when", new Date(a.at).toTimeString().slice(0, 5)));
            row.appendChild(el("span", "arf-said" + (a.good ? "" : " arf-dim"), a.text));
            wrap.appendChild(row);
        }
        return wrap;
    }
    // Read off the page at the moment it is asked for, so nothing is held between
    // replies.
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
            toast("No rules are written yet.", true);
            log("nothing to do: no rules are written yet");
            return;
        }
        busy = true;
        paint();
        send({
            type: "refine_now",
            requestId: newId(),
            chatId: lastChatId,
            messageId: lastMessageId,
        });
    }
    // ---- host events ----
    try {
        const offs = [
            ctx.events.on("CHAT_CHANGED", (p) => {
                if (!p)
                    return;
                lastChatId = p.chatId || null;
                lastMessageId = null;
                paint();
            }),
            ctx.events.on("CHAT_SWITCHED", (p) => {
                if (!p || typeof p.chatId === "undefined")
                    return;
                lastChatId = p.chatId || null;
                lastMessageId = null;
                paint();
            }),
            ctx.events.on("CHARACTER_MESSAGE_RENDERED", (p) => {
                if (!p)
                    return;
                if (p.chatId)
                    lastChatId = p.chatId;
                if (p.messageId)
                    lastMessageId = p.messageId;
                paint();
            }),
            ctx.events.on("USER_MESSAGE_RENDERED", (p) => {
                if (p && p.chatId)
                    lastChatId = p.chatId;
                paint();
            }),
            ctx.events.on("GENERATION_ENDED", (p) => {
                if (!p)
                    return;
                if (p.chatId)
                    lastChatId = p.chatId;
                if (p.messageId)
                    lastMessageId = p.messageId;
                if (cfg.enabled && cfg.refineOn && !p.error && !chatIsOff(p.chatId)) {
                    busy = true;
                    paint();
                }
            }),
        ];
        for (const o of offs)
            if (typeof o === "function")
                disposers.push(o);
    }
    catch (_) {
        log("could not listen for replies. Check that the generation permission is granted.");
    }
    // ---- backend messages ----
    try {
        if (ctx && typeof ctx.onBackendMessage === "function") {
            const off = ctx.onBackendMessage((msg) => {
                try {
                    if (!msg)
                        return;
                    if (msg.type === "backend_ready") {
                        armBackend();
                        send({ type: "list_connections", requestId: newId() });
                        return;
                    }
                    if (msg.type === "connections") {
                        connections = Array.isArray(msg.list) ? msg.list : [];
                        paint();
                        return;
                    }
                    if (msg.type === "refined") {
                        busy = false;
                        // A refine only happens in the chat the reader is in, so this is
                        // also the chat. Adopted when nothing else has said so yet, or the
                        // panel would hold a refine it could not show anybody.
                        if (msg.chatId != null && lastChatId == null)
                            lastChatId = msg.chatId;
                        if (msg.chatId != null && msg.canUndo)
                            undoable.set(String(msg.chatId), {
                                messageId: msg.messageId,
                                before: String(msg.before || ""),
                                after: String(msg.after || ""),
                            });
                        // The badge is the point of the tab being closable: something
                        // happened to your writing and you can see that without opening it.
                        setBadge("1");
                        log("refined a reply", true);
                        toast("Reply refined.");
                        return;
                    }
                    if (msg.type === "refine_skipped") {
                        busy = false;
                        log("left a reply alone: " + String(msg.why || "no reason given"));
                        return;
                    }
                    if (msg.type === "refine_result") {
                        busy = false;
                        if (msg.ok) {
                            log("refined a reply on request", true);
                            toast("Reply refined.", true);
                        }
                        else {
                            log("could not refine: " + String(msg.why || "no reason given"));
                            toast("Not refined: " + String(msg.why || "no reason given"), true);
                        }
                        paint();
                        return;
                    }
                    if (msg.type === "try_result") {
                        if (tryWaiting !== msg.requestId)
                            return;
                        tryWaiting = null;
                        tryBusy = false;
                        tryResult = msg.ok
                            ? { ok: true, text: String(msg.after || "") }
                            : {
                                ok: false,
                                text: "This would not have been saved: " +
                                    String(msg.why || "no reason given") +
                                    (msg.after ? "\n\nWhat came back:\n" + String(msg.after) : ""),
                            };
                        paint();
                        return;
                    }
                    if (msg.type === "undo_result") {
                        if (msg.ok) {
                            if (lastChatId != null)
                                undoable.delete(String(lastChatId));
                            setBadge(null);
                            log("put a reply back the way it was", true);
                            toast("Put back.", true);
                        }
                        else {
                            log("could not put it back: " + String(msg.why || "no reason given"));
                        }
                        paint();
                        return;
                    }
                    if (msg.type === "confirm_refine") {
                        busy = false;
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
    // The one modal in the extension, and it earns it: this is a question that
    // has to be answered before anything is written, which is exactly the moment
    // a modal is for. Everything else lives in the tab.
    function askToSave(msg) {
        try {
            if (!ctx.ui || typeof ctx.ui.showModal !== "function")
                return;
            const modal = ctx.ui.showModal({ title: "Save this refine?" });
            const root = modal.root;
            root.innerHTML = "";
            root.className = "arf";
            root.style.maxHeight = "70vh";
            root.style.overflowY = "auto";
            const pane = (title, text) => {
                root.appendChild(heading(title));
                root.appendChild(el("div", "arf-well", text));
            };
            pane("As it is now", String(msg.before || ""));
            pane("After the refine", String(msg.after || ""));
            const bar = el("div", "arf-row");
            const yes = button("Save it", true);
            const no = button("Leave it alone", false);
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
    try {
        if (ctx.ui && typeof ctx.ui.registerDrawerTab === "function") {
            tab = ctx.ui.registerDrawerTab({
                id: "auto-refine",
                title: "Auto Refine",
                shortName: "Refine",
                description: "Rewrite each reply to follow rules you write, and put one back if you disagree",
                // What the command palette searches, written for somebody who does not
                // already know the extension by name.
                keywords: ["refine", "rewrite", "polish", "edit", "prose", "style", "rules"],
                iconSvg: refineIcon(),
            });
            disposers.push(() => {
                try {
                    tab && tab.destroy && tab.destroy();
                }
                catch (_) { }
            });
        }
    }
    catch (_) { }
    injectStyle();
    armBackend();
    send({ type: "list_connections", requestId: newId() });
    log("ready v" + VERSION);
    paint();
    return () => {
        if (saveTimer) {
            clearTimeout(saveTimer);
            saveTimer = null;
        }
        for (const d of disposers.splice(0)) {
            try {
                d();
            }
            catch (_) { }
        }
        tab = null;
    };
}
// The defaults and the fields built from them, so a check can hold the two
// against each other. A setting in one and not the other looks fine and quietly
// never loads.
export const __testing = {
    CONFIG,
    COST_FIELDS,
    LIMIT_FIELDS,
    refineIcon,
    VERSION,
    // Pure, so a theme with a light accent can be checked without a browser.
    parseColor,
    blendColor,
    relLuminance,
    contrastRatio,
    betterInk,
    TEXT_FLOOR,
    FILL_FLOOR,
};
