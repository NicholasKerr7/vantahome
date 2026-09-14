const { readFileSync } = require("node:fs");
const { execFileSync } = require("node:child_process");
const {
  ensureCompatibility, patchSource, ORIGINAL_IMPORT, PATCHED_IMPORT,
} = require("./patch-query-string.js");
const queryString = require("query-string");
const { getStateFromPath, getPathFromState } = require("@react-navigation/core");

describe("patched URI decoder compatibility", () => {
  test("accepts only the reviewed query-string source and is idempotent", () => {
    const patched = readFileSync(require.resolve("query-string"), "utf8");
    const original = patched.replace(PATCHED_IMPORT, ORIGINAL_IMPORT);
    expect(patchSource(original)).toBe(patched);
    expect(patchSource(patched)).toBe(patched);
    expect(() => patchSource(`${original}\n// unexpected upstream change`)).toThrow("Unexpected query-string source");
    expect(() => ensureCompatibility({ checkOnly: true })).not.toThrow();
  });

  test("preserves query decoding, encoding, duplicate keys, plus signs, and UTF-8", () => {
    expect(queryString.parse("room=Living+Room&label=Caf%C3%A9&tag=one&tag=two&flag&empty="))
      .toEqual({ room: "Living Room", label: "Café", tag: ["one", "two"], flag: null, empty: "" });
    expect(queryString.stringify({ label: "Café", room: "Living Room", tag: ["one", "two"] }))
      .toBe("label=Caf%C3%A9&room=Living%20Room&tag=one&tag=two");
    expect(queryString.parse("value=%2B+plus")).toEqual({ value: "+ plus" });
  });

  test("keeps malformed encodings non-throwing without losing valid adjacent UTF-8", () => {
    expect(queryString.parse("label=Caf%C3%A9&bad=%E0%A4%A&raw=%&literal=%FF"))
      .toEqual({ label: "Café", bad: "%E0%A4%A", raw: "%", literal: "%FF" });
  });

  test("React Navigation still parses and serializes linked-screen query parameters", () => {
    const config = { screens: { Room: "rooms/:id" } };
    const state = getStateFromPath("/rooms/kitchen?label=Caf%C3%A9&room=Living+Room", config);
    expect(state.routes[0]).toEqual(expect.objectContaining({
      name: "Room", params: { id: "kitchen", label: "Café", room: "Living Room" },
    }));
    expect(getPathFromState(state, config)).toBe("/rooms/kitchen?label=Caf%C3%A9&room=Living%20Room");
  });

  test("handles a bounded malformed-input fixture within a separate process deadline", () => {
    // Keep the sample small and isolate its deadline from the Jest process so
    // accidentally restoring the old decoder cannot hang the entire test run.
    expect(execFileSync(process.execPath, ["-e", `
      const assert = require('node:assert/strict');
      const query = require('query-string');
      const malformed = '%FF'.repeat(128);
      assert.equal(query.parse('value=' + malformed).value, malformed);
      process.stdout.write('decoded');
    `], { cwd: process.cwd(), timeout: 2000, encoding: "utf8" })).toBe("decoded");
  });
});
