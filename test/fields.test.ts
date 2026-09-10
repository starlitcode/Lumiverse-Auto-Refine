// Every row on the panel is built from one of these arrays, and a row is only
// as good as what it carries: a key with no default reads back as undefined
// after a reload, a number box with no range takes anything, and a switch with
// no hint is a switch nobody can act on.
//
// Auto Retry has the same check against its own schema. Both exist because the
// drift is silent: a field added without a default looks right on screen and
// comes back empty on the next load.
import { expect, test, describe } from "bun:test";
import { __testing } from "../src/frontend";

const { CONFIG, LIMIT_FIELDS, COST_FIELDS, SAMPLER_FIELDS, ROLE_OPTIONS, refineIcon } = __testing as any;

const FIELDS = [...LIMIT_FIELDS, ...COST_FIELDS];

describe("every field the panel builds", () => {
  test("names a setting that has a default", () => {
    for (const f of FIELDS) expect(Object.keys(CONFIG)).toContain(f.key);
  });

  test("carries a label", () => {
    for (const f of FIELDS) expect(String(f.label || "").length).toBeGreaterThan(0);
  });

  test("and a hint, since a row with no explanation is a row nobody can act on", () => {
    for (const f of FIELDS) expect(String(f.hint || "").length).toBeGreaterThan(0);
  });

  test("a number box has both ends of its range", () => {
    for (const f of FIELDS.filter((x: any) => x.type === "num")) {
      expect(typeof f.min).toBe("number");
      expect(typeof f.max).toBe("number");
      expect(f.max).toBeGreaterThan(f.min);
    }
  });

  test("and a default inside it", () => {
    for (const f of FIELDS.filter((x: any) => x.type === "num")) {
      const v = Number(CONFIG[f.key]);
      expect(v).toBeGreaterThanOrEqual(f.min);
      expect(v).toBeLessThanOrEqual(f.max);
    }
  });

  test("a switch defaults to a boolean, so it reads back as one", () => {
    for (const f of FIELDS.filter((x: any) => x.type === "bool"))
      expect(typeof CONFIG[f.key]).toBe("boolean");
  });

  // A row that hangs off a switch names a real one. A typo here hides the row
  // for good, and nothing fails: it simply never appears.
  test("a row that waits on a switch names one that exists", () => {
    for (const f of FIELDS.filter((x: any) => x.needs))
      expect(Object.keys(CONFIG)).toContain(f.needs.key);
  });
});

describe("the samplers", () => {
  // Blank means the connection decides, which is why none of these carries a
  // default: writing one would override a preset somebody tuned themselves.
  test("each has a range and a step", () => {
    for (const s of SAMPLER_FIELDS) {
      expect(typeof s.min).toBe("number");
      expect(typeof s.max).toBe("number");
      expect(s.max).toBeGreaterThan(s.min);
      expect(String(s.step || "").length).toBeGreaterThan(0);
    }
  });

  test("and none of them is written into the defaults", () => {
    for (const s of SAMPLER_FIELDS) expect(Object.keys(CONFIG)).not.toContain(s.id);
  });

  test("a label and a hint each", () => {
    for (const s of SAMPLER_FIELDS) {
      expect(String(s.label || "").length).toBeGreaterThan(0);
      expect(String(s.hint || "").length).toBeGreaterThan(0);
    }
  });
});

describe("the roles a block can be sent as", () => {
  test("are the three a provider accepts", () => {
    expect(ROLE_OPTIONS.map((r: any) => r.value)).toEqual(["system", "user", "assistant"]);
  });

  test("each with something to read in the picker", () => {
    for (const r of ROLE_OPTIONS) expect(String(r.label || "").length).toBeGreaterThan(0);
  });
});

// The mark on the button, the widget and the Extras row is one drawing, and it
// takes its colour from whatever it is sitting in. A fill written into the icon
// would ignore the reader's theme and show up as the one thing on the panel
// that never gets repaired, since the repair works on text colour.
describe("the extension's own mark", () => {
  test("is one svg", () => {
    const svg = refineIcon();
    expect(svg.indexOf("<svg")).toBe(0);
    expect(svg.trim().endsWith("</svg>")).toBe(true);
  });

  test("takes its colour from what it sits in", () => {
    const svg = refineIcon();
    expect(svg).toContain("currentColor");
    // No colour of its own anywhere: a hex, an rgb() or a named colour here is
    // a mark that stays the same on every theme.
    expect(svg).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(svg).not.toMatch(/\b(?:rgb|hsl)a?\(/i);
  });

  test("and is hidden from a screen reader, since the label beside it says it", () => {
    expect(refineIcon()).toContain('aria-hidden="true"');
  });
});
