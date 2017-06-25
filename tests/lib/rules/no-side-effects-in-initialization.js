const rule = require('../../../lib/rules/no-side-effects-in-initialization'),
  RuleTester = require('eslint').RuleTester

RuleTester.setDefaultConfig({
  parserOptions: {
    ecmaVersion: 6,
    sourceType: "module"
  }
});

const ruleTester = new RuleTester()
ruleTester.run('no-side-effects-in-initialization', rule, {

  valid: [
    'const x = 1',
    `const x = 1
        x = 2`,
    'export const x = {}'
  ],

  invalid: [
    {
      code: 'x = 1',
      errors: [{
        message: "Initialization code should not have side effects",
        type: "Identifier"
      }]
    },
    {
      code: 'export const x = Object.freeze({})',
      errors: [{
        message: "Initialization code should not have side effects",
        type: "Identifier"
      }]
    }
  ]
})
