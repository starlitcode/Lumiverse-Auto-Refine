// Every second model has its own Refine when a check reaches, starting at 30,
// and a Model name box, so a user can type a new name when
// a host renames a model or releases a new version, without waiting for an
// update. The box has five parts, and a model missing any of them has no box
// or a box that does nothing: the setting, its empty default, the field on the
// Model tab, its place in a part of the presets, and the built-in names the
// box shows for every host the model is offered on. Adding a second model, or
// a host for one, without all five fails here.
//
// The backend half is in refine.test.ts: a typed name is sent for every model
// in OWN_NAME_KEYS, on every host in BUILT_IN_MODEL_NAMES.
import { expect, test, describe } from "bun:test";
import { __testing } from "../src/frontend";

const { CONFIG, PARTS, JUDGE_FIELDS, SECOND_MODELS, OWN_NAME_KEYS, BUILT_IN_MODEL_NAMES } = __testing as any;

// The hosts the Model tab offers a model, read from the host picker. Another
// address has its own Model name box, so it is left out.
function hostsOffered(who: string): string[] {
  const field = JUDGE_FIELDS.find((f: any) => f.key === "judgeHost");
  return field.options
    .filter((o: any) => o.value !== "custom")
    .filter((o: any) => {
      const n = o.needs;
      if (!n) return true;
      return Array.isArray(n.is) ? n.is.indexOf(who) >= 0 : n.is === who;
    })
    .map((o: any) => o.value);
}

describe("every second model has a Model name box", () => {
  test("there are models to check, or this proves nothing", () => {
    expect(SECOND_MODELS.length).toBeGreaterThan(1);
  });

  for (const m of SECOND_MODELS) {
    const who = m.value;
    describe(m.name, () => {
      const key = OWN_NAME_KEYS[who];

      test("has a setting for its name", () => {
        expect(typeof key).toBe("string");
      });

      test("that is empty by default, so the built-in name is used", () => {
        expect(CONFIG[key]).toBe("");
      });

      test("that is a box on the Model tab, shown for this model", () => {
        const field = JUDGE_FIELDS.find((f: any) => f.key === key);
        expect(field && field.type).toBe("text");
        expect(field.needs).toEqual({ key: "judgeWho", is: who });
      });

      test("that belongs to a part of the presets", () => {
        expect(PARTS.some((p: any) => p.keys.indexOf(key) >= 0)).toBe(true);
      });

      test("with its own Refine when a check reaches, at 30 by default", () => {
        const line = who === "jev" ? "judgeOver" : who + "Over";
        expect(CONFIG[line]).toBe(30);
        expect(JUDGE_FIELDS.some((f: any) => f.key === line)).toBe(true);
      });

      test("with a built-in name for every host it is offered on", () => {
        const names = BUILT_IN_MODEL_NAMES[who] || {};
        const missing = hostsOffered(who).filter((h) => !names[h]);
        expect(missing).toEqual([]);
      });
    });
  }

  test("and no box for a model that is not in the list", () => {
    const models = SECOND_MODELS.map((m: any) => m.value);
    expect(Object.keys(OWN_NAME_KEYS).filter((w) => models.indexOf(w) < 0)).toEqual([]);
  });
});
