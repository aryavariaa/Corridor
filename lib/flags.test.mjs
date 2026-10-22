// node --test lib/flags.test.mjs   (Node 22.18+/24 strips the .ts types)
// Fails if any corridor country has no flag file, or a file isn't a usable SVG.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { flagFile, flagSrc } from "./flag-code.ts";

const data = JSON.parse(readFileSync(new URL("../data/provider-data.json", import.meta.url), "utf8"));
const codes = [...new Set(data.corridors.flatMap((c) => [c.sendCountry, c.receiveCountry]))].sort();
const dir = new URL("../public/flags/", import.meta.url);

test("the Eurozone sender maps to the eu flag, others to their lowercase ISO code", () => {
  assert.equal(flagFile("EUR"), "eu");
  assert.equal(flagFile("IN"), "in");
  assert.equal(flagSrc("US"), "/flags/us.svg");
});

test(`every corridor country has a flag file (${codes.length} codes in the data)`, () => {
  const missing = codes.filter((c) => !existsSync(new URL(`${flagFile(c)}.svg`, dir)));
  assert.deepEqual(missing, [], `no public/flags/*.svg for: ${missing.join(", ")}`);
});

test("each flag file is a small, script-free SVG", () => {
  for (const c of codes) {
    const t = readFileSync(new URL(`${flagFile(c)}.svg`, dir), "utf8");
    assert.match(t, /^<svg\b/, `${c}: not an svg`);
    assert.ok(t.length < 20000, `${c}: unexpectedly large`);
    assert.doesNotMatch(t, /<script|onload=|onclick=|href="http/i, `${c}: has active content`);
  }
});

test("the MIT licence ships with the flags", () => {
  assert.ok(existsSync(new URL("LICENSE.md", dir)));
  assert.match(readFileSync(new URL("LICENSE.md", dir), "utf8"), /MIT License/);
});
