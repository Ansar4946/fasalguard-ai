import { DataSource, type QueryRunner } from 'typeorm';

const url = process.env.F07_TEST_DATABASE_URL;
if (url && !['f07_test', 'f03_test', 'f03_runtime_test'].includes(new URL(url).pathname.slice(1)))
  throw new Error('An explicitly allowed disposable F07 test database is required.');
const integration = url ? describe : describe.skip;

integration('Market price persistence', () => {
  let source: DataSource;
  let runner: QueryRunner;

  beforeAll(async () => {
    source = new DataSource({ type: 'postgres', url, connectTimeoutMS: 5000 });
    await source.initialize();
    // Uses the explicitly provisioned disposable test schema; never loads .env or runs application migrations.
    runner = source.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
  }, 30_000);

  afterAll(async () => {
    if (runner) {
      await runner.rollbackTransaction();
      await runner.release();
    }
    if (source?.isInitialized) await source.destroy();
  }, 30_000);

  it('deduplicates repeated source observations', async () => {
    const parameters = [
      'Wheat',
      'Lahore',
      'Lahore',
      'Punjab',
      4000,
      4300,
      4150,
      100,
      'KG',
      'AMIS',
      'AMIS:Wheat:Lahore:2099-01-01',
      'http://www.amis.pk/ViewPrices.aspx?searchType=0&commodityId=1',
      '2099-01-01',
    ];
    const statement = `INSERT INTO mandi_prices(crop_name,market_name,district,province,minimum_price,maximum_price,average_price,quantity,unit,source,source_identifier,source_url,price_date)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT(crop_name,market_name,price_date,source) DO NOTHING RETURNING id`;
    const first = (await runner.query(statement, parameters)) as Array<{ id: string }>;
    const duplicate = (await runner.query(statement, parameters)) as Array<{ id: string }>;
    expect(first).toHaveLength(1);
    expect(duplicate).toHaveLength(0);
  });

  it('rejects an average outside its source range', async () => {
    await expect(
      runner.query(
        `INSERT INTO mandi_prices(crop_name,market_name,district,province,minimum_price,maximum_price,average_price,quantity,unit,source,source_identifier,source_url,price_date)
         VALUES('Wheat','Multan','Multan','Punjab',4000,4300,4500,100,'KG','AMIS','invalid','http://www.amis.pk','2099-01-02')`,
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
});
