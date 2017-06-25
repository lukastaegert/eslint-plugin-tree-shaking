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
    'let x; x = 1',
    'const x = {}; x.y = 1',
    'const x = () => {};x()',
    'const x = {y(){}};x.y()',
    'const x = () => {}, y = () => {};x(y())',
    'export const x = {}'
  ],

  invalid: [
    {
      code: 'ext = 1',
      errors: [{
        message: "Initialization code should not have side effects",
        type: "Identifier"
      }]
    },
    {
      code: 'ext.x = 1',
      errors: [{
        message: "Initialization code should not have side effects",
        type: "MemberExpression"
      }]
    },
    {
      code: 'ext()',
      errors: [{
        message: "Initialization code should not have side effects",
        type: "Identifier"
      }]
    },
    {
      code: 'ext.x()',
      errors: [{
        message: "Initialization code should not have side effects",
        type: "MemberExpression"
      }]
    },
    {
      code: 'const x = () => {};x(ext())',
      errors: [{
        message: "Initialization code should not have side effects",
        type: "Identifier"
      }]
    },
    {
      code: 'const x = ext;x()',
      errors: [{
        message: "Initialization code should not have side effects",
        type: "Identifier"
      }]
    }
  ]
})

// TODO side effects inside functions called synchronously
// we need to know if calling a function would have side effects but only report them when the
// function is called in which case we should consider reporting the side effect and the function
// call

// TODO different scoping for let/const and var; also check if blocks:
//      https://developer.mozilla.org/de/docs/Web/JavaScript/Reference/Statements/let

// TODO calling functions to which external functions are assigned to
