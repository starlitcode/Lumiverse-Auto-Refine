// Keeping panel text readable on a theme nobody here has seen.
//
// Every colour on the tab comes from the reader's Lumiverse theme, and a theme
// can set its accent to anything. The panel measures what it has been handed
// and repaints only what fails, so this maths decides whether a label is legible
// or a blank strip where a label should be.
//
// The browser checks measure the rendered result across a matrix of hostile
// themes, which is the real guard. These cover the maths under it, where a
// wrong answer is a number rather than a screenshot.
import { expect, test, describe } from "bun:test";
import { __testing } from "../src/frontend";

const {
  parseColor,
  blendColor,
  relLuminance,
  contrastRatio,
  betterInk,
  TEXT_FLOOR,
  BIG_TEXT_FLOOR,
  FILL_FLOOR,
} = __testing as any;

const rgb = (r: number, g: number, b: number, a = 1) => ({ r, g, b, a });

describe("reading what the browser reports", () => {
  test("rgb()", () => {
    expect(parseColor("rgb(255, 0, 0)")).toEqual(rgb(255, 0, 0));
  });

  test("rgba() with a decimal alpha", () => {
    expect(parseColor("rgba(10, 20, 30, 0.5)")).toEqual(rgb(10, 20, 30, 0.5));
  });

  test("the space and slash form", () => {
    expect(parseColor("rgb(10 20 30 / 50%)")).toEqual(rgb(10, 20, 30, 0.5));
  });

  test("percentages are taken against their own scale", () => {
    expect(parseColor("rgb(100% 0% 50%)")).toEqual(rgb(255, 0, 127.5));
  });

  test("an alpha outside 0 to 1 is pulled back into it", () => {
    expect(parseColor("rgba(0, 0, 0, 4)")!.a).toBe(1);
    expect(parseColor("rgba(0, 0, 0, -2)")!.a).toBe(0);
  });

  // getComputedStyle only ever hands back rgb() or rgba(), so anything else
  // came from somewhere unexpected and must not be acted on: repainting from a
  // colour nobody measured is worse than leaving the theme alone.
  test("anything else comes back as unknown rather than as a guess", () => {
    for (const v of ["transparent", "#ffffff", "red", "", "rgb(1 2)", null, undefined])
      expect(parseColor(v)).toBe(null);
  });
});

describe("one colour over another", () => {
  test("an opaque top is the top", () => {
    expect(blendColor(rgb(10, 20, 30), rgb(200, 200, 200))).toEqual(rgb(10, 20, 30));
  });

  test("a fully clear top is whatever is under it", () => {
    const out = blendColor(rgb(10, 20, 30, 0), rgb(200, 100, 50));
    expect(Math.round(out.r)).toBe(200);
    expect(Math.round(out.g)).toBe(100);
    expect(Math.round(out.b)).toBe(50);
  });

  test("half and half lands between them", () => {
    const out = blendColor(rgb(0, 0, 0, 0.5), rgb(255, 255, 255));
    expect(Math.round(out.r)).toBe(128);
    expect(out.a).toBe(1);
  });
});

describe("how far apart two colours are", () => {
  test("black on white is the widest there is", () => {
    expect(contrastRatio(rgb(0, 0, 0), rgb(255, 255, 255))).toBeCloseTo(21, 1);
  });

  test("a colour against itself is the narrowest", () => {
    expect(contrastRatio(rgb(70, 70, 70), rgb(70, 70, 70))).toBeCloseTo(1, 5);
  });

  test("it reads the same in either order", () => {
    const a = rgb(20, 40, 60);
    const b = rgb(230, 210, 190);
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10);
  });

  test("white is the brightest and black the darkest", () => {
    expect(relLuminance(rgb(255, 255, 255))).toBeCloseTo(1, 5);
    expect(relLuminance(rgb(0, 0, 0))).toBeCloseTo(0, 5);
  });
});

describe("picking ink that can be read", () => {
  // The case the whole repair exists for: a theme that sets its text to
  // something close to its own panel colour.
  test("a panel close to its own text gets ink that clears the floor", () => {
    for (const back of [
      rgb(24, 20, 34),
      rgb(255, 255, 255),
      rgb(128, 128, 128),
      rgb(147, 112, 219),
      rgb(250, 250, 210),
      rgb(10, 10, 10),
    ]) {
      const got = betterInk(back);
      expect(got.ratio).toBeGreaterThanOrEqual(BIG_TEXT_FLOOR);
      expect(parseColor(got.color)).not.toBe(null);
    }
  });

  // What it says it achieved is what it achieved. The sweep decides whether to
  // repaint again from this number, so a ratio that does not match the colour
  // beside it sends the panel round a second time or leaves a label short.
  //
  // It answers in three forms: a solid hex when the softened ink falls below
  // the floor, rgba() when the softened one clears it, and rgb() for a mix on
  // the way between. Only the last two go back through parseColor, which reads
  // what the browser reports and nothing else.
  const inkOf = (color: string) => {
    if (color === "#fff") return rgb(255, 255, 255);
    if (color === "#000") return rgb(0, 0, 0);
    const read = parseColor(color);
    expect(read).not.toBe(null);
    return blendColor(read, rgb(0, 0, 0));
  };

  test("the ratio it reports is the ratio the colour it picked achieves", () => {
    for (const back of [rgb(24, 20, 34), rgb(255, 255, 255), rgb(120, 120, 120), rgb(147, 112, 219)]) {
      const got = betterInk(back, TEXT_FLOOR);
      const ink = got.color.indexOf("rgba") === 0 ? blendColor(parseColor(got.color), back) : inkOf(got.color);
      expect(got.ratio).toBeCloseTo(contrastRatio(ink, back), 2);
    }
  });

  // There is no background this cannot rescue. The hardest is the grey where
  // black and white are equally far away, and even there the better of the two
  // reaches about 4.58, which clears the text floor. So a label left unreadable
  // is a bug in what measured the background, never in what was available.
  test("every background can be cleared to the text floor", () => {
    for (let v = 0; v <= 255; v += 5) {
      const got = betterInk(rgb(v, v, v), TEXT_FLOOR);
      expect(got.ratio).toBeGreaterThanOrEqual(TEXT_FLOOR);
    }
  });

  test("the floors are in the order the rules put them", () => {
    expect(TEXT_FLOOR).toBeGreaterThan(BIG_TEXT_FLOOR);
    expect(BIG_TEXT_FLOOR).toBeGreaterThan(FILL_FLOOR);
  });
});
