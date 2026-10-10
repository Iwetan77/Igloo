import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const directory = path.dirname(fileURLToPath(import.meta.url));

function motion(reducedMotion = false) {
  const source = fs.readFileSync(path.join(directory, "../src/lib/motion.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    require,
    window: { matchMedia: () => ({ matches: reducedMotion }) },
  });
  return exports;
}

test("market navigation does not wait for an animation to finish", () => {
  let navigations = 0;
  let animations = 0;
  const pendingAnimation = { finished: new Promise(() => {}) };
  motion().expandInto({ animate: () => { animations++; return pendingAnimation; } }, () => navigations++);
  assert.equal(animations, 1);
  assert.equal(navigations, 1);
});

test("reduced motion navigates immediately without animating", () => {
  let navigations = 0;
  motion(true).expandInto({ animate: () => assert.fail("Animation should be skipped") }, () => navigations++);
  assert.equal(navigations, 1);
});

test("missing or unsupported animation targets still navigate", () => {
  let navigations = 0;
  motion().expandInto(null, () => navigations++);
  motion().expandInto({}, () => navigations++);
  assert.equal(navigations, 2);
});

test("failed optional animation cannot block navigation", () => {
  let navigations = 0;
  motion().expandInto({ animate: () => { throw new Error("Animation unavailable"); } }, () => navigations++);
  assert.equal(navigations, 1);
});
