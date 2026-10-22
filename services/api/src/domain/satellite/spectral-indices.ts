/** Reflectance-only Sentinel-2 indices. SCL mask matches the Python F02 policy.
 * Formulas adapted from OpenFarm; see licenses/OPENFARM.txt (BSD-3-Clause).
 */
export type SpectralIndex = 'NDVI' | 'EVI' | 'NDWI' | 'NDMI';
const inputs =
  '[{bands:["B02","B03","B04","B08","B11","SCL","dataMask"],units:["REFLECTANCE","REFLECTANCE","REFLECTANCE","REFLECTANCE","REFLECTANCE","DN","DN"]}]';
const compute = `function observation(s){
let denominators=[s.B08+s.B04,s.B08+6*s.B04-7.5*s.B02+1,s.B03+s.B08,s.B08+s.B11];
let valid=!!s.dataMask&&[4,5,6].includes(s.SCL)&&[s.B02,s.B03,s.B04,s.B08,s.B11].every(Number.isFinite)&&denominators.every(d=>Number.isFinite(d)&&Math.abs(d)>1e-6);
return {valid,values:{NDVI:(s.B08-s.B04)/denominators[0],EVI:2.5*(s.B08-s.B04)/denominators[1],NDWI:(s.B03-s.B08)/denominators[2],NDMI:(s.B08-s.B11)/denominators[3]}};}`;
export function indexScript(index: SpectralIndex, statistical = false): string {
  const output = statistical
    ? '[{id:"index",bands:1},{id:"dataMask",bands:1}]'
    : '{bands:2,sampleType:"FLOAT32"}';
  const pixel = statistical
    ? `return {index:[o.valid?o.values.${index}:0],dataMask:[o.valid?1:0]}`
    : `return [o.valid?o.values.${index}:NaN,o.valid?1:0]`;
  return `//VERSION=3\nfunction setup(){return{input:${inputs},output:${output}}}${compute}function evaluatePixel(s){let o=observation(s);${pixel}}`;
}
export const satelliteLayers = [
  {
    type: 'TRUE_COLOR',
    format: 'image/png',
    evalscript: `//VERSION=3\nfunction setup(){return{input:${inputs},output:{bands:4}}}${compute}function evaluatePixel(s){let o=observation(s);return[2.5*s.B04,2.5*s.B03,2.5*s.B02,o.valid?1:0]}`,
  },
  ...(['NDVI', 'EVI', 'NDWI', 'NDMI'] as const).map((type) => ({
    type,
    format: 'image/tiff',
    evalscript: indexScript(type),
  })),
  {
    type: 'DATA_QUALITY',
    format: 'image/tiff',
    evalscript: `//VERSION=3\nfunction setup(){return{input:${inputs},output:{bands:2,sampleType:"UINT8"}}}${compute}function evaluatePixel(s){return[observation(s).valid?1:0,s.SCL]}`,
  },
];
