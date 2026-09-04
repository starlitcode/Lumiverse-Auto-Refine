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

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

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

// Boots the extension in a page with the tab mounted, and hands the callback the
// page plus whatever the stub host recorded.
// The chat input as Lumiverse renders it: a textarea named chat-message inside
// the input area, with the mirror div beside it that measures its height and is
// not a textarea. Built here so the checks look for the box the extension looks
// for, rather than for a shape invented to match a selector.
const COMPOSER_HTML =
  '<div data-component="InputArea">' +
  '<div class="_inputRow"><div class="_inputWrapper">' +
  '<div class="_textareaMirror" aria-hidden="true">&#8203;</div>' +
  '<textarea name="chat-message" aria-label="Message" rows="1" ' +
  'style="width:200px;height:40px"></textarea>' +
  "</div></div></div>";

async function inTab(browser, { css = "", viewport, touch = false, saved = null, noMenu = false } = {}, fn) {
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
  await page.addScriptTag({ content: SOURCE, type: "module" });
  await page.waitForFunction(() => !!window.__setup);
  await page.evaluate((html) => {
    window.__makeComposer = (text) => {
      const host = document.createElement("div");
      host.innerHTML = html;
      document.body.appendChild(host.firstElementChild);
      const box = document.querySelector('[data-component="InputArea"] textarea');
      box.value = text;
      return box;
    };
  }, COMPOSER_HTML);
  if (noMenu) await page.evaluate(() => { window.__noMenu = true; });

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
        toast: (t) => {
          (window.__toasts = window.__toasts || []).push(t);
        },
        // The host's own modal. It is a second thing on the screen, and a check
        // that wants to know whether two ever show at once has to be able to
        // see it.
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
      sendToBackend: (m) => window.__sent.push(m),
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

// Playwright can be importable while the browser it wants is not downloaded, so
// a failed launch is a skip too rather than a red run. CHROMIUM_PATH points it
// at a browser you already have instead of one it manages.
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
} catch (e) {
  console.log(
    "no browser to run against, skipping the browser checks.\n" +
      "  bunx playwright install chromium   (or set CHROMIUM_PATH)\n" +
      "  " +
      String((e && e.message) || e).split("\n")[0],
  );
  process.exit(0);
}

console.log("\nthe tab as the host mounts it");
{
  const errors = await inTab(browser, {}, async (page) => {
    const spec = await page.evaluate(() => window.__tabSpec);
    ok("it registers a drawer tab and nothing else", !!spec && spec.id === "auto-refine");
    ok(
      "the tab carries an icon and palette keywords",
      !!spec.iconSvg && Array.isArray(spec.keywords) && spec.keywords.length > 3,
    );
    const armed = await page.evaluate(() =>
      window.__sent.filter((m) => m.type === "set_settings").length,
    );
    ok("it tells the backend its settings on the way up", armed > 0);
  });
  ok("no errors in the console", errors.length === 0, errors.join("\n         "));
}

console.log("\ncolour on somebody else's theme");
{
  await inTab(browser, {}, async (page) => {
    const over = await overreached(page);
    ok(
      "the stock theme is inherited, and only what fails is repainted",
      over.length === 0,
      over.join("; "),
    );
    const m = await worstText(page);
    ok(
      "every label is readable as painted",
      m.ok,
      "worst was " + m.worst.toFixed(2) + " against " + m.want + " on " + m.where,
    );
  });

  // Muted text at a tenth of its usual strength. Nothing here is wrong with the
  // panel: it is a theme that has made its own text invisible, and the sweep is
  // what puts it back.
  const cruel = ":root{--lumiverse-text-muted:rgba(255,255,255,.1);" +
    "--lumiverse-text:rgba(255,255,255,.2)}";
  await inTab(browser, { css: cruel }, async (page) => {
    const fixed = await repaired(page);
    ok("a theme that hides its own text is repaired", fixed > 0, "repainted " + fixed);
    const m = await worstText(page);
    ok(
      "and the result is readable",
      m.ok,
      "worst was " + m.worst.toFixed(2) + " against " + m.want + " on " + m.where,
    );
  });

  // A theme whose accent is light, which is where a filled button goes wrong.
  //
  // The loud button used to be the accent at full strength with its label
  // hardcoded white, which on a light accent is white on lavender. The contrast
  // sweep rescued it a moment after every repaint, and a rescue that has to
  // happen on a timer is a rescue that can be seen happening: the label read
  // correct, then white, then correct. So the check is not that it ends up
  // readable, it is that nothing had to touch it.
  const paleAccent =
    ":root{--lumiverse-primary:#e8d0ff;--lumiverse-primary-hover:#f0e0ff;" +
    "--lumiverse-primary-text:#e0c4ff;--lumiverse-primary-020:rgba(232,208,255,.2);" +
    "--lumiverse-primary-050:rgba(232,208,255,.5)}";
  const loudButton = (page) =>
    page.evaluate(() => {
      const el = document.querySelector("#drawer .arf-primary");
      const quiet = [...document.querySelectorAll("#drawer .arf-btn")].find(
        (n) => !n.classList.contains("arf-primary") && !n.classList.contains("arf-danger"),
      );
      if (!el || !quiet) return null;
      const a = getComputedStyle(el);
      const b = getComputedStyle(quiet);
      return {
        inline: el.style.color,
        painted: el.getAttribute("data-arf-painted"),
        fill: a.backgroundColor,
        ink: a.color,
        quietFill: b.backgroundColor,
        quietInk: b.color,
        weight: a.fontWeight,
      };
    });

  await inTab(browser, { css: paleAccent }, async (page) => {
    const b = await loudButton(page);
    ok("the loud button is readable on a light accent without being repaired",
      !!b && !b.inline && !b.painted, JSON.stringify(b));
    // Readable was bought once by tinting it, which cost it its loudness: it
    // came out looking like every other button on the panel. It has to be both.
    ok("and still looks nothing like the quiet ones",
      !!b && b.fill !== b.quietFill && b.ink !== b.quietInk, JSON.stringify(b));
    const m = await worstText(page);
    ok(
      "and nothing else on the panel needs rescuing either",
      m.ok,
      "worst was " + m.worst.toFixed(2) + " against " + m.want + " on " + m.where,
    );
  });

  // A light theme, which is where a panel written dark-first goes wrong.
  const light =
    ":root{--lumiverse-bg:#fff;--lumiverse-bg-elevated:#f4f2f8;" +
    "--lumiverse-text:rgba(0,0,0,.9);--lumiverse-text-muted:rgba(0,0,0,.55);" +
    "--lumiverse-fill:rgba(0,0,0,.05)}body{background:#fff}#drawer{background:#fff}";
  await inTab(browser, { css: light }, async (page) => {
    const scheme = await page.evaluate(
      () => getComputedStyle(document.querySelector("#drawer .arf, #drawer")).colorScheme,
    );
    ok("the browser is told the panel is light", /light/.test(scheme), "colorScheme was " + scheme);
    const m = await worstText(page);
    ok(
      "and the text is readable on it",
      m.ok,
      "worst was " + m.worst.toFixed(2) + " against " + m.want + " on " + m.where,
    );
  });
}

console.log("\non a phone");
{
  await inTab(
    browser,
    { viewport: { width: 320, height: 680 }, touch: true },
    async (page) => {
      const width = await page.evaluate(
        () => document.getElementById("drawer").getBoundingClientRect().width,
      );
      ok("the panel fits the screen", width <= 320, "measured " + Math.round(width) + "px");
      const spill = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      );
      ok("and nothing pushes the page sideways", spill);

      // The densest tab, with its fold open, which is where a tap target is
      // most likely to have been squeezed.
      await goTab(page, "Model");
      await page.evaluate(() => {
        for (const b of document.querySelectorAll("#drawer .arf-fold")) b.click();
      });
      await settle(page);
      const small = await page.evaluate(() => {
        const bad = [];
        for (const el of document.querySelectorAll("#drawer button, #drawer input, #drawer select")) {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          if (r.height < 22) bad.push((el.textContent || el.type || el.tagName) + " " + Math.round(r.height));
        }
        return bad;
      });
      ok("every control is big enough to tap", small.length === 0, small.join(", "));
    },
  );
}

console.log("\nthe prompt layout editor");
{
  const errors = await inTab(browser, {}, async (page) => {
    await goTab(page, "Prompt");
    const names = () =>
      page.evaluate(() =>
        Array.from(
          document.querySelectorAll('#drawer [data-arf-block] [data-arf-field^="blockname:"]'),
        ).map((n) => n.value),
      );
    const before = await names();
    ok("every block in the prompt is listed", before.length >= 6, before.join(" | "));

    const holds = await page.evaluate(() =>
      Array.from(document.querySelectorAll("#drawer [data-arf-block]")).some((b) =>
        /holds the turn/.test(b.textContent),
      ),
    );
    ok("the block carrying the turn is marked as such", holds);

    // Move the second block up and see the order actually change.
    await page.evaluate(() => {
      const ups = Array.from(document.querySelectorAll('#drawer button[aria-label^="Move up"]'));
      ups[1].click();
    });
    const after = await names();
    ok("moving a block up reorders the list", after[0] === before[1], after.join(" | "));

    const sent = await page.evaluate(() => {
      const last = window.__sent.filter((m) => m.type === "set_settings").pop();
      return last && last.settings && last.settings.blocks ? last.settings.blocks : [];
    });
    ok(
      "and the new order goes to the backend, with the text",
      sent.length >= 6 && sent.some((b) => (b.text || "").indexOf("{{message}}") >= 0),
      sent.map((b) => b.id).join(","),
    );

    // A new block lands above the turn: anything after the message reads as an
    // instruction about it.
    await page.evaluate(() => {
      const add = Array.from(document.querySelectorAll("#drawer button")).find((b) =>
        /^Add a block$/.test(b.textContent.trim()),
      );
      add.click();
    });
    const own = await page.evaluate(() => {
      const last = window.__sent.filter((m) => m.type === "set_settings").pop();
      const at = last.settings.blocks.findIndex((b) => b.id.indexOf("own-") === 0);
      const turnAt = last.settings.blocks.findIndex(
        (b) => (b.text || "").indexOf("{{message}}") >= 0,
      );
      return { at: at, turnAt: turnAt };
    });
    ok("a new block lands above the turn", own.at >= 0 && own.at < own.turnAt, JSON.stringify(own));

    await page.evaluate(() => {
      const reset = Array.from(document.querySelectorAll("#drawer button")).find((b) =>
        /^Back to the default$/.test(b.textContent.trim()),
      );
      reset.click();
    });
    const back = await names();
    ok("and going back to the default restores it", back.join("|") === before.join("|"));

    // The one mistake the editor makes possible, and it must be loud.
    await page.evaluate(() => {
      const boxes = Array.from(
        document.querySelectorAll('#drawer [data-arf-field^="blocktext:"]'),
      );
      for (const ta of boxes) {
        if (ta.value.indexOf("{{message}}") < 0) continue;
        ta.value = "nothing here any more";
        ta.dispatchEvent(new Event("input", { bubbles: true }));
        ta.dispatchEvent(new Event("blur", { bubbles: true }));
      }
    });
    await settle(page);
    const shouted = await page.evaluate(
      () =>
        !!document.querySelector("#drawer .arf-bad") &&
        /\{\{message\}\}/.test(document.querySelector("#drawer .arf-body").textContent),
    );
    ok("a prompt with no {{message}} says so in the danger colour", shouted);
  });
  ok("no errors while editing the layout", errors.length === 0, errors.join("\n         "));
}

console.log("\nsampler settings");
{
  await inTab(browser, {}, async (page) => {
    await goTab(page, "Model");
    await page.evaluate(() => {
      const one = Array.from(document.querySelectorAll("#drawer .arf-fold")).find((h) =>
        /Sampler values/.test(h.textContent),
      );
      one.click();
    });
    const blank = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#drawer [data-arf-field^="sampler:"]')).every(
        (i) => i.value === "",
      ),
    );
    ok("they start blank, so the connection decides", blank);

    await page.evaluate(() => {
      const t = document.querySelector('#drawer [data-arf-field="sampler:temperature"]');
      t.value = "9";
      t.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const held = await page.evaluate(() => {
      const last = window.__sent.filter((m) => m.type === "set_settings").pop();
      return last.settings.samplers;
    });
    ok("a value past the end of its range is pulled back", held.temperature === 2, JSON.stringify(held));

    await page.evaluate(() => {
      const t = document.querySelector('#drawer [data-arf-field="sampler:temperature"]');
      t.value = "";
      t.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const cleared = await page.evaluate(() => {
      const last = window.__sent.filter((m) => m.type === "set_settings").pop();
      return last.settings.samplers;
    });
    ok("and clearing one hands it back rather than sending zero", !("temperature" in cleared));
  });
}

console.log("\nsettings that were saved before");
{
  await inTab(
    browser,
    { saved: { rules: "Cut filler.", contextMessages: 9, samplers: { temperature: 0.4 } } },
    async (page) => {
      const cfg = await page.evaluate(() => {
        const last = window.__sent.filter((m) => m.type === "set_settings").pop();
        return last.settings;
      });
      ok("they are read back and sent on", cfg.rules === "Cut filler." && cfg.contextMessages === 9);
      ok("including the samplers", cfg.samplers && cfg.samplers.temperature === 0.4);
    },
  );

  // A stored layout that has lost the two locked blocks, which is what a
  // hand-edited or half-written file looks like.
  await inTab(
    browser,
    { saved: { blocks: [{ id: "rules", name: "Only rules", on: true, role: "system", text: "cut filler" }] } },
    async (page) => {
      await goTab(page, "Prompt");
      const shown = await page.evaluate(() =>
        Array.from(
          document.querySelectorAll('#drawer [data-arf-block] [data-arf-field^="blockname:"]'),
        ).map((n) => n.value),
      );
      ok("a one-block prompt is shown as it is, not repaired", shown.length === 1, shown.join(" | "));
      const warned = await page.evaluate(() => !!document.querySelector("#drawer .arf-bad"));
      ok("and it says the prompt cannot work", warned);
    },
  );
}

console.log("\nthe tabs");
{
  const errors = await inTab(browser, {}, async (page) => {
    const labels = await page.evaluate(() =>
      Array.from(document.querySelectorAll("#drawer .arf-tab")).map((b) => b.textContent.trim()),
    );
    ok("every tab is there", labels.length === 6, labels.join(" | "));

    // The control card is above the strip on purpose: hunting for the master
    // switch on whichever tab it happens to live on is what makes a tabbed
    // panel worse than a list.
    const above = await page.evaluate(() => {
      const strip = document.querySelector("#drawer .arf-tabs");
      const sw = document.querySelector('#drawer input[aria-label="Turn Auto Refine on"]');
      const btn = Array.from(document.querySelectorAll("#drawer button")).find((b) =>
        /Refine the latest reply/.test(b.textContent),
      );
      if (!strip || !sw || !btn) return false;
      return (
        strip.compareDocumentPosition(sw) === Node.DOCUMENT_POSITION_PRECEDING &&
        strip.compareDocumentPosition(btn) === Node.DOCUMENT_POSITION_PRECEDING
      );
    });
    ok("the switch and the refine button sit above the tabs", above);

    // One tab's worth of cards on screen at a time, which is the whole point.
    for (const label of ["Prompt", "Context", "Model", "Limits", "Log", "Setup"]) {
      await goTab(page, label);
      const cards = await page.evaluate(
        () => document.querySelectorAll("#drawer .arf-body .arf-card").length,
      );
      ok(label + " shows its own cards", cards >= 1 && cards <= 5, "found " + cards);
    }

    await goTab(page, "Log");
    const remembered = await page.evaluate(() => {
      const last = window.__sent.filter((m) => m.type === "set_settings").pop();
      return last.settings.tab;
    });
    ok("the tab you are on is remembered", remembered === "log", String(remembered));
  });
  ok("no errors moving between tabs", errors.length === 0, errors.join("\n         "));
}

console.log("\nseeing what gets sent");
{
  await inTab(browser, {}, async (page) => {
    await goTab(page, "Context");
    await page.evaluate(() => {
      Array.from(document.querySelectorAll("#drawer button"))
        .find((b) => /Show me the request/.test(b.textContent))
        .click();
    });
    const asked = await page.evaluate(() =>
      window.__sent.filter((m) => m.type === "preview_prompt").length,
    );
    ok("it asks the backend to build the real request", asked === 1);

    // The backend answers, and the panel renders what came back.
    await page.evaluate(() => {
      const id = window.__sent.filter((m) => m.type === "preview_prompt").pop().requestId;
      window.__fromBackend({
        type: "prompt_preview",
        requestId: id,
        ok: true,
        real: true,
        messages: [
          { role: "system", content: "You are editing one message." },
          { role: "user", content: "The line being rewritten." },
        ],
        parameters: { temperature: 0.4 },
        connectionId: "",
        reasoning: { source: "off" },
      });
    });
    await settle(page);
    const shown = await page.evaluate(() => document.querySelector("#drawer .arf-body").textContent);
    ok("each message is shown with its role", /system/.test(shown) && /user/.test(shown));
    ok("and the text that would be sent", /The line being rewritten/.test(shown));
    ok("along with the rest of the call", /temperature 0.4/.test(shown) && /Thinking: off/.test(shown));
  });
}

console.log("\nhow much thinking");
{
  await inTab(browser, {}, async (page) => {
    await goTab(page, "Model");
    ok(
      "the effort row is not shown until it would do something",
      !(await onScreen(page, "thinkingEffort")),
    );

    await page.evaluate(() => {
      const sel = document.querySelector('#drawer [data-arf-field="thinkingMode"]');
      sel.value = "custom";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    ok("and appears when you ask to set it", await onScreen(page, "thinkingEffort"));

    await page.evaluate(() => {
      const sel = document.querySelector('#drawer [data-arf-field="thinkingEffort"]');
      sel.value = "high";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const sent = await page.evaluate(() => {
      const last = window.__sent.filter((m) => m.type === "set_settings").pop();
      return last.settings;
    });
    ok("what you picked reaches the backend", sent.thinkingMode === "custom" && sent.thinkingEffort === "high");
  });
}

console.log("\npresets");
{
  const errors = await inTab(browser, {}, async (page) => {
    await goTab(page, "Prompt");
    // Change a block, then save the prompt under a name.
    await page.evaluate(() => {
      const ta = document.querySelector('#drawer [data-arf-field^="blocktext:"]');
      ta.value = "<my_rule>Cut filler words.</my_rule>";
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      ta.dispatchEvent(new Event("blur", { bubbles: true }));
      const name = document.querySelector('#drawer [data-arf-field="presetName"]');
      name.value = "Tight prose";
      name.dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelector('#drawer [data-arf-preset="new"]').click();
    });
    await settle(page);
    const saved = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#drawer [data-arf-field="presetPick"] option')).map(
        (o) => o.textContent,
      ),
    );
    ok("a preset is saved under its name", saved.indexOf("Tight prose") >= 0, saved.join(" | "));

    // Change it again, then load the preset back.
    await page.evaluate(() => {
      const ta = document.querySelector('#drawer [data-arf-field^="blocktext:"]');
      ta.value = "<my_rule>Something else entirely.</my_rule>";
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      ta.dispatchEvent(new Event("blur", { bubbles: true }));
    });
    await settle(page);
    await page.evaluate(() => {
      const sel = document.querySelector('#drawer [data-arf-field="presetPick"]');
      sel.value = "Tight prose";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle(page);
    await page.evaluate(() => {
      document.querySelector('#drawer [data-arf-preset="load"]').click();
    });
    await settle(page);
    const back = await page.evaluate(
      () => document.querySelector('#drawer [data-arf-field^="blocktext:"]').value,
    );
    ok("loading it brings the prompt back", back === "<my_rule>Cut filler words.</my_rule>", back);

    // A preset carries the rules and not the switches.
    const carried = await page.evaluate(() => JSON.parse(localStorage.getItem("lv-auto-refine:presets:v1")));
    const keys = Object.keys(carried[0].settings).sort();
    ok("it saves what shapes a refine", keys.indexOf("blocks") >= 0 && keys.indexOf("samplers") >= 0);
    ok("and not the switches that are yours", keys.indexOf("enabled") < 0 && keys.indexOf("connectionId") < 0, keys.join(","));

    await page.evaluate(() => {
      document.querySelector('#drawer [data-arf-preset="delete"]').click();
    });
    await settle(page);
    const gone = await page.evaluate(() => JSON.parse(localStorage.getItem("lv-auto-refine:presets:v1")).length);
    ok("and deleting one removes it", gone === 0);
  });
  ok("no errors working with presets", errors.length === 0, errors.join("\n         "));
}

console.log("\nstarting again");
{
  await inTab(browser, { saved: { contextMessages: 9, timeoutSecs: 45 } }, async (page) => {
    await goTab(page, "Setup");
    // The stub host has no confirm dialog, which is the path that asks in the
    // panel instead. One press arms it, the second does it.
    await page.evaluate(() => {
      document.querySelector('#drawer [data-arf-reset]').click();
    });
    await settle(page);
    const still = await page.evaluate(
      () => JSON.parse(localStorage.getItem("lv-auto-refine:settings:v1")).contextMessages,
    );
    ok("one press does not throw anything away", still === 9, String(still));
    const asks = await page.evaluate(() => document.querySelector("#drawer .arf-body").textContent);
    ok("it asks first", /Press it again/.test(asks));

    await page.evaluate(() => {
      document.querySelector('#drawer [data-arf-reset]').click();
    });
    await settle(page);
    const after = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("lv-auto-refine:settings:v1")),
    );
    ok("the second press puts the defaults back", after.contextMessages === 4 && after.timeoutSecs === 90);
  });
}

console.log("\nthe extras, which are off until asked for");
{
  await inTab(browser, {}, async (page) => {
    const quiet = await page.evaluate(() => ({
      widget: !!window.__widget,
      row: !!window.__inputAction,
    }));
    ok("no floating button and no input bar row on a fresh install", !quiet.widget && !quiet.row);
  });

  // No floating button, so the Extras row is the only way to reach this and it
  // registers.
  await inTab(
    browser,
    { saved: { inputRefine: true } },
    async (page) => {
    const up = await page.evaluate(() => ({
      widget: !!window.__widget,
      row: !!window.__inputAction,
    }));
    ok("the Extras row appears when there is no button to hold it", !up.widget && up.row);

    // Refining the draft reads the input box, sends it, and writes the answer
    // back through the setter the framework is listening to.
    await page.evaluate(() => {
      const box = window.__makeComposer("i walk through it, suddenly");
      window.__saw = [];
      box.addEventListener("input", () => window.__saw.push(box.value));
      window.__inputClick();
    });
    const askedAsUser = await page.evaluate(() => {
      const last = window.__sent.filter((m) => m.type === "try_refine").pop();
      return last && { text: last.text, asUser: last.asUser, id: last.requestId };
    });
    ok("it sends what you typed, marked as yours", askedAsUser && askedAsUser.asUser === true);
    ok("with the text from the box", askedAsUser && /i walk through it/.test(askedAsUser.text));

    await page.evaluate((id) => {
      window.__fromBackend({ type: "try_result", requestId: id, ok: true, after: "I walk through it." });
    }, askedAsUser.id);
    await settle(page);
    const wrote = await page.evaluate(() => ({
      value: document.querySelector('[data-component="InputArea"] textarea[name="chat-message"]').value,
      events: window.__saw.length,
    }));
    ok("the answer goes back in the box", wrote.value === "I walk through it.", wrote.value);
    ok("and an input event is raised, so the app sees it too", wrote.events > 0);
    },
  );

  // With no rules there is nothing to apply, and the draft is left alone
  // rather than sent to a model to be rewritten by nothing.
  await inTab(
    browser,
    {
      saved: {
        inputRefine: true,
        blocks: [{ id: "a", name: "No turn", on: true, role: "system", text: "cut filler" }],
      },
    },
    async (page) => {
    await page.evaluate(() => {
      window.__makeComposer("i walk through it");
      window.__inputClick();
    });
    const asked = await page.evaluate(
      () => window.__sent.filter((m) => m.type === "try_refine").length,
    );
    ok("with no {{message}} in the prompt, nothing is sent and the draft is untouched", asked === 0);
    },
  );
}

console.log("\nin one place at a time");
{
  // With a button on screen and a menu to draw, the button's menu takes over
  // what would otherwise be a row in the chat input's Extras menu.
  await inTab(browser, { saved: { widgetOn: true, inputRefine: true } }, async (page) => {
    const up = await page.evaluate(() => ({
      widget: !!window.__widget,
      row: !!window.__inputAction,
    }));
    ok("the button takes the Extras row over", up.widget && !up.row);

    await page.evaluate(() => {
      window.__menuPick = null;
      document.querySelector("#float .arf-float").dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      );
    });
    await settle(page);
    const menu = await page.evaluate(() => window.__menu);
    const keys = ((menu && menu.items) || []).map((i) => i.key);
    ok("holding it opens Lumiverse's own menu", !!menu, JSON.stringify(menu));
    ok("with the draft entry in it, which is where it went", keys.indexOf("draft") >= 0, keys.join(","));
    ok("and the tab and the off switch", keys.indexOf("open") >= 0 && keys.indexOf("off") >= 0, keys.join(","));
    // Only what the button cannot already do. A tap refines, so an entry for
    // refining is a second button; the automatic pass and the per chat switch
    // are settings and belong on the tab with their explanations.
    ok(
      "and nothing the button or the tab already covers",
      keys.indexOf("refine") < 0 && keys.indexOf("auto") < 0 && keys.indexOf("chat") < 0,
      keys.join(","),
    );
    ok("anchored to the button rather than the corner", !!(menu && menu.position && menu.position.y > 0), JSON.stringify(menu && menu.position));
  });

  // A Lumiverse too old to draw a menu. The button then has nowhere to hold the
  // row, so the row stays in Extras rather than vanishing.
  await inTab(
    browser,
    { saved: { widgetOn: true, inputRefine: true }, noMenu: true },
    async (page) => {
      const up = await page.evaluate(() => ({
        widget: !!window.__widget,
        row: !!window.__inputAction,
      }));
      ok("with no menu to hold it, the row stays in Extras", up.widget && up.row);
    },
  );
}

console.log("\nsettings that follow the account");
{
  await inTab(browser, {}, async (page) => {
    const asked = await page.evaluate(() => ({
      settings: window.__sent.filter((m) => m.type === "load_settings").length,
      presets: window.__sent.filter((m) => m.type === "load_presets").length,
    }));
    ok("it asks the account for both on load", asked.settings === 1 && asked.presets === 1);

    // The account's copy wins over whatever this browser had.
    await page.evaluate(() => {
      const id = window.__sent.filter((m) => m.type === "load_settings").pop().requestId;
      window.__fromBackend({
        type: "loaded_settings",
        requestId: id,
        settings: { contextMessages: 9, timeoutSecs: 45 },
      });
    });
    await settle(page);
    const now = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("lv-auto-refine:settings:v1")),
    );
    ok("what comes back wins and is cached here", now.contextMessages === 9 && now.timeoutSecs === 45);

    // A value of the wrong shape falls back rather than leaving the panel
    // holding something it cannot draw.
    await page.evaluate(() => {
      window.__sent.length = 0;
      window.__fromBackend({ type: "loaded_settings", requestId: "not-the-one", settings: { timeoutSecs: 1 } });
    });
    await settle(page);
    const ignored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("lv-auto-refine:settings:v1")).timeoutSecs,
    );
    ok("an answer to a question nobody asked is ignored", ignored === 45, String(ignored));
  });

  // Nothing in the account, something in this browser: this browser's copy goes
  // up rather than staying where only this browser can see it.
  await inTab(browser, { saved: { contextMessages: 7 } }, async (page) => {
    await page.evaluate(() => {
      const id = window.__sent.filter((m) => m.type === "load_settings").pop().requestId;
      window.__sent.length = 0;
      window.__fromBackend({ type: "loaded_settings", requestId: id, settings: null });
    });
    await settle(page);
    const up = await page.evaluate(() => {
      const last = window.__sent.filter((m) => m.type === "set_settings").pop();
      return last && last.settings.contextMessages;
    });
    ok("an empty account is filled from this browser", up === 7, String(up));
  });

  // Saving a preset sends it up as well as writing it here.
  await inTab(browser, {}, async (page) => {
    await goTab(page, "Prompt");
    await page.evaluate(() => {
      const name = document.querySelector('#drawer [data-arf-field="presetName"]');
      name.value = "On the road";
      name.dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelector('#drawer [data-arf-preset="new"]').click();
    });
    await settle(page);
    const sent = await page.evaluate(() => {
      const last = window.__sent.filter((m) => m.type === "save_presets").pop();
      return last && last.presets.map((p) => p.name);
    });
    ok("a saved preset goes up to the account too", !!sent && sent.indexOf("On the road") >= 0, JSON.stringify(sent));
  });

  // A write that failed is said out loud. Settings that look saved and are not
  // is the worst shape this can take.
  await inTab(browser, {}, async (page) => {
    await goTab(page, "Log");
    await page.evaluate(() => {
      window.__fromBackend({ type: "account_save_failed", what: "settings" });
    });
    await settle(page);
    const said = await page.evaluate(() => document.querySelector("#drawer .arf-body").textContent);
    ok("a failed account save is not swallowed", /could not be saved to your account/.test(said));
  });
}

console.log("\nloading a preset from where you were reading");
{
  // The drawer scrolls, not the panel, so the container is an ancestor of the
  // root Lumiverse hands us. That is the thing whose position has to survive a
  // repaint.
  const SCROLLER =
    "#scroller{height:400px;overflow-y:auto}" +
    "#drawer{background:rgb(35,30,48);width:380px;max-width:100%;padding:12px;box-sizing:border-box}";

  await inTab(browser, { css: SCROLLER }, async (page) => {
    // Put the drawer inside something that scrolls, the way the host does.
    await page.evaluate(() => {
      const d = document.getElementById("drawer");
      const s = document.createElement("div");
      s.id = "scroller";
      d.parentNode.insertBefore(s, d);
      s.appendChild(d);
    });
    await goTab(page, "Prompt");
    await settle(page);

    const scrolled = await page.evaluate(async () => {
      const s = document.getElementById("scroller");
      s.scrollTop = s.scrollHeight;
      await new Promise((r) => requestAnimationFrame(r));
      return s.scrollTop;
    });
    ok("there is somewhere to scroll to", scrolled > 0, String(scrolled));

    // Load the longest preset that ships, which is the one that moves the
    // content height the most.
    //
    // Where you were reading is a thing on the screen, not a pixel count. The
    // prompt above grows by thousands of pixels when this loads, so holding the
    // number would leave the card you were looking at far below the fold. What
    // has to hold still is the card.
    const after = await page.evaluate(async () => {
      const s = document.getElementById("scroller");
      const seen = () =>
        document.querySelector('#drawer [data-arf-card="Presets"]').getBoundingClientRect().top;
      const was = { scroll: s.scrollTop, card: seen() };
      const pick = document.querySelector('#drawer [data-arf-field="presetPick"]');
      // The biggest one, which is the one that grows the panel most when it
      // loads and so the one most likely to throw the scroll.
      const detailed = Array.from(pick.options).find((o) => /^A close read$/.test(o.textContent.trim()));
      pick.value = detailed.value;
      pick.dispatchEvent(new Event("change", { bubbles: true }));
      document.querySelector('#drawer [data-arf-preset="load"]').click();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise((r) => setTimeout(r, 60));
      return { was: was, now: { scroll: s.scrollTop, card: seen() }, name: detailed.textContent };
    });
    ok(
      "loading a preset leaves the card you were reading where it was",
      Math.abs(after.now.card - after.was.card) < 8,
      JSON.stringify(after),
    );
    ok(
      "which means following the prompt down as it grows",
      after.now.scroll > after.was.scroll,
      JSON.stringify(after),
    );
  });
}

console.log("\na free scan, with no model behind it");
{
  await inTab(browser, {}, async (page) => {
    await goTab(page, "Context");
    await page.evaluate(() => {
      const ta = document.querySelector('#drawer [data-arf-field="tryText"]');
      ta.value = "She let out a breath she didn't know she was holding, suddenly.";
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      Array.from(document.querySelectorAll("#drawer button"))
        .find((b) => /Scan it, free/.test(b.textContent))
        .click();
    });
    await settle(page);
    const asked = await page.evaluate(() => ({
      scans: window.__sent.filter((m) => m.type === "scan_text").length,
      refines: window.__sent.filter((m) => m.type === "try_refine").length,
      id: (window.__sent.filter((m) => m.type === "scan_text").pop() || {}).requestId,
    }));
    ok("it asks for a scan and never for a refine", asked.scans === 1 && asked.refines === 0, asked);

    await page.evaluate((id) => {
      window.__fromBackend({
        type: "scan_result",
        requestId: id,
        cliches: ["a held breath"],
        fillers: ["suddenly"],
        total: 2,
      });
    }, asked.id);
    await settle(page);
    const said = await page.evaluate(() => document.querySelector("#drawer .arf-body").textContent);
    ok("and says what it found", /a held breath/.test(said) && /suddenly/.test(said), said.slice(0, 160));
  });
}

console.log("\naccepting or turning one down");
{
  // The panel holds the decision itself, so it exists whether or not the host
  // can draw a modal. Without that, a Lumiverse with no showModal dropped the
  // whole refine and said nothing.
  const waiting = async (page) => {
    await page.evaluate(() => {
      window.__fromBackend({
        type: "confirm_refine",
        chatId: "c1",
        messageId: "m2",
        before: "She stepped through and, suddenly, the cold just hit her.",
        after: "She stepped through and the cold hit her.",
      });
    });
    await settle(page);
  };

  await inTab(browser, {}, async (page) => {
    await waiting(page);
    const shown = await page.evaluate(() => {
      const body = document.querySelector("#drawer").textContent;
      return {
        card: /Waiting for you/.test(body),
        before: /suddenly, the cold just hit her/.test(body),
        after: /and the cold hit her/.test(body),
        accept: !!document.querySelector('#drawer [data-arf-pending="accept"]'),
        decline: !!document.querySelector('#drawer [data-arf-pending="decline"]'),
        badge: window.__badge,
      };
    });
    ok("a finished refine waits in the panel", shown.card);
    ok("with both versions to read", shown.before && shown.after);
    ok("and a way to take it or leave it", shown.accept && shown.decline);
    ok("the tab says something is waiting", shown.badge === "1", String(shown.badge));

    await page.evaluate(() => {
      document.querySelector('#drawer [data-arf-pending="accept"]').click();
    });
    await settle(page);
    const took = await page.evaluate(() => ({
      sent: window.__sent.filter((m) => m.type === "apply_refine").pop(),
      gone: !/Waiting for you/.test(document.querySelector("#drawer").textContent),
      badge: window.__badge,
    }));
    ok("accepting sends it to be saved", !!took.sent && took.sent.messageId === "m2");
    ok("with the rewrite you were shown", took.sent.after === "She stepped through and the cold hit her.");
    ok("and the card goes", took.gone);
    ok("and the badge with it", took.badge === null, String(took.badge));
  });

  await inTab(browser, {}, async (page) => {
    await waiting(page);
    await page.evaluate(() => {
      document.querySelector('#drawer [data-arf-pending="decline"]').click();
    });
    await settle(page);
    const left = await page.evaluate(() => ({
      saved: window.__sent.filter((m) => m.type === "apply_refine").length,
      gone: !/Waiting for you/.test(document.querySelector("#drawer").textContent),
    }));
    ok("turning it down saves nothing at all", left.saved === 0);
    ok("and clears the question", left.gone);
  });

  // The floating button offers the same decision, and a stray tap cannot make
  // it: accepting a rewrite of somebody's writing by accident is the one thing
  // the button must not do.
  await inTab(browser, { saved: { widgetOn: true } }, async (page) => {
    await waiting(page);
    await page.evaluate(() => {
      window.__menuPick = null;
      document.querySelector("#float .arf-float").dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      );
    });
    await settle(page);
    const keys = await page.evaluate(() => ((window.__menu || {}).items || []).map((i) => i.key));
    ok("the button's menu can answer it", keys.indexOf("accept") >= 0 && keys.indexOf("decline") >= 0, keys.join(","));

    await page.evaluate(() => {
      document.querySelector("#float .arf-float").click();
    });
    await settle(page);
    const tapped = await page.evaluate(() => window.__sent.filter((m) => m.type === "apply_refine").length);
    ok("but a tap alone accepts nothing", tapped === 0);
  });
}

console.log("\nasking for a refine from the button's menu");
{
  // The row on a message holds only the way back, so this menu and the Extras
  // rows are where a refine is asked for. A tap does the first of them, but a
  // tap is not a label anybody can read.
  await inTab(browser, { saved: { widgetOn: true, enabled: true } }, async (page) => {
    const open = async () => {
      await page.evaluate(() => {
        window.__menuPick = null;
        document.querySelector("#float .arf-float").dispatchEvent(
          new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
        );
      });
      await settle(page);
      return page.evaluate(() => ((window.__menu || {}).items || []).map((i) => i.key));
    };
    const keys = await open();
    ok("it offers the latest reply", keys.indexOf("now") >= 0, keys.join(","));
    ok("and every reply in the chat", keys.indexOf("all") >= 0, keys.join(","));

    // Grouped, with a line drawn between. A menu of eight things in one column
    // is eight things to read.
    const shape = await page.evaluate(() =>
      ((window.__menu || {}).items || []).map((i) => (i.type === "divider" ? "|" : i.key)),
    );
    ok("the entries are grouped, not one long column", shape.indexOf("|") > 0, shape.join(" "));
    ok(
      "a line never opens or closes the menu",
      shape[0] !== "|" && shape[shape.length - 1] !== "|",
      shape.join(" "),
    );
    ok("and two lines never sit together", !/\|\s\|/.test(shape.join(" ")), shape.join(" "));
    ok(
      "the way in comes before the things to do",
      shape.indexOf("open") < shape.indexOf("now"),
      shape.join(" "),
    );
    ok(
      "and taking it off the screen is last, behind a line of its own",
      shape[shape.length - 1] === "off" && shape[shape.length - 3] === "|",
      shape.join(" "),
    );
    ok("every line carries a key of its own", await page.evaluate(() => {
      const seen = ((window.__menu || {}).items || []).map((i) => i.key);
      return new Set(seen).size === seen.length;
    }));

    await page.evaluate(() => {
      window.__menuPick = "all";
      document.querySelector("#float .arf-float").dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      );
    });
    await settle(page);
    ok(
      "picking every reply asks the backend for exactly that",
      await page.evaluate(() => window.__sent.some((m) => m.type === "refine_all")),
    );

    // While one is running, stopping it is what the menu is opened for, and
    // starting another is not offered.
    const mid = await page.evaluate(async () => {
      window.__fromBackend({ type: "refine_progress", stage: "writing", chars: 5 });
      window.__menuPick = null;
      document.querySelector("#float .arf-float").dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      );
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return ((window.__menu || {}).items || []).map((i) => i.key);
    });
    ok("mid-refine it offers stopping instead", mid.indexOf("stop") >= 0, mid.join(","));
    ok("and does not offer starting another", mid.indexOf("now") < 0 && mid.indexOf("all") < 0, mid.join(","));
  });

  // With the button on screen, the Extras rows stand down: one place at a time.
  await inTab(browser, { saved: { widgetOn: true, enabled: true, inputRefine: true } }, async (page) => {
    const rows = await page.evaluate(() => Object.keys(window.__inputActions || {}));
    ok("the button's menu takes the Extras rows over", rows.length === 0, JSON.stringify(rows));
  });
}

console.log("\nswitches, not tick boxes");
{
  await inTab(browser, {}, async (page) => {
    await goTab(page, "Limits");
    const look = await page.evaluate(async () => {
      // Long enough for the slide and the colour change to have finished. A
      // computed style read mid-transition is the value it is passing through,
      // not the one it is going to, so reading straight away compares two
      // points on the same animation.
      const frame = () => new Promise((r) => setTimeout(r, 260));
      // Re-queried after every click and read straight away. This one has rows
      // hanging off it, so switching it rebuilds the panel and the element read
      // a moment ago is no longer in the document.
      const find = () => document.querySelector('#drawer [data-arf-field="protectThinking"]');
      const snap = () => {
        const b = find();
        const cs = getComputedStyle(b);
        const knob = getComputedStyle(b, "::after");
        return {
          w: Math.round(parseFloat(cs.width)),
          h: Math.round(parseFloat(cs.height)),
          radius: cs.borderRadius,
          knob: knob.left,
          bg: cs.backgroundColor,
          tag: b.tagName + ":" + b.type,
        };
      };
      const box = find();
      if (!box) return null;
      if (box.checked) { box.click(); await frame(); }
      const a = snap();
      find().click();
      await frame();
      const b2 = snap();
      const shut = a;
      const open = b2;
      const knobShut = { left: a.knob };
      const knobOpen = { left: b2.knob };
      return {
        // A pill rather than a square: wider than it is tall, fully rounded.
        w: shut.w,
        h: shut.h,
        radius: shut.radius,
        // The knob slides, and the track changes colour.
        knobShut: knobShut.left,
        knobOpen: knobOpen.left,
        bgShut: shut.bg,
        bgOpen: open.bg,
        // Still a real checkbox underneath, which is what the keyboard and a
        // screen reader are using.
        tag: shut.tag,
      };
    });
    ok("it is a pill, wider than it is tall", !!look && look.w > look.h, JSON.stringify(look));
    ok("fully rounded", !!look && parseFloat(look.radius) >= look.h / 2, look && look.radius);
    ok("the knob moves when it is switched", !!look && look.knobShut !== look.knobOpen, look);
    ok("and the track changes with it", !!look && look.bgShut !== look.bgOpen, look);
    ok("and it is still a real checkbox underneath", !!look && look.tag === "INPUT:checkbox", look && look.tag);
  });
}

console.log("\nthe mark on a focused box");
{
  await inTab(browser, {}, async (page) => {
    await goTab(page, "Context");
    const ring = await page.evaluate(() => {
      const box = document.querySelector('#drawer input.arf-field[type="number"]');
      if (!box) return null;
      box.focus();
      const cs = getComputedStyle(box);
      return { shadow: cs.boxShadow, outline: cs.outlineStyle };
    });
    // Auto Retry's ring: a 2px band plus a short halo behind it.
    ok("a focused box takes the glow", !!ring && /rgba?\([^)]*\)/.test(ring.shadow), JSON.stringify(ring));
    ok(
      "with two layers, the band and the halo",
      !!ring && (ring.shadow.match(/rgba?\(/g) || []).length === 2 && / 8px /.test(ring.shadow),
      ring && ring.shadow,
    );
    ok("and no browser outline over it", !!ring && ring.outline === "none");

    // The two that were deliberately left bare stay bare.
    const bare = await page.evaluate(() => {
      const s = document.querySelector('#drawer [data-arf-field="hunt"]');
      s.focus();
      return getComputedStyle(s).boxShadow;
    });
    ok("the search box keeps none, as asked", bare === "none", bare);
  });
}

console.log("\nthe checks are yours to switch off");
{
  await inTab(browser, {}, async (page) => {
    await goTab(page, "Limits");
    const on = await page.evaluate(() =>
      ["guardRefusal", "guardPreamble", "guardSoften", "retryRefine"].map(
        (k) => !!document.querySelector('#drawer [data-arf-field="' + k + '"]'),
      ),
    );
    ok("each check has a switch of its own", on.every(Boolean), JSON.stringify(on));

    // The two that belong to the softening check are behind a fold, so the tab
    // is a list of switches rather than a wall. Opening it brings them out.
    const before = await onScreen(page, "softenPct");
    const folded = await page.evaluate(() => {
      const head = Array.from(document.querySelectorAll("#drawer .arf-fold")).find((h) =>
        /What counts as sanitising/.test(h.textContent),
      );
      if (head) head.click();
      return { hasFold: !!head };
    });
    await settle(page);
    const under = {
      pct: await onScreen(page, "softenPct"),
      words: await onScreen(page, "softenWords"),
    };
    ok("its tuning is folded away rather than in the way", folded.hasFold && !before);
    ok("and opening it brings its own settings out", under.pct && under.words);

    await page.evaluate(() => {
      const sw = document.querySelector('#drawer [data-arf-field="guardSoften"]');
      sw.checked = false;
      sw.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle(page);
    const gone = {
      pct: await onScreen(page, "softenPct"),
      sent: await page.evaluate(
        () => (window.__sent.filter((m) => m.type === "set_settings").pop() || {}).settings,
      ),
    };
    ok("and go with it when it is off", !gone.pct);
    ok("what you switched off reaches the backend", gone.sent.guardSoften === false);
  });

  // Turning all three off is a real decision, so it is said out loud.
  await inTab(
    browser,
    { saved: { guardRefusal: false, guardPreamble: false, guardSoften: false } },
    async (page) => {
      await goTab(page, "Limits");
      const said = await page.evaluate(() => document.querySelector("#drawer .arf-body").textContent);
      ok("switching every one off warns you", /can now be saved over your reply/.test(said));
    },
  );
}

console.log("\nwhen the backend is not there at all");
{
  // A chat has to be open, or the refine is refused before anything is sent and
  // the watch never arms.
  const inAChat = async (page) => {
    await page.evaluate(() => {
      const id = window.__sent.filter((m) => m.type === "active_chat").pop().requestId;
      window.__fromBackend({
        type: "active_chat",
        requestId: id,
        chatId: "c1",
        character: "Wren",
        hasCharacter: true,
        resolved: true,
      });
    });
    await settle(page);
  };

  await inTab(browser, {}, async (page) => {
    await goTab(page, "Log");
    await inAChat(page);
    // A refine is asked for and nothing answers, which is what a Lumiverse
    // with the frontend loaded and the backend missing looks like from here.
    await page.evaluate(() => {
      window.__slept = [];
      const real = window.setTimeout;
      // Only the acknowledgement wait is shortened. The deadman is armed on the
      // same call and is twenty times longer, so shortening both equally would
      // race them and prove nothing about which one is meant to speak first.
      window.setTimeout = (fn, ms) => {
        window.__slept.push(ms);
        return real(fn, ms >= 2000 && ms <= 10000 ? 5 : ms);
      };
      Array.from(document.querySelectorAll("#drawer button"))
        .find((b) => /Refine the latest reply/.test(b.textContent))
        .click();
    });
    await new Promise((r) => setTimeout(r, 260));
    await settle(page);
    const said = await page.evaluate(() => ({
      body: document.querySelector("#drawer .arf-body").textContent,
      toasts: (window.__toasts || []).join(" | "),
      // The panel must not still think something is running.
      spinning: /Refining/.test(document.querySelector("#drawer").textContent),
    }));
    ok("it says the backend did not answer", /backend did not answer/.test(said.body), said.body.slice(0, 200));
    ok("out loud, not only in the log", /backend is not answering/.test(said.toasts), said.toasts);
    ok("and stops spinning", !said.spinning, said.spinning);
  });

  // And when the backend is there, the acknowledgement puts that watch away and
  // leaves the timeout to do its job.
  await inTab(browser, {}, async (page) => {
    await goTab(page, "Log");
    await inAChat(page);
    await page.evaluate(() => {
      const real = window.setTimeout;
      window.setTimeout = (fn, ms) => real(fn, ms >= 2000 && ms <= 10000 ? 5 : ms);
      Array.from(document.querySelectorAll("#drawer button"))
        .find((b) => /Refine the latest reply/.test(b.textContent))
        .click();
      const id = window.__sent.filter((m) => m.type === "refine_now").pop().requestId;
      window.__fromBackend({ type: "refine_ack", requestId: id });
    });
    await new Promise((r) => setTimeout(r, 260));
    await settle(page);
    const said = await page.evaluate(() => document.querySelector("#drawer .arf-body").textContent);
    ok("an acknowledged refine is left alone to take its time", !/backend did not answer/.test(said));
  });
}

console.log("\na temporary chat");
{
  // A chat with no card on it is the temporary chat: a scratch conversation
  // with the model, thrown away on the way out. The switch has to work in one,
  // and must not be written down, because the next one carries a different id
  // and the entry could never match anything again.
  const asTemp = async (page) => {
    await page.evaluate(() => {
      const id = window.__sent.filter((m) => m.type === "active_chat").pop().requestId;
      window.__fromBackend({
        type: "active_chat",
        requestId: id,
        chatId: "temp-1",
        character: null,
        hasCharacter: false,
        resolved: true,
      });
    });
    await settle(page);
  };

  await inTab(browser, {}, async (page) => {
    await goTab(page, "Setup");
    await asTemp(page);
    const said = await page.evaluate(() => document.querySelector("#drawer .arf-body").textContent);
    ok("the panel says it is a temporary chat", /temporary chat/i.test(said));
    ok("and does not call it a chat with no card", !/no character card on it/.test(said));

    // The switch still works: it is held in memory and the backend is told.
    await page.evaluate(() => {
      Array.from(document.querySelectorAll("#drawer button"))
        .find((b) => b.textContent.trim() === "Turn off here")
        .click();
    });
    await settle(page);
    const after = await page.evaluate(() => ({
      told: (window.__sent.filter((m) => m.type === "set_chats_off").pop() || {}).chats,
      written: JSON.parse(localStorage.getItem("lv-auto-refine:chats-off:v1") || "[]"),
      said: document.querySelector("#drawer .arf-body").textContent,
    }));
    ok("switching it off still reaches the backend", (after.told || []).indexOf("temp-1") >= 0, JSON.stringify(after.told));
    ok("but nothing about it is written down", after.written.indexOf("temp-1") < 0, JSON.stringify(after.written));
    ok("and the panel says the switch will not be remembered", /not remembered/.test(after.said));
  });

  // An ordinary chat switched off afterwards must not drag the temporary one
  // into storage with it.
  await inTab(browser, {}, async (page) => {
    await goTab(page, "Setup");
    await asTemp(page);
    await page.evaluate(() => {
      Array.from(document.querySelectorAll("#drawer button"))
        .find((b) => b.textContent.trim() === "Turn off here")
        .click();
    });
    await settle(page);
    // Now an ordinary chat, switched off in turn. The reply has to answer the
    // question the panel actually asked: an answer to anything else is about a
    // chat nobody is looking at, and the panel is right to drop it.
    await page.evaluate(() => {
      const id = window.__sent.filter((m) => m.type === "active_chat").pop().requestId;
      window.__fromBackend({
        type: "active_chat",
        requestId: id,
        chatId: "real-1",
        character: "Wren",
        hasCharacter: true,
        resolved: true,
      });
    });
    await settle(page);
    await page.evaluate(() => {
      Array.from(document.querySelectorAll("#drawer button"))
        .find((b) => b.textContent.trim() === "Turn off here")
        .click();
    });
    await settle(page);
    const written = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("lv-auto-refine:chats-off:v1") || "[]"),
    );
    ok("a real chat is remembered", written.indexOf("real-1") >= 0, JSON.stringify(written));
    ok("and does not carry the temporary one into storage", written.indexOf("temp-1") < 0, JSON.stringify(written));
  });

  // A backend that could not look is not evidence of no card.
  await inTab(browser, {}, async (page) => {
    await goTab(page, "Setup");
    await page.evaluate(() => {
      const id = window.__sent.filter((m) => m.type === "active_chat").pop().requestId;
      window.__fromBackend({
        type: "active_chat",
        requestId: id,
        chatId: "unknown-1",
        character: null,
        hasCharacter: false,
        resolved: false,
      });
    });
    await settle(page);
    const said = await page.evaluate(() => document.querySelector("#drawer .arf-body").textContent);
    ok("a chat it could not look at is not called temporary", !/temporary chat/i.test(said));
  });
}

console.log("\nthe spinner on the floating button");
{
  // The ring is turned by the stylesheet over 900ms. The clock repaints the
  // button two and a half times a second, and repainting used to rewrite the
  // icon, which threw away the element mid-turn and started the rotation again
  // from the top: a spinner that stuttered instead of turning. So the check is
  // that the element survives, not that it looks right.
  await inTab(browser, { saved: { widgetOn: true, refineOn: true } }, async (page) => {
    await page.evaluate(() => {
      const id = window.__sent.filter((m) => m.type === "active_chat").pop().requestId;
      window.__fromBackend({
        type: "active_chat", requestId: id, chatId: "c1",
        character: "Wren", hasCharacter: true, resolved: true,
      });
      for (const f of window.__handlers.GENERATION_ENDED || []) f({ chatId: "c1", messageId: "m2" });
    });
    await settle(page);
    const spinning = await page.evaluate(() => {
      const svg = document.querySelector("#float .arf-spin");
      if (svg) svg.setAttribute("data-arf-same-node", "1");
      return !!svg;
    });
    ok("a refine puts a spinner on the button", spinning);
    // Long enough for several ticks of the clock.
    await page.evaluate(() => new Promise((r) => setTimeout(r, 1400)));
    const kept = await page.evaluate(() => {
      const svg = document.querySelector("#float .arf-spin");
      return !!svg && svg.getAttribute("data-arf-same-node") === "1";
    });
    ok("and leaves it alone across repaints, so the turn is not restarted", kept);
  });
}

console.log("\nthe floating button's size");
{
  await inTab(browser, {}, async (page) => {
    await goTab(page, "Setup");
    // Its settings belong to it: with the button off there is nothing to size.
    ok("its settings are hidden while the button is off", !(await onScreen(page, "widgetSize")));

    await page.evaluate(() => {
      document.querySelector('#drawer [data-arf-field="widgetOn"]').click();
    });
    await settle(page);
    // The same range Auto Retry's floating button uses, so the two sit at
    // matching sizes for somebody running both.
    const out = await onScreen(page, "widgetSize");
    const shown = await page.evaluate(() => {
      const n = document.querySelector('#drawer [data-arf-field="widgetSize"]');
      return n && { min: n.min, max: n.max, value: n.value };
    });
    ok("switching it on brings its settings back under it", out);
    ok(
      "and its range matches Auto Retry's",
      shown && shown.min === "28" && shown.max === "96" && shown.value === "44",
      JSON.stringify(shown),
    );
  });

  await inTab(browser, { saved: { widgetOn: true, widgetSize: 400 } }, async (page) => {
    const spec = await page.evaluate(() => window.__widgetSpec);
    ok("a size past the end of the range is pulled back", spec && spec.width === 96, JSON.stringify(spec));
  });

  // The button is rebuilt on every size change, and it listens on the window to
  // tell a tap from the host dragging it. Those listeners have to come off with
  // the button they belong to, or every resize leaves another set behind
  // running on every pointermove across the page.
  await inTab(browser, { saved: { widgetOn: true } }, async (page) => {
    await goTab(page, "Setup");
    const counted = await page.evaluate(async () => {
      let live = 0;
      const add = EventTarget.prototype.addEventListener;
      const rm = EventTarget.prototype.removeEventListener;
      EventTarget.prototype.addEventListener = function (t, f, c) {
        if (this === window && /^pointer/.test(t)) live++;
        return add.call(this, t, f, c);
      };
      EventTarget.prototype.removeEventListener = function (t, f, c) {
        if (this === window && /^pointer/.test(t)) live--;
        return rm.call(this, t, f, c);
      };
      // Re-queried each time: the row is rebuilt with the panel.
      const step = async (v) => {
        const size = document.querySelector('#drawer [data-arf-field="widgetSize"]');
        if (!size) throw new Error("no size field on screen");
        size.value = String(v);
        size.dispatchEvent(new Event("change", { bubbles: true }));
        await new Promise((r) => requestAnimationFrame(r));
      };
      // Rebuild it several times over.
      for (const v of [50, 60, 70, 80]) await step(v);
      const after = live;
      await step(90);
      return { after: after, andAgain: live };
    });
    ok(
      "rebuilding the button does not pile up window listeners",
      counted.after <= 3 && counted.andAgain <= 3,
      JSON.stringify(counted),
    );
  });
}

console.log("\nsearch");
{
  await inTab(browser, {}, async (page) => {
    await page.evaluate(() => {
      const box = document.querySelector('#drawer [data-arf-field="hunt"]');
      box.value = "temperature";
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle(page);
    const found = await page.evaluate(() => {
      const body = document.querySelector("#drawer .arf-body");
      return { text: body.textContent, cards: body.querySelectorAll(".arf-card").length };
    });
    ok("it finds a setting from another tab", /Samplers/.test(found.text) && found.cards >= 1);

    // The tab strip goes while searching: what is shown is from every tab, so
    // there is no tab to be standing on.
    const strip = await page.evaluate(() => !!document.querySelector("#drawer .arf-tabs"));
    ok("the tab strip steps out of the way", !strip);

    await page.evaluate(() => {
      const box = document.querySelector('#drawer [data-arf-field="hunt"]');
      box.value = "zzzznothing";
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle(page);
    const empty = await page.evaluate(() =>
      document.querySelector("#drawer .arf-body").textContent,
    );
    ok("and says so when nothing matched", /Nothing matched/.test(empty));
  });
}

console.log("\nthe bigger editor");
{
  const errors = await inTab(browser, {}, async (page) => {
    // Prompt blocks no longer carry an Expand of their own. The two places the
    // big editor is still reached from are the debug report, which is editable
    // so nothing private is pasted into a public issue, and the preview, which
    // is read only. This is the editable one.
    await goTab(page, "Log");
    await page.evaluate(() => {
      window.__copied = [];
      try {
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            writeText: (t) => {
              window.__copied.push(t);
              return Promise.resolve();
            },
          },
        });
      } catch (_) {}
      Array.from(document.querySelectorAll("#drawer button"))
        .find((b) => b.textContent.trim() === "Read and edit it first")
        .click();
    });
    await settle(page);
    const open = await page.evaluate(() => {
      const over = document.querySelector(".arf-over");
      const ta = over && over.querySelector("textarea");
      return {
        there: !!over,
        filled: ta ? ta.value.length > 0 : false,
        editable: ta ? !ta.readOnly : false,
        // Focusing a textarea is what raises the keyboard on a phone.
        focused: document.activeElement === ta,
      };
    });
    ok("it opens with the report in it", open.there && open.filled);
    ok("and lets you take lines out before it is copied", open.editable);
    ok("and does not focus the box, so no keyboard pops up", !open.focused);

    await page.evaluate(() => {
      const ta = document.querySelector(".arf-over textarea");
      ta.value = "edited in the big editor";
      Array.from(document.querySelectorAll(".arf-over button"))
        .find((b) => b.textContent.trim() === "Done")
        .click();
    });
    await settle(page);
    const copied = await page.evaluate(() => window.__copied.slice());
    ok("Done copies what you left in it", copied.indexOf("edited in the big editor") >= 0, copied.join(" | "));
    const shut = await page.evaluate(() => !document.querySelector(".arf-over"));
    ok("and closes", shut);
  });
  ok("no errors in the big editor", errors.length === 0, errors.join("\n         "));
}

console.log("\nchoosing what goes where");
{
  await inTab(browser, {}, async (page) => {
    await goTab(page, "Setup");
    // Switch off the prompt for export, then check the file that comes out.
    await page.evaluate(() => {
      const fold = Array.from(document.querySelectorAll("#drawer .arf-fold")).find((h) =>
        /What goes in the file/.test(h.textContent),
      );
      fold.click();
    });
    await settle(page);
    const boxes = await page.evaluate(
      () => document.querySelectorAll('#drawer [data-arf-part^="exportParts:"]').length,
    );
    ok("export offers every part", boxes >= 9, "found " + boxes);

    await page.evaluate(() => {
      const one = document.querySelector('#drawer [data-arf-part="exportParts:prompt"]');
      one.checked = false;
      one.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle(page);
    const kept = await page.evaluate(() => {
      const last = window.__sent.filter((m) => m.type === "set_settings").pop();
      return last.settings.exportParts;
    });
    ok("and remembers what you switched off", kept && kept.prompt === false);

    // Reset offers the same parts, and refuses to run with none chosen.
    await page.evaluate(() => {
      const fold = Array.from(document.querySelectorAll("#drawer .arf-fold")).find((h) =>
        /What to put back/.test(h.textContent),
      );
      fold.click();
    });
    await settle(page);
    await page.evaluate(() => {
      document
        .querySelector('#drawer [data-arf-picker="resetParts"] [data-arf-pick="none"]')
        .click();
    });
    await settle(page);
    const off = await page.evaluate(() => {
      const btn = document.querySelector("#drawer [data-arf-reset]");
      return { disabled: btn.disabled, label: btn.textContent };
    });
    ok("reset with nothing chosen cannot be pressed", off.disabled, off.label);
  });
}

console.log("\nthe run through the chat");
{
  // One button, in one place. It was moved next to Refine the latest reply and
  // left behind in This chat as well, so the panel offered the same thing twice
  // on two different tabs.
  await inTab(browser, {}, async (page) => {
    await page.evaluate(() => {
      const id = window.__sent.filter((m) => m.type === "active_chat").pop().requestId;
      window.__fromBackend({
        type: "active_chat", requestId: id, chatId: "c1",
        character: "Wren", hasCharacter: true, resolved: true,
      });
    });
    await settle(page);
    const counts = [];
    const tabs = await page.evaluate(() =>
      [...document.querySelectorAll("#drawer .arf-tab")].map((b) => b.textContent.trim()));
    for (const t of tabs) {
      await goTab(page, t);
      counts.push(
        t + ":" + (await page.evaluate(() => document.querySelectorAll("[data-arf-sweep]").length)),
      );
    }
    ok(
      "the button is in one place, on every tab",
      counts.every((c) => c.split(":")[1] === "1"),
      counts.join(" "),
    );

    // While it runs, it takes the place of the buttons rather than reporting
    // from somewhere else.
    await page.evaluate(() => {
      const m = window.__sent.filter((x) => x.type === "refine_all").pop();
      window.__fromBackend({
        type: "refine_all_progress",
        requestId: m ? m.requestId : "x",
        chatId: "c1", at: 3, of: 8, saved: 2, skipped: 0,
      });
    });
    await settle(page);
  });
}

console.log("\nstopping a refine without a floating button");
{
  // Stopping used to live on the floating button and nowhere else: a tap on the
  // spinner, or a row in its hold menu. Switched off, there was no way to call
  // a refine off at all, and the panel answered a running refine by greying
  // both its buttons out, which says wait rather than saying there is a way
  // out of this.
  const running = async (page) => {
    await page.evaluate(() => {
      const id = window.__sent.filter((m) => m.type === "active_chat").pop().requestId;
      window.__fromBackend({
        type: "active_chat", requestId: id, chatId: "c1",
        character: "Wren", hasCharacter: true, resolved: true,
      });
      for (const f of window.__handlers.GENERATION_ENDED || []) f({ chatId: "c1", messageId: "m2" });
    });
    await settle(page);
  };

  await inTab(browser, { saved: { widgetOn: false, refineOn: true } }, async (page) => {
    ok(
      "there is no stop while nothing is running",
      await page.evaluate(() => !document.querySelector("[data-arf-stop]")),
    );
    await running(page);
    const there = await page.evaluate(() => {
      const b = document.querySelector("[data-arf-stop]");
      return b ? { text: b.textContent, off: b.disabled, has: true } : { has: false };
    });
    ok("a running refine puts a stop where the button that started it was",
      there.has && !there.off, JSON.stringify(there));
    ok("named for what it does", there.has && /stop/i.test(there.text), JSON.stringify(there));
    ok(
      "with no floating button anywhere",
      await page.evaluate(() => !document.querySelector("#float")),
    );

    await page.evaluate(() => document.querySelector("[data-arf-stop]").click());
    await settle(page);
    ok(
      "and pressing it asks the backend to stop",
      await page.evaluate(() => window.__sent.some((m) => m.type === "cancel_refine")),
    );
  });

  // And with no floating button at all, the panel's own stop is the one that
  // has to be there: it is the only way to call a refine off from a screen
  // where nothing else of ours is drawn.
  await inTab(browser, { saved: { widgetOn: false, refineOn: true } }, async (page) => {
    await running(page);
    const b = await page.evaluate(() => {
      const el = document.querySelector("#drawer [data-arf-stop]");
      return el ? { text: el.textContent } : null;
    });
    ok("the panel's stop is there with no button on screen", !!b, JSON.stringify(b));
  });
}

console.log("\nwatching it work");
{
  // The working is not put on the page at all. It used to open a card of its
  // own, which then had to hand that card over to the one saying what the
  // refine did, and the hand-over is what read as a second card popping up. It
  // goes to the Log, where it can be read at whatever pace suits and nothing
  // has to be caught.
  const say = async (page, notes) => {
    await page.evaluate((n) => {
      window.__fromBackend({ type: "refine_progress", stage: "writing", chars: 400, notes: n });
    }, notes);
    await settle(page);
  };
  const onScreen = (page) =>
    page.evaluate(() => ({
      cards: document.querySelectorAll("[data-arf-pop]").length,
      dims: document.querySelectorAll(".arf-shade").length,
    }));

  await inTab(browser, {}, async (page) => {
    ok("nothing is up before the model says anything", JSON.stringify(await onScreen(page)) === '{"cards":0,"dims":0}');
    await say(page, "<REFINE_NOTES>\nWhat reads weakly: the simile could sit in any story.\n</REFINE_NOTES>");
    const mid = await onScreen(page);
    ok("and nothing opens while it is working", mid.cards === 0 && mid.dims === 0, JSON.stringify(mid));

    // The refine lands, and that is the one card there is.
    await page.evaluate(() => {
      window.__fromBackend({
        type: "refined", chatId: "c1", messageId: "m2", canUndo: true,
        before: "The cold hit her like an electric shock, and her body went stiff.",
        after: "The cold met her, and her body locked.",
      });
    });
    await settle(page);
    const done = await page.evaluate(() => {
      const el = document.querySelector("[data-arf-pop]");
      return el
        ? { cards: document.querySelectorAll("[data-arf-pop]").length, diff: !!el.querySelector("[data-arf-diff]") }
        : null;
    });
    ok("landing opens one card, and it says what changed", !!done && done.cards === 1 && done.diff, JSON.stringify(done));

    // And the working that never went on screen is in the Log.
    await goTab(page, "Log");
    const kept = await page.evaluate(() => document.querySelector("[data-arf-kept]").textContent);
    ok("the working it never showed is in the Log", /could sit in any story/.test(kept), kept);
  });
}

console.log("\nthe card that comes up on the page");
{
  // A refine changes writing somebody was reading. The panel is behind a tab
  // they may never have opened, so the before, the after and the way back go on
  // the page itself.
  const land = async (page) => {
    await page.evaluate(() => {
      window.__fromBackend({
        type: "refined",
        chatId: "c1",
        messageId: "m2",
        canUndo: true,
        before: "It hit him like an electric shock, and his whole upper body went stiff.",
        after: "It hit him hard, and his whole upper body locked rigid.",
      });
    });
    await settle(page);
  };
  const pop = (page) => page.evaluate(() => !!document.querySelector("[data-arf-pop]"));

  await inTab(browser, {}, async (page) => {
    ok("nothing is on the page before a refine lands", !(await pop(page)));
    await land(page);
    ok("a refine puts a card on the page", await pop(page));
    const said = await page.evaluate(() =>
      document.querySelector("[data-arf-pop]").textContent);
    ok("with what it said before", /electric shock/.test(said), said.slice(0, 80));
    ok("and what it says now", /locked rigid/.test(said), said.slice(0, 80));

    // What changed is marked on the words, not left for the reader to find by
    // comparing two paragraphs.
    const marks = await page.evaluate(() => {
      const w = document.querySelector("[data-arf-diff]");
      const grab = (cls) => Array.from(w.querySelectorAll("." + cls)).map((n) => n.textContent).join("|");
      const plain = Array.from(w.querySelectorAll("span"))
        .filter((n) => !n.className)
        .map((n) => n.textContent)
        .join("|");
      const cutStyle = w.querySelector(".arf-cut") && getComputedStyle(w.querySelector(".arf-cut"));
      const addStyle = w.querySelector(".arf-add") && getComputedStyle(w.querySelector(".arf-add"));
      return {
        cut: grab("arf-cut"),
        add: grab("arf-add"),
        plain: plain,
        struck: cutStyle ? cutStyle.textDecorationLine : "",
        addStruck: addStyle ? addStyle.textDecorationLine : "",
        cutColour: cutStyle ? cutStyle.color : "",
        addColour: addStyle ? addStyle.color : "",
      };
    });
    ok("words taken out are marked", /electric shock/.test(marks.cut), JSON.stringify(marks.cut));
    ok("and struck through", /line-through/.test(marks.struck), marks.struck);
    ok("words put in are marked", /locked rigid/.test(marks.add), JSON.stringify(marks.add));
    ok("and not struck through", !/line-through/.test(marks.addStruck), marks.addStruck);
    ok("the two are not the same colour", marks.cutColour !== marks.addColour,
      marks.cutColour + " vs " + marks.addColour);
    // "It" and "him" survive the rewrite in the fixture below, unmarked.
    ok("and what did not change is left plain", marks.plain.trim().length > 0, JSON.stringify(marks.plain));

    // A dim behind it, so the eye goes to the card.
    const shade = await page.evaluate(() => {
      const el = document.querySelector("[data-arf-shade]");
      if (!el) return null;
      const st = getComputedStyle(el);
      return { z: Number(st.zIndex), bg: st.backgroundColor, fixed: st.position === "fixed" };
    });
    ok("with a dim behind it", !!shade && shade.fixed && /rgba?\(/.test(shade.bg), JSON.stringify(shade));
    ok(
      "under the card rather than over it",
      shade &&
        shade.z <
          (await page.evaluate(() => Number(getComputedStyle(document.querySelector("[data-arf-pop]")).zIndex))),
    );

    // Readable on the theme, measured the same way the panel is.
    const worst = await page.evaluate(() => {
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
      let worst = 99;
      let where = "";
      for (const el of document.querySelectorAll("[data-arf-pop] *")) {
        if (!Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
        const box = el.getBoundingClientRect();
        if (!box.width || !box.height) continue;
        const st = getComputedStyle(el);
        const fg = parse(st.color);
        if (!fg) continue;
        const px = parseFloat(st.fontSize) || 16;
        const big = px >= 24 || ((parseInt(st.fontWeight, 10) || 400) >= 700 && px >= 18.66);
        const r = ratio(over(fg, backdrop(el)), backdrop(el)) / (big ? 3 : 4.5);
        if (r < worst) {
          worst = r;
          where = (el.className || el.tagName) + ": " + el.textContent.trim().slice(0, 30);
        }
      }
      return { worst: worst, where: where };
    });
    ok(
      "and every word on it is readable",
      worst.worst >= 1,
      "worst was " + worst.worst.toFixed(2) + " of its floor on " + worst.where,
    );

    // Keeping it closes the card and leaves the refine in the Log.
    await page.evaluate(() => document.querySelector("[data-arf-pop-keep]").click());
    await settle(page);
    ok("keeping it closes the card", !(await pop(page)));
    ok(
      "and takes the dim with it",
      await page.evaluate(() => !document.querySelector("[data-arf-shade]")),
    );
    await goTab(page, "Log");
    ok(
      "and the refine is still there to put back",
      await page.evaluate(() => !!document.querySelector("[data-arf-last]")),
    );
  });

  // The same refine twice is one card, not two stacked on each other.
  await inTab(browser, {}, async (page) => {
    await land(page);
    await land(page);
    const n = await page.evaluate(() => document.querySelectorAll("[data-arf-pop]").length);
    ok("the same refine does not stack a second card", n === 1, "found " + n);
  });

  // It sits on the page, over somebody's chat, at whatever size their screen
  // is. The two that matter are a narrow phone, where anything fixed-width
  // pushes the page sideways, and a desktop, where it must not take the middle
  // of the screen.
  const fits = (page) =>
    page.evaluate(() => {
      const el = document.querySelector("[data-arf-pop]");
      const r = el.getBoundingClientRect();
      const row = el.querySelector(".arf-pop-row").getBoundingClientRect();
      return {
        inside: r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1,
        sideways: document.documentElement.scrollWidth > innerWidth + 1,
        // The buttons are pinned, so they are on screen however long the reply
        // is. A card whose way back has scrolled off the bottom has no way back.
        buttonsSeen: row.bottom <= innerHeight + 1 && row.top >= 0,
        // One scroll region rather than a scroll inside a scroll.
        scrollers: Array.from(el.querySelectorAll("*")).filter((n) => {
          const st = getComputedStyle(n);
          return (
            (st.overflowY === "auto" || st.overflowY === "scroll") &&
            n.scrollHeight > n.clientHeight + 1
          );
        }).length,
      };
    });

  for (const [what, viewport] of [
    ["a narrow phone", { width: 320, height: 568 }],
    ["a usual phone", { width: 390, height: 844 }],
    ["a desktop", { width: 1440, height: 900 }],
  ]) {
    await inTab(browser, { viewport, touch: viewport.width < 560 }, async (page) => {
      await land(page);
      const got = await fits(page);
      ok(what + ": it is on the screen", got.inside, JSON.stringify(got));
      ok(what + ": and nothing is pushed sideways", !got.sideways);
      ok(what + ": with the way back still reachable", got.buttonsSeen);
      ok(what + ": and one thing scrolling, not two", got.scrollers <= 1, "found " + got.scrollers);
    });
  }

  // Switched off, nothing appears on the page and the Log still has it.
  await inTab(browser, { saved: { popup: false } }, async (page) => {
    await land(page);
    ok("switched off, nothing comes up on the page", !(await pop(page)));
    await goTab(page, "Log");
    ok(
      "and the refine is still in the tab",
      await page.evaluate(() => !!document.querySelector("[data-arf-last]")),
    );
  });
}

console.log("\nthe raw view");
{
  await inTab(browser, {}, async (page) => {
    await goTab(page, "Context");
    await page.evaluate(() => document.querySelector('#drawer [data-arf-preview="build"]').click());
    await page.evaluate(() => {
      const id = window.__sent.filter((m) => m.type === "preview_prompt").pop().requestId;
      window.__fromBackend({
        type: "prompt_preview",
        requestId: id,
        ok: true,
        real: true,
        messages: [{ role: "system", content: "the instruction" }],
        parameters: { temperature: 0.4 },
        connectionId: "c-fast",
        reasoning: { source: "off" },
      });
    });
    await settle(page);
    await page.evaluate(() => document.querySelector('#drawer [data-arf-preview="flip"]').click());
    await settle(page);
    const raw = await page.evaluate(() => document.querySelector("#drawer .arf-body").textContent);
    ok("raw shows the request as data", /"messages"/.test(raw) && /"temperature": 0.4/.test(raw));
    ok("with the connection it goes to", /c-fast/.test(raw));
  });
}

console.log("\non a desktop");
{
  // The drawer is wider on a computer, and a panel that only ever gets checked
  // at 380px can lay out badly with room to spare.
  await inTab(
    browser,
    {
      viewport: { width: 1440, height: 900 },
      css: "#drawer{width:460px}",
    },
    async (page) => {
      const spill = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      );
      ok("nothing pushes the page sideways", spill);
      const m = await worstText(page);
      ok(
        "every label is readable",
        m.ok,
        "worst " + m.worst.toFixed(2) + " against " + m.want + " on " + m.where,
      );

      // A mouse gets the smaller targets, which is the point of asking the
      // pointer rather than the width.
      const tall = await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll("#drawer .arf-btn")).find((x) =>
          x.getBoundingClientRect().height > 0,
        );
        return b ? b.getBoundingClientRect().height : 0;
      });
      ok("buttons are mouse sized, not finger sized", tall > 0 && tall < 38, String(tall));

      await goTab(page, "Prompt");
      const wide = await page.evaluate(() => {
        const ta = document.querySelector('#drawer [data-arf-field^="blocktext:"]');
        const box = ta.getBoundingClientRect();
        const card = ta.closest(".arf-card").getBoundingClientRect();
        return { ta: box.width, card: card.width };
      });
      ok(
        "a block box fills the width it is given",
        wide.ta > wide.card - 60,
        JSON.stringify(wide),
      );
    },
  );
}

console.log("\nlight and dark, after every change");
{
  for (const [name, css] of [
    ["dark", ""],
    [
      "light",
      ":root{--lumiverse-bg:#fff;--lumiverse-bg-elevated:#f4f2f8;" +
        "--lumiverse-text:rgba(0,0,0,.9);--lumiverse-text-muted:rgba(0,0,0,.55);" +
        "--lumiverse-text-dim:rgba(0,0,0,.4);--lumiverse-fill:rgba(0,0,0,.05);" +
        "--lumiverse-fill-subtle:rgba(0,0,0,.03);--lumiverse-border:rgba(0,0,0,.12)}" +
        "body{background:#fff}#drawer{background:#fff}",
    ],
  ]) {
    await inTab(browser, { css }, async (page) => {
      // Every tab, since a card only added to one of them is a card only one
      // theme check would ever see.
      for (const label of ["Prompt", "Context", "Model", "Limits", "Log", "Setup"]) {
        await goTab(page, label);
        const m = await worstText(page);
        ok(
          name + ": " + label + " is readable",
          m.ok,
          "worst " + m.worst.toFixed(2) + " on " + m.where,
        );
      }
    });
  }
}

console.log("\nhow much it is told");
{
  await inTab(browser, {}, async (page) => {
    await goTab(page, "Context");
    const there = await page.evaluate(() => ({
      msgs: !!document.querySelector('#drawer [data-arf-field="contextMessages"]'),
      hist: !!document.querySelector('#drawer [data-arf-field="maxHistoryTokens"]'),
      lore: !!document.querySelector('#drawer [data-arf-field="maxLoreTokens"]'),
    }));
    ok("both token budgets are there beside the message count", there.msgs && there.hist && there.lore);

    await page.evaluate(() => {
      const b = document.querySelector('#drawer [data-arf-field="maxLoreTokens"]');
      b.value = "800";
      b.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const sent = await page.evaluate(() => {
      const last = window.__sent.filter((m) => m.type === "set_settings").pop();
      return last.settings;
    });
    ok("and reach the backend", sent.maxLoreTokens === 800);
  });
}

console.log("\na switch and the rows that hang off it");
{
  // A row that hangs off a switch has to go when the switch does, on the spot.
  // Both halves of that were once wrong: the row was drawn whatever the switch
  // said, and flipping the switch did not repaint, so the panel only told the
  // truth after you left the tab and came back. This drives the switch and
  // reads the panel without leaving it.
  //
  // Nothing here waits for the rebuild that follows a switch. The row has to be
  // right in the frame after the tap, because the whole point of doing it in
  // place is that nobody is waiting on anything.
  const there = (page, key) => onScreen(page, key);
  const flip = async (page, key) => {
    await page.evaluate((k) => {
      document.querySelector('[data-arf-field="' + k + '"]').click();
    }, key);
    await settle(page);
  };

  await inTab(browser, { saved: { widgetOn: true } }, async (page) => {
    await goTab(page, "Setup");
    ok("the row is there while the switch above it is on", await there(page, "widgetSize"));
    await flip(page, "widgetOn");
    ok("switching it off takes the row with it, on the spot", !(await there(page, "widgetSize")));
    await flip(page, "widgetOn");
    ok("and switching it back on brings it back", await there(page, "widgetSize"));
    // The switch itself has to survive its own repaint, or a second tap lands
    // on a box that was never redrawn.
    const state = await page.evaluate(
      () => document.querySelector('[data-arf-field="widgetOn"]').checked,
    );
    ok("the switch is left reading the way it was set", state === true);
  });
}

console.log("\nopening a fold");
{
  // Opening one used to repaint the whole drawer to show rows that had already
  // been worked out. That teardown and rebuild is what the flash was.
  await inTab(browser, {}, async (page) => {
    await goTab(page, "Prompt");
    const before = await page.evaluate(() => {
      const head = Array.from(document.querySelectorAll("#drawer .arf-fold"))[0];
      if (!head) return null;
      head.__mark = "the fold";
      const card = head.closest(".arf-card");
      card.__mark = "the card";
      const body = head.nextElementSibling;
      return { shut: !!body.hidden, expanded: head.getAttribute("aria-expanded") };
    });
    ok("a fold starts shut", before && before.shut && before.expanded === "false");

    await page.evaluate(() => document.querySelectorAll("#drawer .arf-fold")[0].click());
    const now = await page.evaluate(() => {
      const head = document.querySelectorAll("#drawer .arf-fold")[0];
      return {
        open: !head.nextElementSibling.hidden,
        expanded: head.getAttribute("aria-expanded"),
        sameHead: head.__mark === "the fold",
        sameCard: head.closest(".arf-card").__mark === "the card",
      };
    });
    ok("clicking it opens the body", now.open && now.expanded === "true");
    ok("without rebuilding the fold", now.sameHead);
    ok("or the card around it", now.sameCard);

    await page.evaluate(() => document.querySelectorAll("#drawer .arf-fold")[0].click());
    const shut = await page.evaluate(() => {
      const head = document.querySelectorAll("#drawer .arf-fold")[0];
      return { shut: !!head.nextElementSibling.hidden, sameHead: head.__mark === "the fold" };
    });
    ok("and shutting it is the same one closing", shut.shut && shut.sameHead);
  });
}

console.log("\nthe working, read as prose");
{
  // What comes back while the model is writing has had the tags taken off by
  // the backend already. What comes back at the end is everything outside
  // <REFINED>, which is the same working with its own tags still round it. Both
  // read as prose on the card, and neither reads as markup.
  const RAW =
    "<REFINE_NOTES>\nThe second line could sit in any story.\n<plan>Cut the simile.</plan>\n</REFINE_NOTES>";
  await inTab(browser, {}, async (page) => {
    await page.evaluate((raw) => {
      window.__fromBackend({ type: "refine_notes", chatId: "c1", messageId: "m1", notes: raw });
    }, RAW);
    await goTab(page, "Log");
    const kept = () => page.evaluate(() => document.querySelector("[data-arf-kept]").textContent);
    const clean = await kept();
    ok("the Log shows no tags", !/[<>]/.test(clean), clean);
    ok("and reads as the working alone", /could sit in any story/.test(clean) && /Cut the simile/.test(clean));
    ok("with no blank left behind where a tag was", !/\n\n\n/.test(clean), JSON.stringify(clean));
    ok(
      "and no switch on the card offering to put them back",
      await page.evaluate(() => !document.querySelector('#drawer [data-arf-field="notesTags"]')),
    );
  });

  // A model that leaves the working's closing tag off, which is what a call cut
  // short looks like. Everything after the opening tag is the working, and
  // showing it beats showing nothing.
  await inTab(browser, {}, async (page) => {
    await page.evaluate(() => {
      window.__fromBackend({
        type: "refine_notes",
        chatId: "c1",
        messageId: "m1",
        notes: "<REFINE_NOTES>\nThe simile is doing no work.",
      });
    });
    await goTab(page, "Log");
    const cut = await page.evaluate(() => document.querySelector("[data-arf-kept]").textContent);
    ok("working with no closing tag still reads", /simile is doing no work/.test(cut) && !/[<>]/.test(cut), cut);
  });

  // A prompt that asks for no working still gets an answer, and that answer is
  // the rewrite. Taking it would put the rewrite itself under What the model
  // worked out, which is neither what the card says nor what anybody is looking
  // for there.
  await inTab(browser, {}, async (page) => {
    await page.evaluate(() => {
      window.__fromBackend({
        type: "refined",
        chatId: "c1",
        messageId: "m1",
        canUndo: true,
        before: "She let out a breath she did not know she was holding.",
        after: "She breathed out and turned away.",
      });
      window.__fromBackend({
        type: "refine_notes",
        chatId: "c1",
        messageId: "m1",
        notes: "Here you go.\n<REFINED>\nShe breathed out and turned away.\n</REFINED>",
      });
    });
    await goTab(page, "Log");
    const said = await page.evaluate(() => {
      const well = document.querySelector("[data-arf-kept]");
      return {
        well: well ? well.textContent : null,
        card: document.querySelector('[data-arf-card="What the model worked out"]').textContent,
      };
    });
    ok("an answer with no working in it keeps nothing", said.well === null, String(said.well));
    ok(
      "and the card says why rather than showing the rewrite",
      /does not ask the model for its working/.test(said.card),
      said.card.slice(0, 120),
    );
  });
}

console.log("\nthe working the Log keeps");
{
  const notes = "The second line could sit in any story. Cutting the simile.";
  const feed = (page, m) => page.evaluate((x) => window.__fromBackend(x), m);
  const working = (page) =>
    feed(page, { type: "refine_progress", stage: "writing", chars: 40, notes: notes });
  const kept = (page) =>
    page.evaluate(() => {
      const card = document.querySelector('#drawer [data-arf-card="What the model worked out"]');
      return card ? card.textContent : "";
    });

  // A refine that finished leaves its working where it can be read afterwards,
  // since the card that lands on screen covers the one that was showing it.
  await inTab(browser, {}, async (page) => {
    await goTab(page, "Log");
    ok("nothing kept before a refine", !/could sit in any story/.test(await kept(page)));
    await working(page);
    await feed(page, {
      type: "refined",
      chatId: "c1",
      messageId: "m1",
      canUndo: true,
      before: "a",
      after: "b",
    });
    await settle(page);
    ok("a refine that finished leaves its working in the Log", /could sit in any story/.test(await kept(page)));
    ok("said to be from a refine that was saved", /saved/.test(await kept(page)));
  });

  // Changing your mind is not a finished refine, so it takes nothing away.
  await inTab(browser, {}, async (page) => {
    await goTab(page, "Log");
    await working(page);
    await feed(page, {
      type: "refined",
      chatId: "c1",
      messageId: "m1",
      canUndo: false,
      before: "a",
      after: "b",
    });
    await settle(page);
    ok("one refine's working is kept", /could sit in any story/.test(await kept(page)));

    await feed(page, {
      type: "refine_progress",
      stage: "writing",
      chars: 5,
      notes: "Halfway through a thought",
    });
    await feed(page, { type: "refine_stopped", stopped: true });
    await settle(page);
    const after = await kept(page);
    ok("stopping the next one leaves it alone", /could sit in any story/.test(after));
    ok("and does not keep what it had half written", !/Halfway through a thought/.test(after));
  });

  // A rewrite the checks threw out still finished, and its working is the most
  // useful thing on the panel for working out why.
  await inTab(browser, {}, async (page) => {
    await goTab(page, "Log");
    await working(page);
    await feed(page, {
      type: "refine_skipped",
      chatId: "c1",
      messageId: "m1",
      why: "the rewrite grew by half",
      notes: notes,
    });
    await settle(page);
    const said = await kept(page);
    ok("a dropped rewrite keeps its working too", /could sit in any story/.test(said));
    ok("and says what happened to it", /grew by half/.test(said));
  });
}

console.log("\nthe card is handed over, never swapped");
{
  // Counting what is on the page cannot catch this: the swap happens inside one
  // task, so there is never a frame with two cards in it. What reads as a
  // second card is a new element fading up from nothing where the old one was,
  // at a different height, with the dim behind it restarting its own fade. So
  // what is measured is whether the card survived.
  //
  // The automatic pass lands one reply after another, which is where this
  // happens: a card for the second refine replacing the card for the first.
  await inTab(browser, {}, async (page) => {
    const out = await page.evaluate(async () => {
      const card = () => document.querySelector("[data-arf-pop]");
      const rest = () => new Promise((r) => setTimeout(r, 450));
      const read = () => {
        const c = card();
        if (!c) return { gone: true };
        return {
          same: c.__id === "A",
          lit: Math.round(getComputedStyle(c).opacity * 100),
          dims: document.querySelectorAll(".arf-shade").length,
        };
      };
      const land = (id, before, after) =>
        window.__fromBackend({ type: "refined", chatId: "c1", messageId: id, canUndo: true, before, after });
      const steps = {};
      land("m1", "She let out a breath she did not know she was holding, then turned.", "She breathed out.");
      card().__id = "A";
      await rest();
      steps.first = read();
      land("m2", "A different sentence entirely, rather longer than the last one was.", "Shorter.");
      steps.second = read();
      await rest();
      steps.settled = read();
      land("m3", "And a third, shorter.", "Third.");
      steps.third = read();
      await rest();
      return steps;
    });
    const kept = (r) => r && !r.gone && r.same && r.lit === 100 && r.dims === 1;
    ok("the first refine opens the card", kept(out.first), JSON.stringify(out.first));
    ok("the next one fills the same card", kept(out.second), JSON.stringify(out.second));
    ok("and it settles as the same card", kept(out.settled), JSON.stringify(out.settled));
    ok("and so does the one after that", kept(out.third), JSON.stringify(out.third));
  });
}

console.log("\nnever two things on the screen at once");
{
  // Ending a refine leaves the card showing the working standing for one frame,
  // so the card saying what the refine did can fill the same box rather than a
  // second one arriving beside it. One ending fills nothing: a refine waiting on
  // your yes hands the screen to the host's own question instead, and waiting a
  // frame there had the question painted on top of the working card. Two cards
  // at once, which is one popping up under another.
  const NOTES = Array.from({ length: 14 }, (_, i) => "line " + i + " of the working").join("\n");
  const worst = async (page, msgs) =>
    page.evaluate(async (list) => {
      const look = () => ({
        cards: document.querySelectorAll("[data-arf-pop]").length,
        dims: document.querySelectorAll(".arf-shade").length,
        host: document.getElementById("hostmodal") ? 1 : 0,
      });
      let cards = 0;
      let dims = 0;
      let both = 0;
      const take = () => {
        const n = look();
        cards = Math.max(cards, n.cards);
        dims = Math.max(dims, n.dims);
        if (n.cards && n.host) both = 1;
      };
      for (const m of list) {
        if (m.__wait) {
          for (let i = 0; i < m.__wait; i++) {
            await new Promise((r) => requestAnimationFrame(r));
            take();
          }
          continue;
        }
        window.__fromBackend(m);
        take();
      }
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        take();
      }
      return { cards, dims, both };
    }, msgs);

  const prog = { type: "refine_progress", stage: "writing", chars: 40, notes: NOTES };
  const landed = {
    type: "refined",
    chatId: "c1",
    messageId: "m1",
    canUndo: true,
    before: "She let out a breath she did not know she was holding, then turned away.",
    after: "She breathed out and turned away.",
  };
  const wait = { __wait: 14 };
  const one = (got) => got.cards <= 1 && got.dims <= 1 && !got.both;

  await inTab(browser, {}, async (page) => {
    ok("working, then it lands", one(await worst(page, [prog, wait, landed])), JSON.stringify(await worst(page, [])));
    ok("a second refine over the card the first left", one(await worst(page, [prog, wait, landed])));
    ok("two back to back with no gap at all", one(await worst(page, [prog, landed, prog, landed])));
    ok(
      "one that is stopped, then one that lands",
      one(await worst(page, [prog, wait, { type: "refine_stopped", stopped: true }, prog, wait, landed])),
    );
  });

  await inTab(browser, { saved: { confirmBeforeSave: true } }, async (page) => {
    const got = await worst(page, [
      prog,
      wait,
      {
        type: "confirm_refine",
        chatId: "c1",
        messageId: "m1",
        before: "a long line that was there before",
        after: "short now",
      },
    ]);
    ok("a refine waiting on your yes never shows two", one(got), JSON.stringify(got));
    ok("and the host's question is what is left", await page.evaluate(() => !!document.getElementById("hostmodal")));
  });
}

console.log("\nno card while it is working");
{
  // The working never goes on the page. It used to open a card of its own that
  // then had to be handed over, or taken down, depending on how the refine
  // ended; four endings, each with its own way to leave a card behind. There is
  // nothing to leave behind now.
  // keeps says whether that ending is a refine that finished. A stop is not, so
  // it leaves the Log holding whatever the last finished one worked out, which
  // here is nothing.
  const endings = [
    { what: "stopped", keeps: false, msg: { type: "refine_stopped", stopped: true } },
    {
      what: "dropped by a check",
      keeps: true,
      msg: { type: "refine_skipped", why: "the rewrite grew by half" },
    },
    {
      what: "saved with nothing to put back",
      keeps: true,
      msg: { type: "refined", chatId: "c1", messageId: "m1", canUndo: false },
    },
  ];
  for (const one of endings) {
    await inTab(browser, {}, async (page) => {
      const up = await page.evaluate(() => {
        window.__fromBackend({
          type: "refine_progress",
          stage: "writing",
          chars: 40,
          notes: "<REFINE_NOTES>The second line could sit in any story.</REFINE_NOTES>",
        });
        return document.querySelectorAll("[data-arf-pop],.arf-shade").length;
      });
      ok(one.what + ": nothing is on screen while it works", up === 0, String(up));
      await page.evaluate((m) => window.__fromBackend(m), one.msg);
      await settle(page);
      const after = await page.evaluate(
        () => document.querySelectorAll("[data-arf-pop],.arf-shade").length,
      );
      ok(one.what + ": and nothing is left behind by the ending", after === 0, String(after));
      await goTab(page, "Log");
      const kept = await page.evaluate(() => {
        const well = document.querySelector("[data-arf-kept]");
        return well ? well.textContent : null;
      });
      if (one.keeps)
        ok(one.what + ": the working is in the Log", /could sit in any story/.test(kept || ""), String(kept));
      else
        ok(one.what + ": nothing is kept, since it never finished", kept === null, String(kept));
    });
  }
}

console.log("\nswitching without the panel jumping");
{
  // A switch that rebuilds the panel takes its own knob down with it, so the
  // slide never runs, and the page lands wherever the rebuild left it. Both
  // read as the panel flinching under the finger. The Prompt tab is where it
  // was worst: the whole prompt is there, several boxes of it, and greying one
  // block out was tearing all of it down.
  await inTab(browser, { viewport: { width: 420, height: 520 } }, async (page) => {
    await goTab(page, "Prompt");
    const before = await page.evaluate(() => {
      // Marks that only survive if the nodes do.
      const boxes = document.querySelectorAll("#drawer .arf-block textarea");
      for (let i = 0; i < boxes.length; i++) boxes[i].__mark = i;
      const sw = document.querySelector("#drawer .arf-block .arf-box");
      sw.__mark = "the switch";
      const head = Array.from(document.querySelectorAll("#drawer .arf-cardh")).find((h) =>
        / on$/.test(h.textContent.trim()),
      );
      window.scrollTo(0, 180);
      return { at: window.scrollY, count: head && head.textContent.trim() };
    });
    ok("there is enough prompt to scroll past", before.at > 0);

    await page.evaluate(() => document.querySelector("#drawer .arf-block .arf-box").click());
    await settle(page);
    const now = await page.evaluate(() => {
      const sw = document.querySelector("#drawer .arf-block .arf-box");
      const ta = document.querySelector("#drawer .arf-block textarea");
      return {
        at: window.scrollY,
        sameSwitch: sw.__mark === "the switch",
        sameText: ta.__mark === 0,
        hushed: /arf-hushed/.test(sw.closest(".arf-block").className),
        off: !sw.checked,
      };
    });
    ok("the switch is the same one, so its knob has something to slide", now.sameSwitch);
    ok("the prompt boxes are left standing", now.sameText);
    ok("the block greys out on the spot", now.off && now.hushed);
    ok("and the page has not moved", now.at === before.at, before.at + " -> " + now.at);

    // The count on the card, the warning about {{message}} and the header all
    // catch up, and none of it is a rebuild: the boxes of prompt are the
    // tallest thing on the tab, and tearing them down to change a count was
    // the flicker.
    const at = await page.evaluate(() => {
      const head = Array.from(document.querySelectorAll("#drawer .arf-cardh")).find((h) =>
        / on$/.test(h.textContent.trim()),
      );
      return head && head.textContent.trim();
    });
    ok("the card catches up with what is on, at once", at !== before.count, before.count + " -> " + at);

    await page.evaluate(() => new Promise((r) => setTimeout(r, 500)));
    const after = await page.evaluate(() => {
      const ta = document.querySelector("#drawer .arf-block textarea");
      return { rebuilt: ta.__mark === undefined, at: window.scrollY, count: (Array.from(document.querySelectorAll("#drawer .arf-cardh")).find((h) => / on$/.test(h.textContent.trim())) || {}).textContent };
    });
    ok("and the boxes of prompt are never rebuilt for it", !after.rebuilt);
    ok("the count stays right after everything has settled", (after.count || "").trim() === at);
    ok("and it lands where you were reading", after.at === before.at, before.at + " -> " + after.at);
  });

  // The same for a switch with rows hanging off it: the row arrives without the
  // panel being built again around it.
  await inTab(browser, {}, async (page) => {
    await goTab(page, "Setup");
    await page.evaluate(() => {
      document.querySelector('#drawer [data-arf-field="widgetOn"]').__mark = "the switch";
    });
    await page.evaluate(() => {
      document.querySelector('#drawer [data-arf-field="widgetOn"]').click();
    });
    const kept = await page.evaluate(
      () => document.querySelector('#drawer [data-arf-field="widgetOn"]').__mark === "the switch",
    );
    ok("the switch survives its own row appearing", kept);
    ok("and the row is there in the same frame", await onScreen(page, "widgetSize"));
  });

  // The address is watched on a timer and the backend is asked where we are
  // whenever the two disagree. Most of those answers say what the last one
  // said, and rebuilding for one of them lands in the middle of whatever
  // somebody was reading, which is the other half of a panel that jumps on its
  // own.
  await inTab(browser, {}, async (page) => {
    const answer = () =>
      page.evaluate(() => {
        const id = window.__sent.filter((m) => m.type === "active_chat").pop().requestId;
        window.__fromBackend({
          type: "active_chat",
          requestId: id,
          chatId: "c1",
          character: "Ada",
          hasCharacter: true,
          resolved: true,
          found: true,
        });
      });
    await answer();
    await settle(page);
    await answer();
    await settle(page);
    await page.evaluate(() => {
      document.querySelector("#drawer .arf-tabs").__mark = "the tabs";
    });
    await answer();
    await settle(page);
    const kept = await page.evaluate(
      () => document.querySelector("#drawer .arf-tabs").__mark === "the tabs",
    );
    ok("an answer saying what the last one said rebuilds nothing", kept);
  });
}

console.log("\nwalking back into a chat");
{
  // Tapping a character opens a chat, and on some builds nothing says so. The
  // watch used to stop the moment there was no chat to lose track of, so the
  // panel sat on "No chat open" until a reply happened to arrive.
  const answer = async (page, chatId) => {
    await page.evaluate((id) => {
      const req = window.__sent.filter((m) => m.type === "active_chat").pop().requestId;
      window.__fromBackend({
        type: "active_chat",
        requestId: req,
        chatId: id,
        character: id ? "Wren" : null,
        hasCharacter: !!id,
        resolved: true,
      });
    }, chatId);
    await settle(page);
  };
  const asked = (page) =>
    page.evaluate(() => window.__sent.filter((m) => m.type === "active_chat").length);
  const saysNoChat = (page) =>
    page.evaluate(() => document.querySelector("#drawer").textContent.indexOf("No chat") >= 0);
  // Not in any chat by name, which is what "did it take a guess for a chat"
  // asks. Saying no chat is open is a different claim and has its own check.
  const noneNamed = (page) =>
    page.evaluate(() => !/You are in .*'s chat/.test(document.querySelector("#drawer").textContent));
  // The watch reads the address on a timer, so these have to wait for a tick.
  const tick = (page) => page.evaluate(() => new Promise((r) => setTimeout(r, 1600)));

  await inTab(browser, {}, async (page) => {
    await goTab(page, "Setup");
    await answer(page, null);
    ok("the home screen says no chat is open", await saysNoChat(page));

    const before = await asked(page);
    await page.evaluate(() => history.pushState({}, "", "/chat/abcdef123456"));
    await tick(page);
    ok("an address that becomes a chat's is asked about", (await asked(page)) > before);

    await answer(page, "abcdef123456");
    ok("and the panel stops saying no chat is open", !(await saysNoChat(page)));
    ok(
      "and names the chat it is in",
      await page.evaluate(
        () => document.querySelector("#drawer").textContent.indexOf("You are in Wren's chat") >= 0,
      ),
    );

    // Walking out again, with the backend still naming the chat just left.
    // That one answer is the reason the address is read at all.
    await page.evaluate(() => history.pushState({}, "", "/"));
    await tick(page);
    await answer(page, "abcdef123456");
    ok("walking out reads as no chat, whatever the backend says", await saysNoChat(page));
  });

  // Tapping a character on Lumiverse does not open a chat, it makes one, and
  // that is the only way in. For a moment afterwards the server does not call
  // the new chat the active one, so a question of "which chat is open" comes
  // back "none" while you are plainly sitting in one. The panel used to ask
  // exactly that question the instant the host named the chat, and then throw
  // the id away on the answer.
  await inTab(browser, {}, async (page) => {
    await goTab(page, "Setup");
    await answer(page, null);

    await page.evaluate(() => history.pushState({}, "", "/chat/madejustnow99"));
    await page.evaluate(() => {
      for (const f of window.__handlers.CHAT_CHANGED || []) f({ chatId: "madejustnow99" });
    });
    await settle(page);
    const ask = await page.evaluate(() => {
      const m = window.__sent.filter((x) => x.type === "active_chat").pop();
      return m ? m.chatId : null;
    });
    ok("a chat the host named is asked about by name", ask === "madejustnow99", "asked about " + ask);

    // The server, still behind. This is the answer that used to undo everything.
    await answer(page, null);
    ok("and an answer about no active chat does not undo it", !(await saysNoChat(page)));
  });

  // And the harder shape of the same thing, which is what was actually
  // happening: nothing announces the new chat at all, and the server is behind,
  // so the only thing that knows is the address. Reading the id out of it needs
  // to know where in an address an id sits, which is learned from a chat we
  // were sure about rather than assumed from the shape of a Lumiverse URL.
  const reply = async (page, body) => {
    await page.evaluate((b) => {
      const m = window.__sent.filter((x) => x.type === "active_chat").pop();
      window.__fromBackend(Object.assign({ type: "active_chat", requestId: m.requestId }, b));
    }, body);
    await settle(page);
  };
  const askedAbout = (page) =>
    page.evaluate(() => {
      const m = window.__sent.filter((x) => x.type === "active_chat").pop();
      return m ? m.chatId : undefined;
    });

  await inTab(browser, {}, async (page) => {
    await goTab(page, "Setup");
    // In a chat, with its id in the address. This is the moment the slot is
    // learned, and the only moment it can be.
    await page.evaluate(() => history.pushState({}, "", "/chat/oldchat00001"));
    await reply(page, {
      chatId: "oldchat00001", character: "Wren", hasCharacter: true, resolved: true, found: true,
    });
    await tick(page);

    // Out to the home screen.
    await page.evaluate(() => history.pushState({}, "", "/"));
    await tick(page);
    await reply(page, { chatId: null, resolved: true, found: false });
    ok("out on the home screen, no chat is open", await saysNoChat(page));

    // Tap a character. The chat is made. No event, and the server has not
    // caught up.
    await page.evaluate(() => history.pushState({}, "", "/chat/madejustnow01"));
    await tick(page);
    ok(
      "the id in the address is what gets asked about",
      (await askedAbout(page)) === "madejustnow01",
      "asked about " + (await askedAbout(page)),
    );
    // An id the backend cannot find a chat under is not a chat.
    await reply(page, { chatId: "madejustnow01", resolved: true, found: false });
    ok("an id that names no chat is not taken for one", await noneNamed(page));
    // But it stops claiming there is no chat, because the address says there is.
    ok("and it stops saying no chat is open", !(await saysNoChat(page)));

    // The server catches up. Nothing navigates, nothing reloads.
    await tick(page);
    await reply(page, {
      chatId: "madejustnow01", character: "Wren", hasCharacter: true, resolved: true, found: true,
    });
    ok(
      "and it lands in the chat once the server agrees it exists",
      await page.evaluate(
        () => document.querySelector("#drawer").textContent.indexOf("You are in Wren's chat") >= 0,
      ),
    );
  });

  // ---- and the same question asked the moment the panel is built ----
  // Pressing Update in the extensions panel tears the panel down and sets it up
  // again in place, with no reload. It comes back knowing nothing: no chat, and
  // nothing walked out of. Asked which chat is open, the backend answers with
  // the account's most recent one, which on the home screen is the chat you
  // were in before the update.
  const rebuild = (page, url) =>
    page.evaluate((u) => {
      try { window.__teardown && window.__teardown(); } catch (_) {}
      document.getElementById("drawer").innerHTML = "";
      history.pushState({}, "", u);
      window.__sent = [];
      window.__handlers = {};
      window.__teardown = window.__setup({
        events: {
          on: (n, f) => {
            (window.__handlers[n] = window.__handlers[n] || []).push(f);
            return () => {};
          },
        },
        ui: {
          registerDrawerTab: () => ({
            root: document.getElementById("drawer"),
            setBadge: () => {}, activate: () => {}, destroy: () => {},
          }),
          registerInputBarAction: () => ({ onClick: () => () => {}, destroy: () => {} }),
          toast: () => {},
        },
        dom: { addStyle: () => () => {}, inject: () => {}, cleanup: () => {} },
        storage: { get: async () => null, set: async () => {} },
        sendToBackend: (m) => window.__sent.push(m),
        onBackendMessage: (cb) => { window.__fromBackend = cb; return () => {}; },
      });
    }, url);
  // Every question outstanding, answered the same way. The panel asks more than
  // once on purpose after a rebuild, and answering only the last one would
  // leave the earlier ones hanging.
  const answerAll = (page, body) =>
    page.evaluate((b) => {
      const asks = window.__sent.filter((x) => x.type === "active_chat");
      for (const one of asks)
        window.__fromBackend(Object.assign({ type: "active_chat", requestId: one.requestId }, b));
      return asks.length;
    }, body);
  const readyToRefine = (page) =>
    page.evaluate(
      () => document.querySelector("#drawer").textContent.indexOf("waiting for you to press") >= 0,
    );

  await inTab(browser, {}, async (page) => {
    await goTab(page, "Setup");
    // A chat first, so the address has taught the panel where an id sits. That
    // is remembered in this browser, which is why it survives the rebuild.
    await page.evaluate(() => history.pushState({}, "", "/chat/oldchat00001"));
    await reply(page, {
      chatId: "oldchat00001", character: "Wren", hasCharacter: true, resolved: true, found: true,
    });
    await tick(page);

    await rebuild(page, "/");
    await settle(page);
    await answerAll(page, {
      chatId: "oldchat00001", character: "Wren", hasCharacter: true, resolved: true, found: true,
    });
    await settle(page);
    ok("rebuilt on the home screen, the last chat is not taken for this one",
      await saysNoChat(page));
    ok("and it does not offer to refine there", !(await readyToRefine(page)));
  });

  // The other way round, on a build whose addresses name no chats: the backend
  // has just restarted with the panel and does not know yet. One answer of
  // "nobody is in a chat" used to be the last word, and the panel sat on it in
  // a chat somebody was reading.
  await inTab(browser, {}, async (page) => {
    await goTab(page, "Setup");
    await rebuild(page, "/");
    await settle(page);
    await answerAll(page, { chatId: null, resolved: true, found: false });
    await settle(page);
    ok("a backend still starting up says no chat, and is believed for now",
      await saysNoChat(page));

    // It comes up, and is asked again without anybody navigating.
    await page.evaluate(() => new Promise((r) => setTimeout(r, 6500)));
    const asks = await page.evaluate(
      () => window.__sent.filter((x) => x.type === "active_chat").length);
    ok("but it is asked again rather than taken as final", asks > 1, "asked " + asks);
    await answerAll(page, {
      chatId: "warmchat00001", character: "Wren", hasCharacter: true, resolved: true, found: true,
    });
    await settle(page);
    ok("and the panel lands in the chat once it answers", !(await saysNoChat(page)));
  });
}

console.log("\nthe live line while a refine is running");
{
  // The clock writes the status line four times a second, and a repaint builds
  // it from nothing. They worked it out separately and disagreed: the clock
  // wrote "Thinking, 12s" and a repaint wrote "Refining a reply", so switching
  // tabs mid-refine threw the line back to the flat wording and the count
  // started again, which reads as the thing stopping.
  const line = (page) =>
    page.evaluate(() => {
      const dot = document.querySelector("#drawer .arf-dot");
      return dot && dot.parentElement ? dot.parentElement.textContent.trim() : "";
    });

  await inTab(browser, {}, async (page) => {
    await goTab(page, "Log");
    await page.evaluate(() => {
      const id = window.__sent.filter((m) => m.type === "active_chat").pop().requestId;
      window.__fromBackend({
        type: "active_chat", requestId: id, chatId: "c1",
        character: "Wren", hasCharacter: true, resolved: true,
      });
    });
    await settle(page);
    // A refine, thinking.
    await page.evaluate(() => {
      for (const f of window.__handlers.GENERATION_ENDED || []) f({ chatId: "c1", messageId: "m2" });
    });
    await page.evaluate(() => {
      window.__fromBackend({ type: "refine_progress", stage: "thinking" });
    });
    await settle(page);
    const running = await line(page);
    ok("it says what the refine is doing", /think/i.test(running), "line read " + JSON.stringify(running));

    await goTab(page, "Setup");
    const after = await line(page);
    ok(
      "and goes on saying it after a tab switch",
      /think/i.test(after),
      "line read " + JSON.stringify(after),
    );
    ok(
      "with the clock where it was, not back at nothing",
      after.replace(/\d+s/, "") === running.replace(/\d+s/, ""),
      JSON.stringify(running) + " became " + JSON.stringify(after),
    );
  });
}

console.log("\nhow long to wait");
{
  await inTab(browser, {}, async (page) => {
    await goTab(page, "Model");
    const box = await page.evaluate(() => {
      const el = document.querySelector('[data-arf-field="timeoutSecs"]');
      return el ? { min: el.min, max: el.max } : null;
    });
    // A reasoning model on a high effort level can think for a long time, so
    // ten minutes is not the ceiling and there has to be a way to switch the
    // wait off entirely.
    ok("the wait goes up to an hour", box && Number(box.max) >= 3600, JSON.stringify(box));
    ok("and down to nought, which is off", box && Number(box.min) === 0, JSON.stringify(box));

    await page.evaluate(() => {
      const el = document.querySelector('[data-arf-field="timeoutSecs"]');
      el.value = "0";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new Event("blur", { bubbles: true }));
    });
    await settle(page);
    const sent = await page.evaluate(() => {
      const m = window.__sent.filter((x) => x.type === "set_settings").pop();
      return m ? m.settings.timeoutSecs : "(nothing sent)";
    });
    ok("switching it off reaches the backend as nought", sent === 0, "sent " + sent);
  });
}

console.log("\nreading the request at full size");
{
  await inTab(browser, {}, async (page) => {
    await goTab(page, "Context");
    // Try it does not need one: the box is three rows of text you pasted.
    const onTry = await page.evaluate(() => {
      const card = Array.from(document.querySelectorAll("#drawer .arf-card")).find((c) =>
        /^Try it/.test(c.textContent),
      );
      return Array.from(card.querySelectorAll("button")).some(
        (b) => b.textContent.trim() === "Expand",
      );
    });
    ok("Try it has no Expand, because it does not need one", !onTry);

    await page.evaluate(() => document.querySelector('#drawer [data-arf-preview="build"]').click());
    await page.evaluate(() => {
      const id = window.__sent.filter((m) => m.type === "preview_prompt").pop().requestId;
      window.__fromBackend({
        type: "prompt_preview",
        requestId: id,
        ok: true,
        real: true,
        messages: [{ role: "system", content: "the whole instruction, at length" }],
        parameters: null,
        connectionId: "",
        reasoning: { source: "off" },
      });
    });
    await settle(page);
    await page.evaluate(() => {
      const card = Array.from(document.querySelectorAll("#drawer .arf-card")).find((c) =>
        /See what gets sent/.test(c.textContent),
      );
      Array.from(card.querySelectorAll("button"))
        .find((b) => b.textContent.trim() === "Expand")
        .click();
    });
    await settle(page);
    const view = await page.evaluate(() => {
      const over = document.querySelector(".arf-over");
      const ta = over && over.querySelector("textarea");
      const labels = Array.from(over.querySelectorAll("button")).map((b) => b.textContent.trim());
      return { text: ta ? ta.value : "", readOnly: ta ? ta.readOnly : false, labels: labels };
    });
    ok("the preview opens at full size", /the whole instruction, at length/.test(view.text));
    ok("as something to read rather than edit", view.readOnly, view.labels.join(","));
    ok("with Copy and Close, and no Done", view.labels.indexOf("Done") < 0 && view.labels.indexOf("Close") >= 0);
  });
}


console.log("\nrefining the draft from the panel");
{
  // The draft is the third thing a refine can be pointed at, and the only one
  // whose way in used to be a menu or a row inside Extras. It stands with the
  // other two above the tabs, on the same terms: its own setting puts it there.
  await inTab(browser, {}, async (page) => {
    ok("no draft button until the setting asks for it",
      !(await page.$('#drawer [data-arf-draft]')));
  });

  await inTab(browser, { saved: { inputRefine: true } }, async (page) => {
    ok("the draft button stands with the other two", !!(await page.$('#drawer [data-arf-draft]')));
    const order = await page.evaluate(() =>
      [...document.querySelectorAll("#drawer button")]
        .map((b) => b.textContent.trim())
        .filter((t) => /^Refine /.test(t)));
    ok("in the order they are reached for", order[0] === "Refine the latest reply"
      && order[2] === "Refine what I am typing", JSON.stringify(order));

    // It reads the real box, the same one every other way in reads.
    await page.evaluate(() => window.__makeComposer("i walk through it, suddenly"));
    await page.evaluate(() => document.querySelector('#drawer [data-arf-draft]').click());
    await settle(page);
    const asked = await page.evaluate(() => {
      const m = window.__sent.filter((x) => x.type === "try_refine").pop();
      return m && { text: m.text, asUser: m.asUser, id: m.requestId };
    });
    ok("pressing it sends the draft, marked as yours",
      asked && asked.asUser === true && /i walk through it/.test(asked.text), asked);
    // The panel says a refine is running from the moment it is sent, the same
    // as it does for a reply: the three buttons give way to Stop. A draft
    // refine is a stoppable run on the backend, so the offer is a real one.
    const running = await page.evaluate(() => ({
      stop: !!document.querySelector("#drawer [data-arf-stop]"),
      gone: !document.querySelector("#drawer [data-arf-draft]"),
      dot: !!document.querySelector("#drawer .arf-dot.arf-busy"),
    }));
    ok("the panel says it is running from the moment it is sent",
      running.stop && running.gone, running);
    ok("with the live dot turning, which is what the widget follows",
      running.dot, running);

    // A refine that takes longer than the backend watchdog. The backend says it
    // has the request, then reports progress, and a progress message is proof
    // it is answering. The watchdog used to be armed by that very message with
    // nothing left to clear it, so a draft refine slower than five seconds
    // reported a backend that is not installed.
    await page.evaluate((id) => {
      window.__fromBackend({ type: "refine_ack", requestId: id });
      window.__fromBackend({ type: "refine_progress", stage: "asking" });
    }, asked.id);
    await page.evaluate(() => new Promise((r) => setTimeout(r, 6000)));
    // The complaint would arrive as a toast and as a line in the Log, so both
    // are read: a check that looked at only one of them passed with the fault
    // still in place.
    const cried = await page.evaluate(async () => {
      const tabs = [...document.querySelectorAll("#drawer .arf-tab, #drawer [role=tab]")];
      const log = tabs.find((t) => (t.textContent || "").trim() === "Log");
      if (log) log.click();
      await new Promise((r) => requestAnimationFrame(r));
      return {
        toasts: (window.__toasts || []).map((t) => (t && t.text) || String(t)).join(" | "),
        panel: document.querySelector("#drawer").textContent,
      };
    });
    ok("a slow draft refine is not called a missing backend",
      cried.toasts.indexOf("not answering") < 0 && cried.panel.indexOf("fully installed") < 0,
      cried.toasts.slice(0, 160));

    // And when it lands, the same card the replies get.
    await page.evaluate((id) => {
      window.__fromBackend({ type: "try_result", requestId: id, ok: true,
                            after: "I walk through it." });
    }, asked.id);
    await settle(page);
    const card = await page.evaluate(() => {
      const el = document.querySelector("[data-arf-pop]");
      return el && { text: el.textContent, back: !!el.querySelector("[data-arf-pop-undo]") };
    });
    ok("a card comes up saying what changed", !!card && /What changed/.test(card.text), card);
    ok("titled for the draft rather than for a reply",
      !!card && /Your draft, refined/.test(card.text), card && card.text.slice(0, 60));
    ok("with a way back on it", !!card && card.back);

    // The way back writes the old draft into the box, since a draft was never
    // saved anywhere for the backend to hold.
    await page.evaluate(() => document.querySelector("[data-arf-pop-undo]").click());
    await settle(page);
    ok("which puts the draft back as it was",
      await page.evaluate(() =>
        document.querySelector('[data-component="InputArea"] textarea').value
          === "i walk through it, suddenly"),
      await page.evaluate(() =>
        document.querySelector('[data-component="InputArea"] textarea').value));
    ok("and closes the card", !(await page.$("[data-arf-pop]")));
  });

  // ---- and its working reaches the Log, the same as a reply's ----
  // The backend sends the working on the draft's answer as well as on a
  // reply's. It was read off the progress messages and then dropped here, so
  // the draft was the one kind of refine whose working never reached the Log.
  const WORKING = "<REFINE_NOTES>\nThe simile is doing no work. Cutting it.\n</REFINE_NOTES>";
  const draftRun = async (page, answer) => {
    await page.evaluate(() => window.__makeComposer("i walk through it, suddenly"));
    await page.evaluate(() => document.querySelector('#drawer [data-arf-draft]').click());
    await settle(page);
    const id = await page.evaluate(
      () => window.__sent.filter((x) => x.type === "try_refine").pop().requestId);
    await page.evaluate((a) => {
      window.__fromBackend({ type: "refine_ack", requestId: a.id });
      window.__fromBackend({ type: "refine_progress", stage: "asking" });
      window.__fromBackend(Object.assign({ type: "try_result", requestId: a.id }, a.body));
    }, { id: id, body: answer });
    await settle(page);
  };
  const kept = (page) =>
    page.evaluate(() => {
      const w = document.querySelector("[data-arf-kept]");
      const card = w && w.closest(".arf-card");
      return w && { text: w.textContent, said: card ? card.textContent : "" };
    });

  await inTab(browser, { saved: { inputRefine: true } }, async (page) => {
    await draftRun(page, { ok: true, after: "I walk through it.", notes: WORKING });
    await goTab(page, "Log");
    const got = await kept(page);
    ok("a draft refine's working lands under What the model worked out",
      !!got && /simile is doing no work/.test(got.text), got);
    ok("read as prose, with its tags off, the same as a reply's",
      !!got && !/[<>]/.test(got.text), got && got.text);
    ok("and the card says which refine it came from",
      !!got && /From the refine of your draft at/.test(got.said),
      got && got.said.slice(0, 90));
  });

  // The working is worth most on the refine that was refused, so it is kept
  // whether the rewrite was saved or not.
  await inTab(browser, { saved: { inputRefine: true } }, async (page) => {
    await draftRun(page, { ok: false, why: "it read as a refusal", notes: WORKING });
    await goTab(page, "Log");
    const got = await kept(page);
    ok("a draft refine that was turned down still keeps its working",
      !!got && /simile is doing no work/.test(got.text), got);
    ok("and says the rewrite was dropped, with the reason",
      !!got && /whose rewrite was dropped: it read as a refusal/.test(got.said),
      got && got.said.slice(0, 120));
  });

  // A reply refine keeps saying it was a reply, so the two are told apart.
  await inTab(browser, {}, async (page) => {
    await page.evaluate((w) => {
      window.__fromBackend({ type: "refine_notes", chatId: "c1", messageId: "m1", notes: w });
    }, WORKING);
    await goTab(page, "Log");
    const got = await kept(page);
    ok("a reply's working says it came from a reply",
      !!got && /From the refine of a reply at/.test(got.said), got && got.said.slice(0, 90));
  });
}


console.log("\nthe button and its menu do not say the same thing twice");
{
  // With the button set to turn into an undo, the arrow is in front of you and
  // one tap does it. An entry underneath saying the same thing is a second way
  // to reach something already in reach, and it costs a line in a menu that has
  // to be read on a phone.
  const openMenu = async (page) => {
    await page.evaluate(() => {
      document.querySelector("#float .arf-float").dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      );
    });
    await settle(page);
    return page.evaluate(() => ((window.__menu || {}).items || []).map((i) => i.key));
  };
  const landOne = (page) =>
    page.evaluate(() => {
      window.__fromBackend({
        type: "refined", chatId: "c1", messageId: "m1", canUndo: true,
        before: "She let out a breath she did not know she was holding.",
        after: "She breathed out.",
      });
    });

  // The button always refines, so the menu is the only way back.
  await inTab(browser, { saved: { widgetOn: true, widgetUndo: false } }, async (page) => {
    await landOne(page);
    await settle(page);
    const keys = await openMenu(page);
    ok("with the button always refining, the menu carries the way back",
      keys.indexOf("undo") >= 0, keys.join(","));
  });

  // The button becomes the way back, so the menu does not repeat it.
  await inTab(browser, { saved: { widgetOn: true, widgetUndo: true } }, async (page) => {
    await landOne(page);
    await settle(page);
    const keys = await openMenu(page);
    ok("with the button turning into the way back, the menu does not repeat it",
      keys.indexOf("undo") < 0, keys.join(","));
    ok("and still offers a refine, which the button no longer does",
      keys.indexOf("now") >= 0, keys.join(","));
  });
}


console.log("\nthe widget, while your draft is being refined");
{
  // The button follows the same running state the panel does. It used to be
  // turned on by the backend's first progress message and turned off by
  // nothing, so it began turning as the answer arrived and went on turning for
  // a minute and a half after it had landed.
  const face = (page) =>
    page.evaluate(() => {
      const b = document.querySelector("#float .arf-float");
      return b && {
        working: b.classList.contains("arf-working"),
        back: b.classList.contains("arf-back"),
        icon: b.getAttribute("data-arf-icon") || "",
        title: b.title,
      };
    });

  await inTab(
    browser,
    { saved: { inputRefine: true, widgetOn: true, widgetUndo: true } },
    async (page) => {
      await page.evaluate(() => window.__makeComposer("i walk through it, suddenly"));
      ok("the button is not turning before anything is asked",
        !(await face(page)).working);

      await page.evaluate(() => document.querySelector('#drawer [data-arf-draft]').click());
      await settle(page);
      const mid = await face(page);
      ok("it turns from the moment the draft is sent, not when the answer lands",
        mid.working && /^working:/.test(mid.icon), mid);
      ok("and says a tap would stop it", /stop it/i.test(mid.title), mid.title);

      const id = await page.evaluate(
        () => window.__sent.filter((x) => x.type === "try_refine").pop().requestId);
      await page.evaluate((i) => {
        window.__fromBackend({ type: "refine_ack", requestId: i });
        window.__fromBackend({ type: "refine_progress", stage: "asking" });
      }, id);
      await settle(page);
      ok("still turning while the model works", (await face(page)).working);

      await page.evaluate((i) => {
        window.__fromBackend({ type: "try_result", requestId: i, ok: true,
                              after: "I walk through it." });
      }, id);
      await settle(page);
      const done = await face(page);
      ok("and stops the moment the answer lands", !done.working, done);

      // The green arrow, the same one a reply's refine puts there.
      ok("the button offers to put your draft back", done.back, done);
      ok("with the arrow rather than the refine mark", /^back:/.test(done.icon), done.icon);
      ok("and says so", /put the last refine back/i.test(done.title), done.title);

      // A tap takes the draft back to what you wrote.
      await page.evaluate(() => document.querySelector("#float .arf-float").click());
      await settle(page);
      ok("tapping it puts your draft back",
        await page.evaluate(() =>
          document.querySelector('[data-component="InputArea"] textarea').value
            === "i walk through it, suddenly"));
      ok("and the arrow goes, because there is nothing left to put back",
        !(await face(page)).back);
    },
  );

  // Typing over the refine is newer writing than the refine it would undo, so
  // the way back stands down rather than throwing it away.
  await inTab(
    browser,
    { saved: { inputRefine: true, widgetOn: true, widgetUndo: true } },
    async (page) => {
      await page.evaluate(() => window.__makeComposer("i walk through it, suddenly"));
      await page.evaluate(() => document.querySelector('#drawer [data-arf-draft]').click());
      await settle(page);
      const id = await page.evaluate(
        () => window.__sent.filter((x) => x.type === "try_refine").pop().requestId);
      await page.evaluate((i) => {
        window.__fromBackend({ type: "try_result", requestId: i, ok: true,
                              after: "I walk through it." });
      }, id);
      await settle(page);
      ok("the arrow is there while the box still holds the rewrite",
        (await face(page)).back);

      await page.evaluate(() => {
        const box = document.querySelector('[data-component="InputArea"] textarea');
        box.value = "I walk through it, and the cold hits me.";
        box.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await settle(page);
      ok("and goes once you have typed over it", !(await face(page)).back);
    },
  );
}


console.log("\nthe live line, for a draft as for a reply");
{
  // The Log's Right now line and the clock beside it are driven by the one
  // running state. A draft refine reached that state late and left it set, so
  // this walks the whole of one and watches the line the reader watches.
  const line = (page) =>
    page.evaluate(() => {
      const dot = document.querySelector("#drawer .arf-dot");
      return dot && dot.parentElement ? dot.parentElement.textContent.trim() : "";
    });
  const secs = (t) => {
    const m = /(\d+)s/.exec(t || "");
    return m ? Number(m[1]) : null;
  };

  await inTab(browser, { saved: { inputRefine: true } }, async (page) => {
    await goTab(page, "Log");
    await page.evaluate(() => window.__makeComposer("i walk through it, suddenly"));
    const idle = await line(page);
    ok("the line is not claiming a refine before one is asked for",
      !/Refining|Thinking|Writing/.test(idle), idle);

    await page.evaluate(() => document.querySelector('#drawer [data-arf-draft]').click());
    await settle(page);
    ok("it says a refine is running the moment the draft is sent",
      /Refining/.test(await line(page)), await line(page));

    const id = await page.evaluate(
      () => window.__sent.filter((x) => x.type === "try_refine").pop().requestId);

    // The stages a draft goes through are the ones a reply goes through, and
    // the line names each rather than saying busy for the whole of it.
    await page.evaluate((i) => {
      window.__fromBackend({ type: "refine_ack", requestId: i });
      window.__fromBackend({ type: "refine_progress", stage: "thinking" });
    }, id);
    await settle(page);
    ok("and names the stage as it changes", /Thinking/.test(await line(page)), await line(page));

    await page.evaluate(() => {
      window.__fromBackend({ type: "refine_progress", stage: "writing", chars: 128 });
    });
    await settle(page);
    const writing = await line(page);
    ok("counting what has come back while it streams",
      /Writing/.test(writing) && /128/.test(writing), writing);

    // The clock is the part that has to move on its own. A line that has not
    // changed in ten seconds reads exactly like a hang. Read once it has
    // started, since it says nothing for the first second on purpose.
    await page.evaluate(() => new Promise((r) => setTimeout(r, 1300)));
    const first = secs(await line(page));
    await page.evaluate(() => new Promise((r) => setTimeout(r, 2200)));
    const later = secs(await line(page));
    ok("with a clock that climbs on its own",
      first !== null && later !== null && later > first, first + " then " + later);

    // Switching away and back must not restart the count, the same as a reply.
    await goTab(page, "Prompt");
    await goTab(page, "Log");
    const back = secs(await line(page));
    ok("and keeps the count across a tab switch", back !== null && back >= later, back);

    await page.evaluate((i) => {
      window.__fromBackend({ type: "try_result", requestId: i, ok: true,
                            after: "I walk through it." });
    }, id);
    await settle(page);
    const done = await line(page);
    ok("and stops saying it is refining when the answer lands",
      !/Refining|Thinking|Writing/.test(done), done);
  });

  // Two refines cannot run at once, because there is one running state between
  // them: a second one ending would clear the line out from under the first
  // while that one was still going.
  await inTab(browser, { saved: { inputRefine: true, widgetOn: true } }, async (page) => {
    await page.evaluate(() => window.__makeComposer("i walk through it, suddenly"));
    await page.evaluate(() => {
      window.__fromBackend({ type: "active_chat", requestId:
        window.__sent.filter((m) => m.type === "active_chat").pop().requestId,
        chatId: "c1", character: "Wren", hasCharacter: true, resolved: true, found: true });
    });
    await settle(page);
    // A reply refine, running.
    await page.evaluate(() => {
      window.__fromBackend({ type: "refine_progress", stage: "writing", chars: 40 });
    });
    await settle(page);
    ok("a reply refine is running", /Writing/.test(await line(page)), await line(page));

    // The draft, asked for from the widget's menu, which stays reachable.
    const before = await page.evaluate(
      () => window.__sent.filter((x) => x.type === "try_refine").length);
    await page.evaluate(() => {
      window.__menuPick = "draft";
      document.querySelector("#float .arf-float").dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      );
    });
    await settle(page);
    const after = await page.evaluate(
      () => window.__sent.filter((x) => x.type === "try_refine").length);
    ok("a draft refine is turned away while one is running", after === before, after);
    ok("and the running one still says so", /Writing/.test(await line(page)), await line(page));
  });
}

await browser.close();

console.log("\n" + (ran - failures) + " of " + ran + " checks passed");
if (failures) process.exit(1);
