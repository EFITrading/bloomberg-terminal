import { FlatCompat } from '@eslint/eslintrc'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname,
})

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: ['node_modules/**', '.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'src/components/charts/SimpleTimeChart_broken.tsx'],
  },
  {
    rules: {
      // Disable strict TypeScript rules for development
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      
      // Relax React Hooks rules - keep functional but allow some flexibility
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/rules-of-hooks': 'error', // Keep this as error - it's critical
      
      // Allow prefer-const violations - they don't break functionality
      'prefer-const': 'warn',
      
      // Allow unescaped entities in JSX
      'react/no-unescaped-entities': 'warn',
      
      // Allow img tags for now
      '@next/next/no-img-element': 'warn',
      
      // Allow anonymous default exports
      'import/no-anonymous-default-export': 'warn',
      
      // Disable some overly strict rules
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    }
  }
]

export default eslintConfig
