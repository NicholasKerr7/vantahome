"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const vm = require("node:vm");
const braces = require("braces");
const micromatch = require("micromatch");
const patch = require("../security-patches/braces");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const path = require("node:path");

/** Construct a bounded-size input with independently controlled AST depth. */
function nestedPattern(depth, opening = "{", closing = "}") {
  return opening.repeat(depth) + "a,b" + closing.repeat(depth);
}

/** Construct caller-supplied ASTs, bypassing parser protections intentionally. */
function nestedAst(depth) {
  let ast = { type: "text", value: "a" };
  for (let index = 0; index < depth; index += 1) {
    ast = { type: "brace", nodes: [ast] };
  }
  return { type: "root", nodes: [ast] };
}

/** Distinguish the intentional validation error from engine stack exhaustion. */
function depthError(error) {
  return /exceeds max depth/.test(error.message) && !/call stack/i.test(error.message);
}

for (const method of ["parse", "compile", "expand", "stringify"]) {
  test(`braces.${method} accepts 100 levels and rejects 101 for braces and parentheses`, () => {
    for (const [open, close] of [["{", "}"], ["(", ")"]]) {
      assert.doesNotThrow(() => braces[method](nestedPattern(100, open, close)));
      assert.throws(() => braces[method](nestedPattern(101, open, close)), depthError);
    }
  });

  test(`braces.${method} counts mixed nesting and cannot disable the hard ceiling`, () => {
    const mixed = "{(".repeat(51) + "a,b" + ")}".repeat(51);
    assert.throws(() => braces[method](mixed), depthError);
    for (const maxDepth of [101, 5000, Infinity, NaN]) {
      assert.throws(() => braces[method](nestedPattern(101), { maxDepth }), depthError);
    }
  });

  test(`braces.${method} respects stricter and fractional depth limits`, () => {
    assert.doesNotThrow(() => braces[method]("{a,b}", { maxDepth: 1.5 }));
    assert.throws(() => braces[method]("{{a,b},c}", { maxDepth: 1.5 }), depthError);
    assert.throws(() => braces[method]("((a))", { maxDepth: 1.5 }), depthError);
    assert.throws(() => braces[method]("{a,b}", { maxDepth: 0 }), depthError);
  });
}

for (const method of ["compile", "expand", "stringify"]) {
  test(`braces.${method} guards caller-supplied AST depth and child cycles`, () => {
    assert.doesNotThrow(() => braces[method](nestedAst(100)));
    assert.throws(() => braces[method](nestedAst(101)), depthError);
    const cyclic = { type: "root", nodes: [] };
    cyclic.nodes.push(cyclic);
    assert.throws(
      () => vm.runInNewContext("braces[method](cyclic)", { braces, method, cyclic }, { timeout: 1000 }),
      depthError,
    );
  });
}

test("braces expansion rejects cyclic AST parents promptly", () => {
  for (const multipleParents of [false, true]) {
    const ast = { type: "paren", nodes: [{ type: "text", value: "a" }] };
    ast.parent = multipleParents ? { type: "paren", parent: ast } : ast;
    assert.throws(
      () => vm.runInNewContext("braces.expand(ast)", { braces, ast }, { timeout: 1000 }),
      /AST parent chain contains a cycle/,
    );
  }
});

test("published exploit-size patterns are rejected before stack exhaustion", () => {
  // A child bounds wall time and stack use even if a future regression removes guards.
  const result = spawnSync(process.execPath, ["--stack_size=256", "-e", `
    const assert = require('node:assert/strict');
    const braces = require(${JSON.stringify(require.resolve("braces"))});
    const pattern = '{'.repeat(4998) + 'a,b' + '}'.repeat(4998);
    for (const method of ['parse', 'compile', 'expand', 'stringify']) {
      assert.throws(() => braces[method](pattern), error =>
        /exceeds max depth/.test(error.message) && !/call stack/i.test(error.message));
    }
  `], { encoding: "utf8", timeout: 3000 });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
});

test("normal expansion, ranges, literals, escaping and optional filters stay compatible", () => {
  assert.deepEqual(braces.expand("src/{home,rooms}/{index,controls}.{ts,tsx}"), [
    "src/home/index.ts", "src/home/index.tsx", "src/home/controls.ts", "src/home/controls.tsx",
    "src/rooms/index.ts", "src/rooms/index.tsx", "src/rooms/controls.ts", "src/rooms/controls.tsx",
  ]);
  assert.deepEqual(braces.expand("device-{01..03}"), ["device-01", "device-02", "device-03"]);
  assert.deepEqual(braces.expand("{a,a,,b}", { noempty: true, nodupes: true }), ["a", "b"]);
  assert.deepEqual(braces.expand("foo/({a,b})"), ["foo/(a)", "foo/(b)"]);
  assert.equal(braces.compile("src/{home,rooms}/index.ts"), "src/(home|rooms)/index.ts");
  for (const pattern of ["{{a}}", "{a,{b}}", "{{x}y}", "{a,{b,{c}}", "{}{a}"]) {
    assert.equal(braces.stringify(braces.parse(pattern), { escapeInvalid: true }), pattern);
  }
  const escaped = "\\{".repeat(101) + "a" + "\\}".repeat(101);
  const quoted = "\"" + nestedPattern(101) + "\"";
  assert.doesNotThrow(() => braces.compile(escaped));
  assert.doesNotThrow(() => braces.compile(quoted));
  assert.throws(() => braces.expand("{1..1001}"), /range limit/);
  assert.throws(() => braces.compile("a".repeat(10001)), /exceeds max characters/);
});

test("Metro and Jest micromatch consumers retain normal file matching", () => {
  const files = ["src/Home.tsx", "src/Room.ts", "src/Home.test.tsx", "assets/house.glb", "src/native/Home.ios.tsx"];
  assert.deepEqual(micromatch(files, ["src/**/*.{ts,tsx}", "!**/*.test.{ts,tsx}"]), [
    "src/Home.tsx", "src/Room.ts", "src/native/Home.ios.tsx",
  ]);
  assert.deepEqual(micromatch.braceExpand("device-{a,b}-{1..2}"), [
    "device-a-1", "device-a-2", "device-b-1", "device-b-2",
  ]);
  assert.throws(() => micromatch.braces(nestedPattern(101)), depthError);
});

test("every braces source transformation is pinned and refuses source drift", () => {
  const packageRoot = path.dirname(require.resolve("braces/package.json"));
  assert.equal(require("braces/package.json").version, patch.version);
  for (const file of patch.files) {
    const installed = readFileSync(path.join(packageRoot, file.path), "utf8");
    assert.equal(createHash("sha256").update(installed).digest("hex"), file.patchedHash, file.path);
    assert.throws(() => file.patch("changed source"), /no longer matches its pinned source/);
  }
});
