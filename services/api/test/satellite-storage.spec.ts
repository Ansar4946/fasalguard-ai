import { MockObjectStorageProvider } from '../src/domain/media/storage/mock-object-storage.provider';
describe('private satellite layer storage', () => {
  it('stores worker-generated binary privately and only issues temporary access', async () => {
    const storage = new MockObjectStorageProvider();
    const body = Buffer.from('not-derived-from-png-colors');
    const stored = await storage.putPrivateObject({
      objectKey: 'satellite/field/capture/ndvi.tiff',
      contentType: 'image/tiff',
      body,
    });
    expect(stored).toMatchObject({ contentType: 'image/tiff', sizeBytes: body.byteLength });
    const access = await storage.createAccessUrl('satellite/field/capture/ndvi.tiff', 300);
    expect(access.url).toContain('temporary=1');
    expect(access.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});
