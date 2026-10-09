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

const { CONFIG, PARTS, JUDGE_FIELDS, SECOND_MODELS, OWN_NAME_KEYS, BUILT_IN_MODEL_NAMES, SIZE_PICKS, sizeInUse, homeHost } = __testing as any;

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
        const line = who === "jev" ? "judgeOver" : SIZE_PICKS[who] ? SIZE_PICKS[who].sizes.find((z: any) => z.value === SIZE_PICKS[who].standard).line : who + "Over";
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

// A model offered in more than one size or kind is one entry with a picker,
// such as Which Clef. Each size has a line at 30, and the panel shows the
// line for the size in use, and only that one. Each size is offered on the
// hosts that have a name for it, so the panel and the backend pick the same
// model.
describe("a model that comes in more than one size", () => {
  test("there are some, or this proves nothing", () => {
    expect(Object.keys(SIZE_PICKS).length).toBeGreaterThan(0);
  });

  for (const who of Object.keys(SIZE_PICKS)) {
    const pick = SIZE_PICKS[who];
    describe(who, () => {
      test("is one entry in Which second model", () => {
        expect(SECOND_MODELS.filter((x: any) => x.value === who).length).toBe(1);
      });

      test("has a picker, at its standard size by default, in a part of the presets", () => {
        const field = JUDGE_FIELDS.find((f: any) => f.key === pick.key);
        expect(field && field.type).toBe("pick");
        expect(field.options.map((o: any) => o.value)).toEqual(pick.sizes.map((z: any) => z.value));
        expect(CONFIG[pick.key]).toBe(pick.standard);
        expect(PARTS.some((p: any) => p.keys.indexOf(pick.key) >= 0)).toBe(true);
      });

      for (const size of pick.sizes) {
        const host = Object.keys(BUILT_IN_MODEL_NAMES[who]).find((h) => BUILT_IN_MODEL_NAMES[who][h][size.value]);
        test(size.name + " has a host that serves it", () => {
          expect(!!host).toBe(true);
        });

        test(size.name + " has its Refine when a check reaches, at 30 by default", () => {
          expect(CONFIG[size.line]).toBe(30);
          expect(JUDGE_FIELDS.some((f: any) => f.key === size.line)).toBe(true);
        });

        test("picked, " + size.name + " is the size used, and only its line shows", () => {
          const c = { judgeWho: who, judgeHost: host, [pick.key]: size.value };
          expect(sizeInUse(c).value).toBe(size.value);
          const shown = JUDGE_FIELDS.filter((f: any) => /Over$/.test(f.key) && f.also && f.also.is === who && (!f.when || f.when(c)));
          expect(shown.map((f: any) => f.key)).toEqual([size.line]);
        });

        test(size.name + " is offered on exactly the hosts that have a name for it", () => {
          const field = JUDGE_FIELDS.find((f: any) => f.key === pick.key);
          const opt = field.options.find((o: any) => o.value === size.value);
          const hosts = Object.keys(BUILT_IN_MODEL_NAMES[who]);
          const named = hosts.filter((h) => BUILT_IN_MODEL_NAMES[who][h][size.value]);
          expect(hosts.filter((h) => opt.needs.test({ judgeWho: who, judgeHost: h }))).toEqual(named);
          expect(opt.needs.test({ judgeWho: who, judgeHost: "custom" })).toBe(true);
        });

        test(size.name + ", on a host the model is not on, is offered as its home host offers it", () => {
          const field = JUDGE_FIELDS.find((f: any) => f.key === pick.key);
          const opt = field.options.find((o: any) => o.value === size.value);
          const home = BUILT_IN_MODEL_NAMES[who][homeHost(who)];
          expect(opt.needs.test({ judgeWho: who, judgeHost: "a-host-it-is-not-on" })).toBe(!!home[size.value]);
        });
      }
    });
  }
});

// Every host in the host list is offered to exactly the models that have a
// name on it, and a model left on a host it is not on falls back to a host it
// is on.
describe("the host list", () => {
  const field = JUDGE_FIELDS.find((f: any) => f.key === "judgeHost");
  for (const o of field.options.filter((x: any) => x.value !== "custom")) {
    test(o.label + " is offered to the models it has names for", () => {
      const named = Object.keys(BUILT_IN_MODEL_NAMES).filter((w) => !!BUILT_IN_MODEL_NAMES[w][o.value]);
      expect(named.length).toBeGreaterThan(0);
      expect(o.needs.is.slice().sort()).toEqual(named.sort());
    });
  }
  for (const m of SECOND_MODELS) {
    test(m.name + "'s home host serves it", () => {
      expect(!!BUILT_IN_MODEL_NAMES[m.value][homeHost(m.value)]).toBe(true);
    });
  }
});
