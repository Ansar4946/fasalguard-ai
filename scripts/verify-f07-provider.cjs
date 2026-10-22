// Read-only public provider probe; does not load .env, write DB, or enable a deployed worker.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const api = path.resolve(__dirname, '../services/api');
const apiRequire = Module.createRequire(path.join(api, 'package.json'));
const ts = apiRequire('typescript');
apiRequire('reflect-metadata');
require.extensions['.ts'] = (module, filename) => {
  if (!filename.startsWith(path.join(api, 'src'))) throw new Error('Unexpected source path');
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    experimentalDecorators: true, emitDecoratorMetadata: true,
  }}).outputText, filename);
};
const {ConfigService} = apiRequire('@nestjs/config');
const {AmisMarketPriceProvider} = require(path.join(api, 'src/domain/market/providers/amis-market-price.provider.ts'));
(async () => {
  const config = new ConfigService({amisSyncEnabled: true, amisBaseUrl:'http://www.amis.pk', amisTimeoutSeconds:15, amisRequestDelaySeconds:1});
  const records = await new AmisMarketPriceProvider(config).fetchCurrentPrices();
  const summary = {checkedAt:new Date().toISOString(), workflow:'public AMIS to actual provider/parser only; no database', records:records.length,
    crops:[...new Set(records.map(r=>r.crop))], priceDates:[...new Set(records.map(r=>r.priceDate))], unit:'PKR/100 kg', districts:'Unknown; not inferred'};
  fs.writeFileSync(path.resolve(__dirname,'../docs/features/f07-results/real-provider-result.json'),JSON.stringify(summary,null,2));
  // Public observations retained separately; these are not inserted or substituted into the UI.
  fs.writeFileSync(path.resolve(__dirname,'../docs/features/f07-results/real-provider-observations.json'),JSON.stringify(records,null,2));
  console.log(JSON.stringify(summary));
})().catch(error=>{console.error(JSON.stringify({status:'FAIL',code:error.code??error.name,message:'Public provider verification did not complete.'}));process.exitCode=1;});
