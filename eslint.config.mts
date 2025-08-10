import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      'eslint.config.mts',
      'node_modules/**',
      'dist/**',
      'jest.config.js',
    ],
  },
  // TypeScript configuration for source files (type-aware linting)
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      ...prettierConfig.rules,
      'prettier/prettier': 'error',
      '@typescript-eslint/no-unused-vars': ['error'],
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // TypeScript configuration for test files (no type-aware linting)
  {
    files: ['tests/**/*.ts'],
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      ...prettierConfig.rules,
      'prettier/prettier': 'error',
      '@typescript-eslint/no-unused-vars': ['error'],
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      // Disable type-related rules for tests
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
    },
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest, // Add Jest globals (e.g., describe, test, expect)
      },
    },
  }
);
