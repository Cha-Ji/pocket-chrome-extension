import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'scripts/', '*.config.*', '*.cjs'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx,js}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        chrome: 'readonly',
      },
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
      'no-console': 'warn',
      'no-empty': 'warn',
      'no-undef': 'off',
      'no-case-declarations': 'warn',
      'no-useless-escape': 'warn',
      'no-useless-assignment': 'warn',
    },
  },
  // Allow console in logger implementation (it IS the console abstraction)
  {
    files: ['src/lib/logger/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  // Allow console in test files
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'src/test/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  prettier,
);
