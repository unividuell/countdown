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
  { ignores: ['dist/', 'node_modules/', '*.d.ts'] },
]
