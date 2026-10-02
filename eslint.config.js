const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  // Node service (not bundled into the app): reads its config from process.env by name.
  { files: ['worker/**'], rules: { 'expo/no-dynamic-env-var': 'off' } },
  { ignores: ['dist/*', '.expo/*', 'design/*', 'supabase/*', 'worker/dist/*', 'node_modules/*'] },
];
