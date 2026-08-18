import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PasswordSetupTokens1755000024000 implements MigrationInterface {
  name = 'PasswordSetupTokens1755000024000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE password_setup_tokens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash varchar(64) NOT NULL UNIQUE,
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_password_setup_tokens_user_active
        ON password_setup_tokens(user_id, expires_at DESC) WHERE used_at IS NULL;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS password_setup_tokens');
  }
}
