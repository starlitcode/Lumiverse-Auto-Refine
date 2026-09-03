// The two halves talk over one bridge, and a message either side sends that the
// other never reads is a dead end: work that looks done and is not, or a panel
// waiting on an answer that is never coming. Neither shows up in a normal run,
// because nothing throws. Both show up here.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const FRONT = readFileSync(join(root, "src", "frontend.ts"), "utf8");
const BACK = readFileSync(join(root, "src", "backend.ts"), "utf8");

const uniq = (a: string[]) => Array.from(new Set(a)).sort();
const frontSends = uniq([...FRONT.matchAll(/send\(\{\s*type:\s*"([a-z_]+)"/g)].map((m) => m[1]));
const backHandles = uniq([...BACK.matchAll(/payload\.type === '([a-z_]+)'/g)].map((m) => m[1]));
const backSends = uniq([...BACK.matchAll(/type:\s*'([a-z_]+)'/g)].map((m) => m[1]));
const frontHandles = uniq([...FRONT.matchAll(/msg\.type === "([a-z_]+)"/g)].map((m) => m[1]));

describe("the message bridge has no dead ends", () => {
  test("the lists were really parsed", () => {
    expect(frontSends.length).toBeGreaterThan(5);
    expect(backHandles.length).toBeGreaterThan(5);
    expect(backSends.length).toBeGreaterThan(5);
    expect(frontHandles.length).toBeGreaterThan(5);
  });

  test("every request the panel sends is one the backend answers", () => {
    expect(frontSends.filter((t) => backHandles.indexOf(t) < 0)).toEqual([]);
  });

  test("every reply the backend sends is one the panel reads", () => {
    // refine_ack was sent and ignored for a while, which is how the panel came
    // to spin for a hundred and five seconds when the backend was not running.
    expect(backSends.filter((t) => frontHandles.indexOf(t) < 0)).toEqual([]);
  });

  test("the panel never waits on a reply nothing sends", () => {
    expect(frontHandles.filter((t) => backSends.indexOf(t) < 0)).toEqual([]);
  });

  test("no send is hidden behind a wrapper this file cannot read", () => {
    // A send handed a variable says nothing about what it carries, so the
    // checks above cannot see through it.
    const indirect = uniq(
      [...FRONT.matchAll(/\bsend\((?!\{)([A-Za-z_$][\w$]*)\)/g)].map((m) => m[1]),
    );
    expect(indirect).toEqual([]);
  });
});
