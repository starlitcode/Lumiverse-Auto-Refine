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
      },
      sendToBackend: (m) => window.__sent.push(m),
      onBackendMessage: (fn) => {
        window.__fromBackend = fn;
        return () => {};
      },
    });
  });
  await page.waitForFunction(() => document.querySelectorAll("#drawer .arf-h").length > 0);
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

      // Open both folds, since that is where the rows are densest and where a
      // tap target is most likely to have been squeezed.
      await page.evaluate(() => {
        for (const b of document.querySelectorAll("#drawer .arf-fold")) b.click();
      });
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
    await page.evaluate(() => {
      const heads = Array.from(document.querySelectorAll("#drawer .arf-fold"));
      const one = heads.find((h) => /How the prompt is built/.test(h.textContent));
      one.click();
    });
    const names = () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll("#drawer [data-arf-block] .arf-lab")).map((n) =>
          n.textContent.trim(),
        ),
      );
    const before = await names();
    ok("every block is listed", before.length >= 8, before.join(" | "));

    // The two locked blocks cannot be switched off, whatever else moves.
    const lockedOff = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll("#drawer [data-arf-block] input[type=checkbox]"),
      ).filter((b) => b.disabled).length,
    );
    ok("the job and the message are locked on", lockedOff >= 2);

    // Move the second block up and see the order actually change.
    await page.evaluate(() => {
      const ups = Array.from(document.querySelectorAll('#drawer button[aria-label^="Move up"]'));
      ups[1].click();
    });
    const after = await names();
    ok("moving a block up reorders the list", after[0] === before[1], after.join(" | "));

    const sent = await page.evaluate(() => {
      const last = window.__sent.filter((m) => m.type === "set_settings").pop();
      return last && last.settings && last.settings.blocks
        ? last.settings.blocks.map((b) => b.id)
        : [];
    });
    ok("and the new order goes to the backend", sent.length >= 8 && sent[sent.length - 1] === "message", sent.join(","));

    // A block of the reader's own, with its text.
    await page.evaluate(() => {
      const add = Array.from(document.querySelectorAll("#drawer button")).find((b) =>
        /Add a block of your own/.test(b.textContent),
      );
      add.click();
    });
    const own = await page.evaluate(() => {
      const last = window.__sent.filter((m) => m.type === "set_settings").pop();
      const ids = last.settings.blocks.map((b) => b.id);
      return { ids: ids, beforeMessage: ids.indexOf("message") === ids.length - 1 };
    });
    ok("a block of your own lands before the message", own.beforeMessage, own.ids.join(","));

    await page.evaluate(() => {
      const reset = Array.from(document.querySelectorAll("#drawer button")).find((b) =>
        /Put the order back/.test(b.textContent),
      );
      reset.click();
    });
    const back = await names();
    ok("and putting the order back restores the default", back.join("|") === before.join("|"));
  });
  ok("no errors while editing the layout", errors.length === 0, errors.join("\n         "));
}

console.log("\nsampler settings");
{
  await inTab(browser, {}, async (page) => {
    await page.evaluate(() => {
      const one = Array.from(document.querySelectorAll("#drawer .arf-fold")).find((h) =>
        /How the pass runs/.test(h.textContent),
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
    { saved: { blocks: [{ id: "rules", on: true, role: "system" }] } },
    async (page) => {
      await page.evaluate(() => {
        const one = Array.from(document.querySelectorAll("#drawer .arf-fold")).find((h) =>
          /How the prompt is built/.test(h.textContent),
        );
        one.click();
      });
      const shown = await page.evaluate(() =>
        Array.from(document.querySelectorAll("#drawer [data-arf-block] .arf-lab")).map((n) =>
          n.textContent.trim(),
        ),
      );
      ok(
        "the locked blocks are put back rather than the panel breaking",
        shown.length === 3,
        shown.join(" | "),
      );
    },
  );
}

await browser.close();

console.log("\n" + (ran - failures) + " of " + ran + " checks passed");
if (failures) process.exit(1);
