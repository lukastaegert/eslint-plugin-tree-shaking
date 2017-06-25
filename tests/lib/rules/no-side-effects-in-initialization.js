'use strict'

var rule = require('../../../lib/rules/no-side-effects-in-initialization'),
  RuleTester = require('eslint').RuleTester

RuleTester.setDefaultConfig({
  parserOptions: {
    ecmaVersion: 6,
    sourceType: "module"
  }
});

var ruleTester = new RuleTester()
ruleTester.run('no-side-effects-in-initialization', rule, {

  valid: [
    'const x = 1;const y = 2'
  ],

  invalid: [
    // {
    //   code: 'x = 1',
    //   errors: [{
    //     message: "Stuff",
    //     type: "ExpressionStatement"
    //   }]
    // }
  ]
})
