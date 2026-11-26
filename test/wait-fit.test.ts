// Fit the wait to the model: which addresses count as your own computer or
// network, and how much longer each call is given.
//
// Auto Retry and Auto Foley use the same rules and the same numbers, and
// these are the same cases Auto Foley checks.
//
// Run with: bun test

import { expect, test, describe } from "bun:test";
import { readFileSync } from "node:fs";

const SRC = readFileSync(new URL("../src/backend.ts", import.meta.url), "utf8");

// The functions as they are written in the source, from the section's
// heading to the setting under it.
const fit: { isLocalUrl: (u: string) => boolean; fitWait: (base: number, url: string, effort: string) => { secs: number; why: string[] }; minutesText: (secs: number) => string } = (() => {
  const at = SRC.indexOf("// ---- Fit the wait to the model ----");
  const end = SRC.indexOf("// Fit the wait to the model, which is on by default.", at);
  if (at < 0 || end < 0) throw new Error("the Fit the wait to the model section was not found");
  const js = new Bun.Transpiler({ loader: "ts" }).transformSync(SRC.slice(at, end));
  // eslint-disable-next-line no-new-func
  return new Function(js + "\nreturn { isLocalUrl, fitWait, minutesText };")();
})();

describe("fitting the wait to the model", () => {
  test("an address on your own computer or network counts as local, and a cloud one does not", () => {
    const local = ["http://localhost:5001/v1", "http://127.0.0.1:8080", "http://192.168.1.40:11434/v1", "http://10.0.0.7:5000", "http://172.20.3.4:1234", "http://100.90.12.3:8080", "http://gpu-box:5001", "http://studio.local:1234/v1", "http://[::1]:8080", "https://user:pass@192.168.0.9/v1"];
    const cloud = ["https://api.openai.com/v1", "https://openrouter.ai/api/v1", "https://172.15.0.1/v1", "https://100.50.1.1", "", "not a url"];
    expect(local.filter((u) => !fit.isLocalUrl(u))).toEqual([]);
    expect(cloud.filter((u) => fit.isLocalUrl(u))).toEqual([]);
  });

  test("the wait is stretched for thinking and for a local model, at most an hour", () => {
    expect(fit.fitWait(120, "https://api.openai.com/v1", "").secs).toBe(120);
    expect(fit.fitWait(120, "https://api.openai.com/v1", "low").secs).toBe(120);
    expect(fit.fitWait(120, "https://api.openai.com/v1", "high").secs).toBe(240);
    expect(fit.fitWait(120, "https://api.openai.com/v1", "max").secs).toBe(360);
    const local = fit.fitWait(120, "http://localhost:5001", "medium");
    expect(local.secs).toBe(900);
    expect(local.why).toEqual(["thinking is set to medium", "the model runs on your own computer or network"]);
    expect(fit.fitWait(600, "http://localhost:5001", "max").secs).toBe(3600);
  });

  test("the default wait of four minutes, as the docs table gives it", () => {
    expect(fit.fitWait(240, "https://api.openai.com/v1", "medium").secs).toBe(360);
    expect(fit.fitWait(240, "https://api.openai.com/v1", "xhigh").why).toEqual(["thinking is set to extra high"]);
    expect(fit.fitWait(240, "http://192.168.1.40:5001/v1", "high").secs).toBe(2400);
    expect(fit.minutesText(2400)).toBe("40 minutes");
    expect(fit.minutesText(90)).toBe("90 seconds");
  });
});
