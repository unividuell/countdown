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
    // Comment-only placeholder page (content lands in a later spec). vue-eslint-parser doesn't
    // count an HTML comment as a template child, so vue/valid-template-root sees no root element
    // even though Vue itself renders the comment node fine. `[slug]` is escaped: unescaped, the
    // brackets are a glob character class and would match a single s/l/u/g character instead.
    files: ['src/pages/\\[slug\\]/index.vue'],
    rules: { 'vue/valid-template-root': 'off' },
  },
  { ignores: ['dist/', 'node_modules/', '*.d.ts'] },
]
