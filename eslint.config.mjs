import nextVitals from 'eslint-config-next/core-web-vitals';

export default [
  ...nextVitals,
  {
    rules: {
      // New in the React Compiler rule set (ESLint 9 / Next 16). Existing effects that sync state
      // from props or browser storage are safe; reported as warnings until they're refactored.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  { ignores: ['.next/**', 'node_modules/**', 'public/**', 'scripts/**', 'tests/**'] },
];
