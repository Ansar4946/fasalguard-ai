import test from "node:test";
import assert from "node:assert/strict";
import { loadOnnxRuntime } from "../src/onnx-runtime.mjs";

test("a missing native module is reported as NATIVE_RUNTIME_UNAVAILABLE, not a crash", () => {
  const unlinked = () => { throw new TypeError("Cannot read property 'install' of null"); };
  assert.throws(() => loadOnnxRuntime(unlinked), /NATIVE_RUNTIME_UNAVAILABLE/);
  assert.throws(() => loadOnnxRuntime(() => ({})), /NATIVE_RUNTIME_UNAVAILABLE/);
});

test("a complete runtime is returned and the loader is only invoked when called", () => {
  let calls = 0;
  const runtime = { InferenceSession: {}, Tensor: class {} };
  const load = () => { calls += 1; return runtime; };
  assert.equal(calls, 0);
  assert.equal(loadOnnxRuntime(load), runtime);
  assert.equal(calls, 1);
});
