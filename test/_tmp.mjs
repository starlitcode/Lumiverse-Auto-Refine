// Panel checks that need a real browser.
//
// The tab is styled entirely from the host's --lumiverse-* variables, which
// means it is drawn by a theme this repository has never seen. Nothing about
// that can be checked by reading a diff: whether a label is readable on somebody
// else's palette is a measurement, and so is whether the panel fits a phone.
// These drive the built dist/frontend.js in headless Chromium against a stub of
// the host and measure what was actually painted.
//
//   bun run test:ui
//
// Playwright is not a dependency of this project and should not become one: it
// pulls a few hundred megabytes of browsers, and the install path here is
// "Lumiverse clones the repo". If it is not present this skips and exits
// cleanly. To run it:
//
//   bun add -d playwright && bunx playwright install chromium
//
// Everything that can be checked without a browser is in `bun test`, which
// needs nothing extra.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
// The defaults, read from the panel's own source rather than copied here, so a
// setting added without one is caught instead of being described twice.
import { __testing } from "../src/frontend.ts";
// The settings a fresh install starts on, so a check against "the defaults" is
// reading the same numbers the panel has rather than a copy that goes stale.
const STOCK_DEFAULTS = __testing.CONFIG;

const { CONFIG, MACROS } = __testing;

const root = join(import.meta.dir, "..");

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch (_) {
  console.log(
    "playwright is not installed, skipping the browser checks.\n" +
      "  bun add -d playwright && bunx playwright install chromium",
  );
  process.exit(0);
}

const bundle = join(root, "dist", "frontend.js");
if (!existsSync(bundle)) {
  console.error("dist/frontend.js is missing. Run `bun run build` first.");
  process.exit(1);
}
const SOURCE = readFileSync(bundle, "utf8") + "\nwindow.__setup = setup;\n";

// Lumiverse's stock theme. A reader's theme overrides these, which is the whole
// reason the readability sweep exists, so the checks below run against this and
// against palettes built to break it.
const THEME = `:root{
--lumiverse-primary:rgba(147,112,219,.9);--lumiverse-primary-hover:rgba(167,132,239,.95);
--lumiverse-primary-text:rgba(186,135,255,.95);--lumiverse-secondary:rgba(128,128,128,.15);
--lumiverse-secondary-hover:rgba(128,128,128,.25);--lumiverse-secondary-border:rgba(128,128,128,.25);
--lumiverse-danger:#ef4444;--lumiverse-success:#22c55e;--lumiverse-bg:rgba(28,24,38,.95);
--lumiverse-bg-elevated:rgba(35,30,48,.9);--lumiverse-border:rgba(147,112,219,.12);
--lumiverse-text:rgba(255,255,255,.9);--lumiverse-text-muted:rgba(255,255,255,.65);
--lumiverse-radius-sm:5px;--lumiverse-radius:8px;--lumiverse-radius-md:10px;
--lumiverse-radius-lg:12px;--lumiverse-fill-subtle:rgba(0,0,0,.1);
--lumiverse-fill:rgba(0,0,0,.15);--lumiverse-transition:200ms ease;
--lumiverse-font-family:system-ui,sans-serif;--lumiverse-font-scale:1;--lumiverse-ui-scale:1;}
body{background:rgb(10,8,18);margin:0}
/* The drawer Lumiverse hands the tab. The width cap is what makes a narrow
   viewport mean anything: pinned wide, a 320px phone would still measure a
   wide panel and the page would scroll sideways to hold it. */
#drawer{background:rgb(35,30,48);width:380px;max-width:100%;padding:12px;box-sizing:border-box}`;

let failures = 0;
let ran = 0;
function ok(name, pass, detail) {
  ran++;
  if (pass) {
    console.log("  ok   " + name);
  } else {
    failures++;
    console.log("  FAIL " + name + (detail ? "\n         " + detail : ""));
  }
}

// Two frames, which is what the panel takes to build and then repair itself.
const settle = (page) =>
  page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );

// A row switched off closes over a few frames rather than going in one, the same
// way a deleted block does, so anything asking whether it is gone waits that out
// first. Long enough for the 240ms fold plus a frame either side.
const closed = async (page) => {
  await page.evaluate(() => new Promise((r) => setTimeout(r, 320)));
  await settle(page);
};

// Boots the extension in a page with the tab mounted, and hands the callback the
// page plus whatever the stub host recorded.
// The chat input as Lumiverse actually renders it, kept beside this file and
// copied from a running install rather than written here. A shape invented to
// match the selector being checked can only ever agree with itself: this one
// carries the action bar, the attachment input, the mirror div, the send button
// and the spindle mounts, so anything the real markup would trip over trips over
// this first.
const COMPOSER_HTML = readFileSync(join(root, "test", "input-area.html"), "utf8")
  .replace(/^<!--[\s\S]*?-->\s*/, "")
  .trim();

async function inTab(browser, { css = "", viewport, touch = false, saved = null, presets = null, setups = null, storage = null, noMenu = false, noConfirm = false } = {}, fn) {
  const page = await browser.newPage(
    viewport ? { viewport, hasTouch: touch, isMobile: touch } : {},
  );
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console: " + m.text());
  });

  // A real origin rather than about:blank, or localStorage throws and the
  // panel's saved settings cannot be set up at all.
  await page.route("http://lumiverse.test/", (r) =>
    r.fulfill({
      contentType: "text/html",
      body:
        '<!doctype html><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1">' +
        "<title>tab</title><div id=drawer></div>",
    }),
  );
  await page.goto("http://lumiverse.test/");
  await page.addStyleTag({ content: THEME + css });
  if (saved) {
    await page.evaluate((s) => {
      localStorage.setItem("lv-auto-refine:settings:v1", JSON.stringify(s));
    }, saved);
  }
  // Presets are read once on the way up, so anything wanting one already saved
  // has to put it there before the extension starts. Model setups are read the
  // same way, which is what lets a check start from one saved by an older
  // version.
  if (presets) {
    await page.evaluate((list) => {
      localStorage.setItem("lv-auto-refine:presets:v1", JSON.stringify(list));
    }, presets);
  }
  if (setups) {
    await page.evaluate((list) => {
      localStorage.setItem("lv-auto-refine:setups:v1", JSON.stringify(list));
    }, setups);
  }
  // Anything else the panel reads on the way up, as key and text.
  if (storage) {
    await page.evaluate((all) => {
      for (const k of Object.keys(all)) localStorage.setItem(k, all[k]);
    }, storage);
  }
  await page.addScriptTag({ content: SOURCE, type: "module" });
  await page.waitForFunction(() => !!window.__setup);
  await page.evaluate((html) => {
    window.__makeComposer = (text) => {
      const host = document.createElement("div");
      host.innerHTML = html;
      const area = host.firstElementChild;
      document.body.appendChild(area);
      // Inside the one just added, not the first on the page: a check that makes
      // a second input area was writing its text into the first and then asking
      // why the extension read an empty box.
      //
      // By name, not by tag: the real markup has a mirror div beside it and an
      // attachment input above it, and "the first textarea in there" would be a
      // guess that happens to be right today.
      const box = area.querySelector('textarea[name="chat-message"]');
      // The real box is sized by the app's own stylesheet, which is not here, so
      // it is given a size: the extension will not take a box with no box.
      box.style.width = "200px";
      box.style.height = "40px";
      box.value = text;
      return box;
    };
  }, COMPOSER_HTML);
  if (noMenu) await page.evaluate(() => { window.__noMenu = true; });
  // A Lumiverse with no confirm dialog of its own, which is what the armed
  // fallback is for.
  if (noConfirm) await page.evaluate(() => { window.__noConfirm = true; });

  await page.evaluate(() => {
    window.__sent = [];
    window.__handlers = {};
    window.__teardown = window.__setup({
      events: {
        on: (name, fn) => {
          (window.__handlers[name] = window.__handlers[name] || []).push(fn);
          return () => {};
        },
      },
      ui: {
        registerDrawerTab: (spec) => {
          window.__tabSpec = spec;
          const host = document.getElementById("drawer");
          return {
            root: host,
            setBadge: (v) => {
              window.__badge = v;
            },
            activate: () => {},
            destroy: () => {},
          };
        },
        // The host's own modal. It is a second thing on the screen, and a check
        // that wants to know whether two ever show at once has to be able to
        // see it.
        // The host's own confirm dialog. Recorded so a check can read what it
        // was asked, and answered with whatever the check set beforehand.
        ...(window.__noConfirm
          ? {}
          : {
              showConfirm: (spec) => {
                (window.__confirms = window.__confirms || []).push(spec);
                if (!window.__confirmLocks)
                  return Promise.resolve({ confirmed: window.__confirmSay !== false });
                // A host modal as one really behaves: it stops the page behind
                // it scrolling while it is up, which is done by stopping the
                // page scrolling at all, and lets go when it closes. The lock
                // sets the scroll to nought and letting go does not put it
                // back.
                const html = document.documentElement;
                html.style.overflow = "hidden";
                document.body.style.overflow = "hidden";
                return new Promise((r) =>
                  setTimeout(() => {
                    html.style.overflow = "";
                    document.body.style.overflow = "";
                    r({ confirmed: window.__confirmSay !== false });
                  }, 120),
                );
              },
            }),
        showModal: (spec) => {
          window.__modalSpec = spec || null;
          const host = document.createElement("div");
          host.id = "hostmodal";
          document.body.appendChild(host);
          return {
            root: host,
            onDismiss: () => {},
            dismiss: () => host.remove(),
          };
        },
        // Only present when a check asks for it. A host without it is a host
        // whose floating button has no menu, which is the case that decides
        // whether the Extras row hides for the button or stays put.
        ...(window.__noMenu
          ? {}
          : {
              showContextMenu: (spec) => {
                window.__menu = spec;
                return Promise.resolve({ selectedKey: window.__menuPick || null });
              },
            }),
        createFloatWidget: (spec) => {
          // Mounting a component costs the real host something, and a check
          // that wants to know whether the extension does host work in the
          // frame somebody clicked in has to be able to say so.
          window.__slowHost && window.__slowHost();
          const host = document.createElement("div");
          host.id = "float";
          // The host owns the box the button is drawn in, so what it was asked
          // for is the only place the size is observable.
          window.__widgetSpec = spec || null;
          host.style.width = ((spec && spec.width) || 0) + "px";
          host.style.height = ((spec && spec.height) || 0) + "px";
          document.body.appendChild(host);
          window.__widget = true;
          return {
            root: host,
            destroy: () => {
              window.__slowHost && window.__slowHost();
              window.__widget = false;
              host.remove();
            },
          };
        },
        registerInputBarAction: (spec) => {
          // There is more than one of these now, so they are kept by id.
          // __inputAction stays as "is there a row at all", which is what the
          // checks about the row appearing and going away are asking.
          window.__inputActions = window.__inputActions || {};
          window.__inputActions[spec.id] = spec;
          window.__inputAction = spec;
          return {
            onClick: (fn) => {
              window.__inputClicks = window.__inputClicks || {};
              window.__inputClicks[spec.id] = fn;
              // The one that rewrites what you are typing, which the older
              // checks reach for by name.
              if (spec.id === "auto-refine-input") window.__inputClick = fn;
              return () => {};
            },
            destroy: () => {
              delete window.__inputActions[spec.id];
              const left = Object.keys(window.__inputActions);
              window.__inputAction = left.length ? window.__inputActions[left[0]] : null;
            },
          };
        },
      },
      // Lumiverse's notifications come from an extension's server side, and the
      // page has no way to show one itself, so the stub has none either. What
      // the panel asks the backend to show is kept as __toasts.
      sendToBackend: (m) => {
        window.__sent.push(m);
        if (m && m.type === "notify") (window.__toasts = window.__toasts || []).push(m.text);
      },
      onBackendMessage: (fn) => {
        window.__fromBackend = fn;
        return () => {};
      },
    });
  });
  await page.waitForFunction(() => document.querySelectorAll("#drawer .arf-tab").length > 0);
  // The readability sweep runs a frame after the panel is built, so anything
  // measuring what was painted has to let that frame happen first.
  await settle(page);

  try {
    await fn(page, errors);
  } finally {
    await page.close();
  }
  return errors;
}

// Move to a named tab. Everything below lives on one, so nearly every check
// starts here.
async function goTab(page, label) {
  await page.evaluate((want) => {
    const t = Array.from(document.querySelectorAll("#drawer .arf-tab")).find(
      (b) => b.textContent.trim() === want,
    );
    if (!t) throw new Error("no tab called " + want);
    t.click();
  }, label);
  await settle(page);
}

// Whether a setting is on the card to be used. A row that hangs off a switch is
// built either way and hidden when the switch is off, so being in the tree is
// not the question; being drawn is.
async function onScreen(page, key) {
  return page.evaluate((k) => {
    const box = document.querySelector('#drawer [data-arf-field="' + k + '"]');
    return !!box && !!box.offsetParent;
  }, key);
}

// What the sweep had to repair.
async function repaired(page) {
  return page.evaluate(() =>
    document.querySelectorAll('#drawer [data-arf-painted="ink"]').length,
  );
}

// Every repair, measured against what the line looked like before it. A panel
// that repaints healthy colours is overriding a theme it should be inheriting,
// and this is how that shows: the inline colour is lifted off, the line is
// measured as the theme drew it, and anything that was already above its own
// floor should never have been touched.
//
// This replaced a check that the stock theme is repaired nought times. That was
// true only while the floor was the large-text one applied to everything; the
// stock theme does put a 12px button label at 4.33, and repairing it is the
// sweep doing its job, not overreaching.
async function overreached(page) {
  return page.evaluate(() => {
    const parse = (s) => {
      const m = /rgba?\(([^)]+)\)/.exec(s || "");
      if (!m) return null;
      const p = m[1].split(",").map((x) => parseFloat(x.trim()));
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    };
    const over = (f, b) => ({
      r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a),
      b: f.b * f.a + b.b * (1 - f.a), a: 1,
    });
    const lum = (c) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const backdrop = (node) => {
      const stack = []; let el = node;
      while (el && el !== document.documentElement) {
        const c = parse(getComputedStyle(el).backgroundColor);
        if (c && c.a > 0) { stack.push(c); if (c.a >= 0.999) break; }
        el = el.parentElement;
      }
      let base = { r: 255, g: 255, b: 255, a: 1 };
      const pg = parse(getComputedStyle(document.body).backgroundColor);
      if (pg && pg.a >= 0.999) base = pg;
      for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base);
      return base;
    };
    const out = [];
    for (const el of document.querySelectorAll('#drawer [data-arf-painted="ink"]')) {
      const put = el.style.color;
      el.style.color = "";
      const st = getComputedStyle(el);
      const fg = parse(st.color);
      const px = parseFloat(st.fontSize) || 16;
      const big = px >= 24 || ((parseInt(st.fontWeight, 10) || 400) >= 700 && px >= 18.66);
      const floor = big ? 3 : 4.5;
      const bg = backdrop(el);
      const was = fg ? ratio(over(fg, bg), bg) : 0;
      el.style.color = put;
      if (was >= floor)
        out.push((el.className || el.tagName) + " was already " + was.toFixed(2) + " against " + floor);
    }
    return out;
  });
}

// The measured contrast of every visible text node against what is behind it.
// The mark on the floating button, measured against what is actually behind it.
//
// worstText walks text nodes, and the button has none: its mark is an SVG drawn
// in currentColor. So the one part of this extension that sits over somebody
// else's chat, in their theme, has never been measured at all. A colour change
// could have taken it to nothing and every check would have stayed green.
//
// Held to 3, which is what the standard asks of a graphic rather than the 4.5
// it asks of body text.
async function markContrast(page, sel) {
  return page.evaluate((q) => {
    const parse = (str) => {
      const m = /rgba?\(([^)]+)\)/.exec(str || "");
      if (!m) return null;
      const p = m[1].split(",").map((x) => parseFloat(x.trim()));
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    };
    const over = (fg, bg) => ({
      r: fg.r * fg.a + bg.r * (1 - fg.a),
      g: fg.g * fg.a + bg.g * (1 - fg.a),
      b: fg.b * fg.a + bg.b * (1 - fg.a),
      a: 1,
    });
    const lum = (c) => {
      const f = (v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const ratio = (a, b) => {
      const x = lum(a);
      const y = lum(b);
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };
    const btn = document.querySelector(q);
    if (!btn) return null;
    // What is behind the mark: the button's own fill composited over whatever
    // is under it, since a fill with alpha in it shows the page through.
    let stack = [];
    let el = btn;
    while (el && el !== document.documentElement) {
      const c = parse(getComputedStyle(el).backgroundColor);
      if (c && c.a > 0) {
        stack.push(c);
        if (c.a >= 0.999) break;
      }
      el = el.parentElement;
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    const page = parse(getComputedStyle(document.body).backgroundColor);
    if (page && page.a >= 0.999) base = page;
    for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base);
    const ink = parse(getComputedStyle(btn).color);
    if (!ink) return null;
    return { r: Math.round(ratio(over(ink, base), base) * 100) / 100, want: 3 };
  }, sel);
}

async function worstText(page) {
  return page.evaluate(() => {
    const parse = (s) => {
      const m = /rgba?\(([^)]+)\)/.exec(s || "");
      if (!m) return null;
      const p = m[1].split(",").map((x) => parseFloat(x.trim()));
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    };
    const over = (fg, bg) => ({
      r: fg.r * fg.a + bg.r * (1 - fg.a),
      g: fg.g * fg.a + bg.g * (1 - fg.a),
      b: fg.b * fg.a + bg.b * (1 - fg.a),
      a: 1,
    });
    const lum = (c) => {
      const f = (v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const ratio = (a, b) => {
      const l1 = lum(a);
      const l2 = lum(b);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };
    // What is actually behind a node: the first ancestor painting an opaque
    // background, composited down. A transparent panel over a dark page reads
    // as the page, and measuring against "transparent" is how a check comes
    // back with a meaningless number.
    const backdrop = (node) => {
      let stack = [];
      let el = node;
      while (el && el !== document.documentElement) {
        const c = parse(getComputedStyle(el).backgroundColor);
        if (c && c.a > 0) {
          stack.push(c);
          if (c.a >= 0.999) break;
        }
        el = el.parentElement;
      }
      let base = { r: 255, g: 255, b: 255, a: 1 };
      const pageBg = parse(getComputedStyle(document.body).backgroundColor);
      if (pageBg && pageBg.a >= 0.999) base = pageBg;
      for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base);
      return base;
    };

    // Against each line's own floor, not one number for the panel. 4.5 is what
    // the standard asks of body text and 3 is the concession for large text,
    // and reading a 12px label against the large-text figure is how text at
    // 3.77 was called readable while somebody was telling us it was not.
    let worst = 99;
    let where = "";
    let want = 4.5;
    let short = 99;
    const nodes = document.querySelectorAll("#drawer *");
    for (const el of nodes) {
      const text = Array.from(el.childNodes).some(
        (n) => n.nodeType === 3 && n.textContent.trim(),
      );
      if (!text) continue;
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      const st = getComputedStyle(el);
      const fg = parse(st.color);
      if (!fg) continue;
      const px = parseFloat(st.fontSize) || 16;
      const big = px >= 24 || ((parseInt(st.fontWeight, 10) || 400) >= 700 && px >= 18.66);
      const floor = big ? 3 : 4.5;
      const bg = backdrop(el);
      const r = ratio(over(fg, bg), bg);
      // The furthest short of what it needs, so a heading at 3.1 does not hide
      // a 12px hint at 4.4.
      if (r / floor < short) {
        short = r / floor;
        worst = r;
        want = floor;
        where =
          (el.className || el.tagName) + " at " + px + "px: " + el.textContent.trim().slice(0, 40);
      }
    }
    return { worst: worst, want: want, where: where, ok: worst >= want };
  });
}


// Where Chromium actually is.
//
// Left to itself Playwright looks under its own download directory for a build
// named the way it would have downloaded it, and an image that carries a browser
// under any other name sends it to a path that does not exist. So the
// environment's own copy is looked for first, and CHROMIUM_PATH still wins.
function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  const inside = [
    "chrome-linux/chrome",
    "chrome-linux64/chrome",
    "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
    "chrome-win/chrome.exe",
  ];
  try {
    for (const dir of readdirSync(root)) {
      if (!/^chromium(-|$)/.test(dir)) continue;
      for (const rel of inside) {
        const p = join(root, dir, rel);
        if (existsSync(p)) return p;
      }
    }
  } catch (_) {}
  return undefined;
}

const chromePath = findChromium();
let browser;
try {
  browser = await chromium.launch({ executablePath: chromePath });
} catch (e) {
  const why = String((e && e.message) || e).split("\n")[0];
  // A browser that is there and will not start is a failure, not a skip.
  // Exiting 0 on that turns a red run green and nobody finds out.
  if (chromePath) {
    console.error("chromium is at " + chromePath + " and would not start:\n  " + why);
    process.exit(1);
  }
  console.log(
    "no browser to run against, skipping the browser checks.\n" +
      "  bunx playwright install chromium   (or set CHROMIUM_PATH)\n" +
      "  " + why,
  );
  process.exit(0);
}

console.log("\nthe switch knob springs");
{
  // The knob slides a little past its end and springs back, and stretches
  // while pressed. With Reduce motion on it does neither.
  for (const reduceMotion of [false, true]) {
    await inTab(browser, { saved: { enabled: true, reduceMotion } }, async (page) => {
      await goTab(page, "Setup");
      await settle(page);
      const got = await page.evaluate(() => {
        const box = document.querySelector("#drawer .arf-box");
        const cs = getComputedStyle(box, "::after");
        const names = cs.transitionProperty.split(",").map((x) => x.trim());
        const timing = cs.transitionTimingFunction.split(/,(?![^(]*\))/).map((x) => x.trim());
        const curve = timing[names.indexOf("left")] || "";
        const m = /cubic-bezier\(([^)]*)\)/.exec(curve);
        const over = !!m && m[1].split(",").map(Number).some((v, i) => (i === 1 || i === 3) && v > 1);
        return { names, curve, over, duration: cs.transitionDuration };
      });
      if (!reduceMotion) ok("the knob overshoots its end and springs back", got.over, JSON.stringify(got));
      else ok("with Reduce motion on, the knob does not move", !/[1-9]/.test(got.duration.replace(/0s/g, "")), JSON.stringify(got));
    });
  }
}

console.log("\na pattern behind the panel");
{
  // None by default. A pattern chosen in Setup is drawn behind the panel, and
  // the cards and the tab strip turn solid so nothing is read across it.
  await inTab(browser, { saved: { enabled: true } }, async (page) => {
    const plain = await page.evaluate(() => document.querySelector("#drawer").hasAttribute("data-arf-pattern"));
    ok("by default there is no pattern", plain === false);
  });
  for (const [label, viewport, touch] of [["phone", { width: 390, height: 800 }, true], ["laptop", { width: 1280, height: 800 }, false]]) {
    for (const kind of ["diamonds", "stripes", "dots"]) {
      await inTab(browser, { viewport, touch, saved: { enabled: true, panelPattern: kind } }, async (page) => {
        await goTab(page, "Setup");
        await settle(page);
        const got = await page.evaluate(() => {
          const root = document.querySelector("#drawer");
          const card = root.querySelector(".arf-card");
          const tabs = root.querySelector(".arf-tabs");
          return {
            kind: root.getAttribute("data-arf-pattern"),
            drawn: /gradient/.test(getComputedStyle(root).backgroundImage),
            cardSolid: /^rgb\(/.test(getComputedStyle(card).backgroundColor),
            tabsSolid: /^rgb\(/.test(getComputedStyle(tabs).backgroundColor),
            sideways: document.documentElement.scrollWidth > window.innerWidth + 1,
          };
        });
        ok(label + ", " + kind + ": the pattern is drawn", got.kind === kind && got.drawn, JSON.stringify(got));
        ok(label + ", " + kind + ": the cards and the tab strip are solid over it", got.cardSolid && got.tabsSolid, JSON.stringify(got));
        ok(label + ", " + kind + ": nothing runs off the side", !got.sideways, "");
      });
    }
  }
}

console.log("\nthe tabs stay at the top");
{
  // The drawer scrolls on its own, as it does in Lumiverse. The tab strip has
  // to stay at the top of it while the tab scrolls, and be back in its own
  // place once the tab is scrolled back up. The search box scrolls away with
  // the rest. At rest nothing is drawn behind the strip. Held at the top, the
  // strip itself is solid, so the rows going under it do not show through.
  const SCROLLS = "#drawer{height:520px;overflow-y:auto}";
  for (const [label, viewport, touch] of [["phone", { width: 390, height: 760 }, true], ["laptop", { width: 1280, height: 900 }, false]]) {
    await inTab(browser, { css: SCROLLS, viewport, touch, saved: { enabled: true } }, async (page) => {
      await goTab(page, "Prompt");
      const got = await page.evaluate(async () => {
        const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const drawer = document.getElementById("drawer");
        const bar = () => drawer.querySelector("[data-arf-stick]");
        const strip = () => bar().querySelector(".arf-tabs");
        const where = () => Math.round(bar().getBoundingClientRect().top - drawer.getBoundingClientRect().top);
        const pad = Math.round(parseFloat(getComputedStyle(drawer).paddingTop) || 0);
        const clear = (c) => c === "transparent" || /rgba\([^)]*,\s*0\)$/.test(c);
        // The solid colour is a layer under the tabs, shown when it is fully on.
        const layer = () => getComputedStyle(strip(), "::before");
        const filled = () => /^rgb\(/.test(layer().backgroundColor) && layer().opacity === "1";
        const rest = where();
        const restHolder = getComputedStyle(bar()).backgroundColor;
        const restStuck = bar().classList.contains("arf-stuck");
        const restStrip = getComputedStyle(strip()).backgroundColor;
        const room = drawer.scrollHeight - drawer.clientHeight;
        drawer.scrollTop = drawer.scrollHeight;
        await frame();
        // Caught at the top, the colour fades in rather than switching on.
        const fadingIn = Number(layer().opacity);
        await new Promise((r) => setTimeout(r, 350));
        const atTop = where();
        const hasTabs = !!bar().querySelector(".arf-tab") && !bar().querySelector('input[type="search"]');
        const r = strip().getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 2);
        const covers = !!hit && strip().contains(hit);
        const heldSolid = filled();
        const heldStuck = bar().classList.contains("arf-stuck");
        drawer.scrollTop = 0;
        await frame();
        const back = where();
        const backStuck = bar().classList.contains("arf-stuck");
        // Back in its place, the colour fades out rather than going in one frame.
        const fading = Number(layer().opacity);
        await new Promise((r) => setTimeout(r, 400));
        const faded = Number(layer().opacity);
        const backStrip = getComputedStyle(strip()).backgroundColor;
        return { pad, rest, restHolder: clear(restHolder), restStuck, restStrip, room, atTop, hasTabs, covers, heldSolid, heldStuck, fadingIn, back, backStuck, fading, faded, backSame: backStrip === restStrip, sideways: document.documentElement.scrollWidth > window.innerWidth + 1 || drawer.scrollWidth > drawer.clientWidth + 1 };
      });
      ok(label + ": the tab is long enough to scroll", got.room > 300, JSON.stringify(got));
      ok(label + ": at rest nothing is drawn behind the strip", got.restHolder && !got.restStuck, JSON.stringify(got));
      ok(label + ": scrolled down, the strip sits at the top of the drawer", got.atTop === got.pad, JSON.stringify(got));
      ok(label + ": and it holds the tabs, not the search box", got.hasTabs, JSON.stringify(got));
      ok(label + ": caught at the top, the solid colour fades in instead of switching on in one frame", got.fadingIn < 1, JSON.stringify(got));
      ok(label + ": held there, the strip is solid, so nothing shows through it", got.heldStuck && got.heldSolid && got.covers, JSON.stringify(got));
      ok(label + ": scrolled back up, the solid colour fades out instead of going in one frame", got.fading > 0 && got.fading < 1, JSON.stringify(got));
      ok(label + ": scrolled back up, it is in its own place and looks as it did", got.back === got.rest && got.rest > 0 && !got.backStuck && got.backSame && got.faded === 0, JSON.stringify(got));
      ok(label + ": nothing scrolls sideways", !got.sideways, "");
    });
    // Away to another drawer tab and back. The host hides the panel and shows
    // it again with the scroll where it was, and no scroll event comes. A
    // repaint while it was hidden measured nothing, which is what leaves the
    // strip held at the top with nothing behind it.
    await inTab(browser, { css: SCROLLS, viewport, touch, saved: { enabled: true } }, async (page) => {
      await goTab(page, "Log");
      const got = await page.evaluate(async () => {
        const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const drawer = document.getElementById("drawer");
        const bar = () => drawer.querySelector("[data-arf-stick]");
        drawer.scrollTop = drawer.scrollHeight;
        await frame();
        const before = bar().classList.contains("arf-stuck");
        const top = drawer.scrollTop;
        // From here on no scroll event reaches the panel, as when the host
        // puts the scroll back itself.
        const swallow = (e) => e.stopImmediatePropagation();
        window.addEventListener("scroll", swallow, true);
        drawer.style.display = "none";
        await frame();
        bar().classList.remove("arf-stuck");
        drawer.style.display = "";
        drawer.scrollTop = top;
        await frame();
        await new Promise((r) => setTimeout(r, 100));
        window.removeEventListener("scroll", swallow, true);
        return { before, after: bar().classList.contains("arf-stuck"), scrolled: drawer.scrollTop > 0 };
      });
      ok(label + ": back from another tab, the strip held at the top is solid again", got.before && got.scrolled && got.after, JSON.stringify(got));
    });
    // The fill starts once the search box has scrolled away and the strip is
    // held, and not before: at rest, one strip height short of the top, and two
    // pixels short, it is not filled, whether the drawer is moving or still.
    // Two browsers: one that can tell by itself that the strip is held, and one
    // that cannot, which is Safari and Firefox and is made here by taking the
    // stylesheet's check away.
    const NO_CHECK = "#drawer .arf-stick{container-type:normal!important}";
    for (const [which, css] of [["with the browser's own check", SCROLLS], ["without it", SCROLLS + NO_CHECK]]) {
      await inTab(browser, { css, viewport, touch, saved: { enabled: true } }, async (page) => {
        await goTab(page, "Prompt");
        const got = await page.evaluate(async () => {
          const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          const drawer = document.getElementById("drawer");
          const bar = () => drawer.querySelector("[data-arf-stick]");
          const strip = () => bar().querySelector(".arf-tabs");
          const solid = () => {
            const layer = getComputedStyle(strip(), "::before");
            return /^rgb\(/.test(layer.backgroundColor) && Number(layer.opacity) > 0;
          };
          const where = () => bar().getBoundingClientRect().top - drawer.getBoundingClientRect().top;
          const pad = parseFloat(getComputedStyle(drawer).paddingTop) || 0;
          const rest = where();
          const restSolid = solid();
          const at = (gap) => {
            drawer.scrollTop = rest - pad - gap;
          };
          at(bar().offsetHeight);
          await frame();
          const near = { gap: Math.round(where() - pad), moving: solid() };
          await new Promise((r) => setTimeout(r, 400));
          near.still = solid();
          at(2);
          await frame();
          const edge = { gap: Math.round(where() - pad), moving: solid() };
          await new Promise((r) => setTimeout(r, 400));
          edge.still = solid();
          drawer.scrollTop = drawer.scrollHeight;
          await frame();
          await new Promise((r) => setTimeout(r, 350));
          const held = { gap: Math.round(where() - pad), solid: solid() };
          // A repaint while held. The strip is a new element, read before the
          // next frame.
          const old = bar();
          drawer.querySelector(".arf-tab[aria-selected='true']").click();
          const fresh = bar() !== old;
          const repaintSolid = solid();
          return { restSolid, near, edge, held, fresh, repaintSolid };
        });
        ok(label + ", " + which + ": at rest the strip is not filled", !got.restSolid, JSON.stringify(got));
        ok(label + ", " + which + ": one strip height short of the top, it is not filled, moving or still", got.near.gap > 20 && !got.near.moving && !got.near.still, JSON.stringify(got.near));
        ok(label + ", " + which + ": two pixels short of the top, it is not filled either", got.edge.gap > 0 && got.edge.gap <= 3 && !got.edge.moving && !got.edge.still, JSON.stringify(got.edge));
        ok(label + ", " + which + ": held at the top, it is filled", got.held.gap === 0 && got.held.solid, JSON.stringify(got.held));
        ok(label + ", " + which + ": a repaint while it is held keeps it solid", got.fresh && got.repaintSolid, JSON.stringify(got));
      });
    }
    // The browser's own check alone, with the script's classes taken off the
    // moment they are put on. Without the check the strip goes see-through,
    // which shows the classes really were kept off.
    for (const [which, css, want] of [["the browser's own check", SCROLLS, true], ["no check and no script", SCROLLS + NO_CHECK, false]]) {
      await inTab(browser, { css, viewport, touch, saved: { enabled: true } }, async (page) => {
        await goTab(page, "Prompt");
        const got = await page.evaluate(async () => {
          const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          const drawer = document.getElementById("drawer");
          const bar = drawer.querySelector("[data-arf-stick]");
          const strip = bar.querySelector(".arf-tabs");
          // Only when one is there: remove() writes the attribute even when it
          // changes nothing, and the observer would then call itself forever.
          const strike = () => {
            if (bar.classList.contains("arf-stuck")) bar.classList.remove("arf-stuck");
          };
          const mo = new MutationObserver(strike);
          mo.observe(bar, { attributes: true, attributeFilter: ["class"] });
          drawer.scrollTop = drawer.scrollHeight;
          await frame();
          await frame();
          await new Promise((r) => setTimeout(r, 350));
          strike();
          const layer = getComputedStyle(strip, "::before");
          const solid = /^rgb\(/.test(layer.backgroundColor) && layer.opacity === "1";
          const classes = bar.className;
          mo.disconnect();
          return { solid, classes, scrolled: drawer.scrollTop > 0 };
        });
        ok(label + ", " + which + ": held at the top, " + (want ? "the strip is solid" : "the strip is see-through"), got.scrolled && got.solid === want && !/arf-stuck/.test(got.classes), JSON.stringify(got));
      });
    }
  }
}

await browser.close();

console.log("\n" + (ran - failures) + " of " + ran + " checks passed");
if (failures) process.exit(1);
