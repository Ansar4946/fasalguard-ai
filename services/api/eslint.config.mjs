import eslint from '@eslint/js';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'src/types/**/*.d.ts'] }, eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked, prettierRecommended,
  { languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } }, rules: { '@typescript-eslint/explicit-function-return-type': 'error', '@typescript-eslint/no-floating-promises': 'error' } },
);
