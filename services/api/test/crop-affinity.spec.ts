import { aliasesOf, detectCrops, otherCropAliases } from '../src/domain/assistant/crop-affinity';

describe('detectCrops', () => {
  it.each([
    ['چاول کی فصل کو پانی کب اور کتنا دینا چاہیے؟', ['rice']],
    ['دھان کی فصل میں پانی کا انتظام کیسے کریں؟', ['rice']],
    ['کپاس کی آبپاشی', ['cotton']],
    ['میری گندم کے پتے پیلے کیوں ہو رہے ہیں؟', ['wheat']],
    ['مکئی میں کھاد کب ڈالیں', ['maize']],
    ['گنے کی فصل کو پانی', ['sugarcane']],
    ['When should I irrigate cotton?', ['cotton']],
    ['Why are my Wheat leaves yellow', ['wheat']],
    ['rice nursery', ['rice']],
    ['How do I grow sugar cane?', ['sugarcane']],
    ['maize or corn spacing', ['maize']],
    ['Cottons and rice', ['cotton', 'rice']],
    ['گندم اور کپاس میں فرق', ['wheat', 'cotton']],
  ])('%s', (q, expected) => {
    expect(detectCrops(q)).toEqual(expected);
  });

  it.each(['what is the capital of France', 'فرانس کا دارالحکومت کیا ہے؟', 'tell me a joke', ''])(
    'finds no crop in %p',
    (q) => {
      expect(detectCrops(q)).toEqual([]);
    },
  );

  it('does not treat words that merely contain a crop name as the crop', () => {
    expect(detectCrops('priceless caricature')).toEqual([]);
    expect(detectCrops('گناہ')).toEqual([]);
  });

  it('exposes tsquery-safe aliases of the mentioned and the other crops', () => {
    expect(aliasesOf(['rice'])).toEqual(expect.arrayContaining(['rice', 'چاول', 'دھان']));
    expect(otherCropAliases(['rice'])).toEqual(expect.arrayContaining(['cotton', 'کپاس', 'گندم']));
    expect(otherCropAliases(['rice'])).not.toContain('چاول');
    for (const a of [...aliasesOf(['wheat', 'sugarcane']), ...otherCropAliases([])])
      expect(a).toMatch(/^[\p{L}\p{M}\p{N}]+$/u);
  });
});
