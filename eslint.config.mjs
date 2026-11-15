import nextVitals from 'eslint-config-next/core-web-vitals';

export default [
  ...nextVitals,
  {
    rules: {
      // Each existing case was reviewed and annotated (they read browser-only state after
      // hydration); new code is held to the rule.
      'react-hooks/set-state-in-effect': 'error',
    },
  },
  { ignores: ['.next/**', 'node_modules/**', 'public/**', 'scripts/**', 'tests/**'] },
];
