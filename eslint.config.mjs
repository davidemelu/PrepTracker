// eslint-config-next 16 ships native flat configs, so no FlatCompat shim.
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'src/generated/**',
      'public/sw.js',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },
  {
    // Integration tests must import application modules *after* the setup file
    // has pointed DATABASE_URL at the test database, so `typeof import(...)`
    // annotations on lazily-imported modules are deliberate here.
    files: ['tests/**/*.ts'],
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
  },
  {
    // The pure domain layer must stay free of I/O so it can be unit tested
    // without a database and reused by any transport.
    files: ['src/lib/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@prisma/*', '@/generated/*', 'next', 'next/*', 'react', 'react-dom', '@/lib/db'],
              message:
                'src/lib/domain must stay pure: no Prisma, Next or React imports. Move I/O to src/lib/actions or src/lib/queries.',
            },
          ],
        },
      ],
    },
  },
];

export default config;
