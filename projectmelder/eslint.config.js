// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // supabase/functions is Deno-code en wordt gecontroleerd met `deno check`
    ignores: ['dist/*', 'supabase/*'],
  },
]);
