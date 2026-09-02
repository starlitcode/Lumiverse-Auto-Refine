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
async function inTab(browser, { css = "", viewport, touch = false, saved = null } = {}, fn) {
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
        createFloatWidget: (spec) => {
          const host = document.createElement("div");
          host.id = "float";
          // The host owns the box the button is drawn in, so what it was asked
          // for is the only place the size is observable.
          window.__widgetSpec = spec || null;
          host.style.width = ((spec && spec.width) || 0) + "px";
          host.style.height = ((spec && spec.height) || 0) + "px";
          document.body.appendChild(host);
          window.__widget = true;
          return { root: host, destroy: () => { window.__widget = false; host.remove(); } };
        },
        registerInputBarAction: (spec) => {
          window.__inputAction = spec;
          return {
            onClick: (fn) => {
              window.__inputClick = fn;
              return () => {};
            },
            destroy: () => {
              window.__inputAction = null;
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

// What the sweep had to repair. Zero on the stock theme is the point: a panel
// that repaints healthy colours is overriding a theme it should be inheriting.
async function repaired(page) {
  return page.evaluate(() =>
    document.querySelectorAll('#drawer [data-arf-painted="ink"]').length,
  );
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

    let worst = 99;
    let where = "";
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
      const bg = backdrop(el);
      const r = ratio(over(fg, bg), bg);
      if (r < worst) {
        worst = r;
        where = (el.className || el.tagName) + ": " + el.textContent.trim().slice(0, 40);
      }
    }
    return { worst: worst, where: where };
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
    ok(
      "the stock theme is inherited, not repainted",
      (await repaired(page)) === 0,
      "repainted " + (await repaired(page)) + " elements that were already fine",
    );
    const m = await worstText(page);
    ok(
      "every label is readable as painted",
      m.worst >= 3.2,
      "worst was " + m.worst.toFixed(2) + " on " + m.where,
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
      m.worst >= 3.2,
      "worst was " + m.worst.toFixed(2) + " on " + m.where,
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
      m.worst >= 3.2,
      "worst was " + m.worst.toFixed(2) + " on " + m.where,
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
    const hidden = await page.evaluate(
      () => !document.querySelector('#drawer [data-arf-field="thinkingEffort"]'),
    );
    ok("the effort row is not there until it would do something", hidden);

    await page.evaluate(() => {
      const sel = document.querySelector('#drawer [data-arf-field="thinkingMode"]');
      sel.value = "custom";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle(page);
    const there = await page.evaluate(
      () => !!document.querySelector('#drawer [data-arf-field="thinkingEffort"]'),
    );
    ok("and appears when you ask to set it", there);

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

  await inTab(
    browser,
    { saved: { widgetOn: true, inputRefine: true } },
    async (page) => {
    const up = await page.evaluate(() => ({
      widget: !!window.__widget,
      row: !!window.__inputAction,
    }));
    ok("both appear when they are switched on", up.widget && up.row);

    // Refining the draft reads the input box, sends it, and writes the answer
    // back through the setter the framework is listening to.
    await page.evaluate(() => {
      const box = document.createElement("textarea");
      box.setAttribute("data-component", "ChatInput");
      box.value = "i walk through it, suddenly";
      box.style.cssText = "width:200px;height:40px";
      document.body.appendChild(box);
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
      value: document.querySelector('textarea[data-component="ChatInput"]').value,
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
      const box = document.createElement("textarea");
      box.setAttribute("data-component", "ChatInput");
      box.value = "i walk through it";
      box.style.cssText = "width:200px;height:40px";
      document.body.appendChild(box);
      window.__inputClick();
    });
    const asked = await page.evaluate(
      () => window.__sent.filter((m) => m.type === "try_refine").length,
    );
    ok("with no {{message}} in the prompt, nothing is sent and the draft is untouched", asked === 0);
    },
  );
}

console.log("\nthe floating button's size");
{
  await inTab(browser, {}, async (page) => {
    await goTab(page, "Setup");
    // Its settings belong to it: with the button off there is nothing to size.
    const hidden = await page.evaluate(
      () => !document.querySelector('#drawer [data-arf-field="widgetSize"]'),
    );
    ok("its settings are hidden while the button is off", hidden);

    await page.evaluate(() => {
      document.querySelector('#drawer [data-arf-field="widgetOn"]').click();
    });
    await settle(page);
    // The same range Auto Retry's floating button uses, so the two sit at
    // matching sizes for somebody running both.
    const shown = await page.evaluate(() => {
      const n = document.querySelector('#drawer [data-arf-field="widgetSize"]');
      return n && { min: n.min, max: n.max, value: n.value };
    });
    ok("switching it on brings its settings back under it", !!shown);
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
      ok("every label is readable", m.worst >= 3.2, "worst " + m.worst.toFixed(2) + " on " + m.where);

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
          m.worst >= 3.2,
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

await browser.close();

console.log("\n" + (ran - failures) + " of " + ran + " checks passed");
if (failures) process.exit(1);
