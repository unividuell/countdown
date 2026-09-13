import vue from 'eslint-plugin-vue'
import vueTsConfig from '@vue/eslint-config-typescript'
import prettier from '@vue/eslint-config-prettier'

export default [
  ...vue.configs['flat/recommended'],
  ...vueTsConfig(),
  prettier,
  {
    files: ['src/pages/**/*.vue'],
    rules: { 'vue/multi-word-component-names': 'off' },
  },
  {
    // Avatar draws one thing — a member — and a second word would only restate that.
    files: ['src/ui/Avatar.vue'],
    rules: { 'vue/multi-word-component-names': 'off' },
  },
  {
    // `pad` has no default on purpose — an absent pad means no padding, not a padding of
    // zero — and under `exactOptionalPropertyTypes` that means leaving it out of
    // `withDefaults` entirely, which this rule otherwise flags.
    files: ['src/ui/flipdot/FlipDotBoard.vue'],
    rules: { 'vue/require-default-prop': 'off' },
  },
  {
    // A spec that mounts a component against stubs needs one stub per collaborator, and they
    // belong in the spec that mounts them — a file per double would put the contract under test
    // one import away from the test asserting it.
    files: ['src/**/__tests__/**'],
    rules: { 'vue/one-component-per-file': 'off' },
  },
  { ignores: ['dist/', 'node_modules/', '*.d.ts'] },
]
