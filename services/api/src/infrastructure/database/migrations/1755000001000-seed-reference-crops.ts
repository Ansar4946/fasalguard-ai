import type { MigrationInterface, QueryRunner } from 'typeorm';
const crops = [
  ['cotton', 'Cotton', 'Gossypium spp.'],
  ['wheat', 'Wheat', 'Triticum aestivum'],
  ['rice', 'Rice', 'Oryza sativa'],
  ['maize', 'Maize', 'Zea mays'],
  ['sugarcane', 'Sugarcane', 'Saccharum officinarum'],
] as const;
export class SeedReferenceCrops1755000001000 implements MigrationInterface {
  name = 'SeedReferenceCrops1755000001000';
  async up(q: QueryRunner): Promise<void> {
    for (const [slug, name, scientific] of crops)
      await q.query(
        `INSERT INTO crops(slug,name,scientific_name) VALUES($1,$2,$3) ON CONFLICT(slug) DO NOTHING`,
        [slug, name, scientific],
      );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM crops WHERE slug=ANY($1)`, [crops.map((x) => x[0])]);
  }
}
