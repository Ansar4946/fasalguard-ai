const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

/** Loads a pure TypeScript module from features/dawai-check (type-only imports are erased). */
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const filename = path.resolve(__dirname, "../../features/dawai-check", `${name}.ts`);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const out = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const baseRequire = mod.require.bind(mod);
  // Sibling modules ("./presentation") are TypeScript sources: load them through this same loader.
  mod.require = (id) => (id.startsWith("./") ? load(id.slice(2)) : baseRequire(id));
  mod._compile(out, filename);
  cache.set(name, mod.exports);
  return mod.exports;
}

module.exports = { load };
