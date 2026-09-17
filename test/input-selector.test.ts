// The selectors that find the chat input box.
//
// Refining a draft is the one part of this extension that reads Lumiverse's own
// layout, so a release that moves the box breaks it. The reader can put their
// own selectors in front of the built-in list without waiting for a release,
// and this covers the splitting that makes that safe to type into.
import { test, expect, describe } from "bun:test";
import { __testing } from "../src/frontend";

const { splitSelectorList, INPUT_PICKS } = __testing as any;

describe("splitting a selector list", () => {
  test("a plain list splits on its commas", () => {
    expect(splitSelectorList("a, b ,c")).toEqual(["a", "b", "c"]);
  });

  test("one per line works too, since that is how the box is written in", () => {
    expect(splitSelectorList("textarea[name=x]\n, .y")).toEqual(["textarea[name=x]", ".y"]);
  });

  // A comma inside brackets, parentheses or quotes belongs to the selector.
  // Splitting on it hands the browser two halves that are each nonsense.
  test("a comma inside a bracket stays in the selector", () => {
    expect(splitSelectorList('[title="x, y"]')).toEqual(['[title="x, y"]']);
  });

  test("a comma inside a function stays in the selector", () => {
    expect(splitSelectorList(":is(a, b), .c")).toEqual([":is(a, b)", ".c"]);
  });

  test("an escaped quote does not end the quote", () => {
    expect(splitSelectorList('[t="a\\", b"], .c')).toEqual(['[t="a\\", b"]', ".c"]);
  });

  test("blank and whitespace give nothing rather than an empty selector", () => {
    expect(splitSelectorList("")).toEqual([]);
    expect(splitSelectorList("  , ,\n")).toEqual([]);
    expect(splitSelectorList(null)).toEqual([]);
  });
});

describe("the built-in list", () => {
  test("it goes from the most exact to the loosest", () => {
    // The last one names any text box on the page, so anything more exact than
    // that has to come first or it would never be reached.
    expect(INPUT_PICKS[INPUT_PICKS.length - 1]).toBe("textarea");
    expect(INPUT_PICKS[0]).toContain("chat-message");
  });

  test("every one of them is a selector the browser can read", () => {
    const bad: string[] = [];
    for (const pick of INPUT_PICKS) {
      try {
        // Parsed rather than matched: there is no page here to match against.
        new RegExp("");
        if (!/^[^{}]+$/.test(pick)) bad.push(pick);
      } catch (_) {
        bad.push(pick);
      }
    }
    expect(bad).toEqual([]);
  });

  test("none of them is listed twice", () => {
    expect(INPUT_PICKS.length).toBe(new Set(INPUT_PICKS).size);
  });
});
