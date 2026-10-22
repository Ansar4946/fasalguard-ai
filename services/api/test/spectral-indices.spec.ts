import { runInNewContext } from 'node:vm';
import { indexScript, satelliteLayers } from '../src/domain/satellite/spectral-indices';

const clear = { B02: 0.03, B03: 0.06, B04: 0.04, B08: 0.45, B11: 0.2, SCL: 4, dataMask: 1 };
function evaluate(script: string, sample: typeof clear): number[] {
  return runInNewContext(`${script}\nevaluatePixel(sample)`, { sample }) as number[];
}
describe('consistent reflectance index layers', () => {
  it.each([
    ['NDVI', 0.83673469],
    ['EVI', 0.6996587],
    ['NDWI', -0.76470588],
    ['NDMI', 0.38461538],
  ] as const)('%s uses physical reflectance', (index, expected) => {
    expect(evaluate(indexScript(index), clear)[0]).toBeCloseTo(expected, 6);
  });
  it.each([0, 1, 2, 3, 7, 8, 9, 10, 11])('masks SCL %i for every observation layer', (SCL) => {
    for (const layer of satelliteLayers) {
      const result = evaluate(layer.evalscript, { ...clear, SCL });
      expect(result[layer.type === 'TRUE_COLOR' ? 3 : layer.type === 'DATA_QUALITY' ? 0 : 1]).toBe(
        0,
      );
    }
  });
  it('does not turn a zero denominator into a valid zero', () => {
    const result = evaluate(indexScript('NDVI'), { ...clear, B04: 0, B08: 0 });
    expect(Number.isNaN(result[0])).toBe(true);
    expect(result[1]).toBe(0);
  });
  it('does not clip legitimate EVI values to one', () => {
    expect(
      evaluate(indexScript('EVI'), { ...clear, B02: 0.2, B04: 0.05, B08: 0.6 })[0],
    ).toBeGreaterThan(1);
  });
});
