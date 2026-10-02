// Which Log lines Show in this list hides under Settings, presets and model
// setups. Every line the panel writes about a preset, a model setup or the
// settings has to be on this list, and lines about a refine must not be.
//
// Run with: bun test

import { expect, test, describe } from "bun:test";
import { __testing } from "../src/frontend";

const { SETUP_LINE } = __testing as any;

describe("settings, presets and model setups", () => {
  for (const line of [
    "settings loaded from your account",
    "settings moved up to your account",
    "brought 3 presets down from your account",
    "brought 1 preset down from your account",
    "sent 2 presets up to your account",
    "brought 2 model setups down from your account",
    "sent 1 model setup up to your account",
    "loaded the preset Copper Kettle | QUICK",
    "loaded the preset A judge",
    "loaded the model setup Lantern",
    "loaded the model setup Lantern with the preset",
    "put back what the preset replaced",
    "put back what the model setup replaced",
    "put the prompt back to the default",
    "reset 1 part",
    "reset 4 parts",
  ])
    test("hidden: " + line, () => expect(SETUP_LINE.test(line)).toBe(true));

  for (const line of [
    "refined a reply, 312 characters",
    "left a reply alone: nothing changed",
    "loaded the reply",
    "put back the last refine",
    "reset the timer",
  ])
    test("shown: " + line, () => expect(SETUP_LINE.test(line)).toBe(false));
});
