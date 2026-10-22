const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

/** Loads a pure TypeScript module from features/dawai-check (type-only imports are erased). */
function load(name) {
  const filename = path.resolve(__dirname, "../../features/dawai-check", `${name}.ts`);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const out = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  mod._compile(out, filename);
  return mod.exports;
}

module.exports = { load };
