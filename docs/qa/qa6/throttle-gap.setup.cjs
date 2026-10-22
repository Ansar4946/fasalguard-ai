// QA6 diagnostic: wait out the 60 s login throttle window before the 4th auth test.
jest.setTimeout(120000);
beforeEach(async () => {
  if ((expect.getState().currentTestName || '').includes('lists, revokes one')) await new Promise((r) => setTimeout(r, 62000));
}, 90000);
