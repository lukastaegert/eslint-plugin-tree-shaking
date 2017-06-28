const rule = require('../../../lib/rules/no-side-effects-in-initialization'),
  RuleTester = require('eslint').RuleTester

RuleTester.setDefaultConfig({
  parserOptions: {
    ecmaVersion: 6,
    sourceType: 'module'
  }
})

/* Bugs in rollup:
 * * Reassigning a variable that is at some point a function will be an effect; instead, check
 *   all assignments
 * * This generally goes for reassignments where any assignment is non-trivial
 * * Reassigning var with var is handled differently from reassigning without var
 * * Side effects in function call arguments
 */

/* Before release:
 * * export {..}
 * * destructuring assignment
 */

const ruleTester = new RuleTester()
ruleTester.run('no-side-effects-in-initialization', rule, {
  valid: [
    'const x = 1',
    'let x; x = 1',
    'let x = 1 + 2; x = 2 + 3',
    'var x = 1 + 2; var x = 2 + 3',
    'const x = {}; x.y = 1',
    'const x = () => {}; x()',
    'const x = () => {}, y = () => {}; x(y())',
    'const x = () => {}, y = () => {x()}; y()',
    'const x = ext, y = () => {const x = () => {}; x()}; y()',
    'export const x = {}'
  ],

  invalid: [
    {
      code: 'ext = 1',
      errors: [{
        message: 'Assignment to a global variable is a side-effect',
        type: 'Identifier'
      }]
    },
    {
      code: 'ext.x = 1',
      errors: [{
        message: 'Assignment to a member of a global variable is a side-effect',
        type: 'Identifier'
      }]
    },
    {
      code: 'ext()',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: 'ext.x()',
      errors: [{
        message: 'Could not determine side-effects of member function',
        type: 'Identifier'
      }]
    },
    {
      code: 'const x = ext; x()',
      errors: [{
        message: 'Assigned expression with unknown side-effects might be called as a function',
        type: 'Identifier'
      }]
    },
    {
      code: 'let x = () => {}; x = ext; x()',
      errors: [{
        message: 'Assigned expression with unknown side-effects might be called as a function',
        type: 'Identifier'
      }]
    },
    {
      code: 'var x = () => {}; var x = ext; x()',// Is currently removed by rollup even though it should not be
      errors: [{
        message: 'Assigned expression with unknown side-effects might be called as a function',
        type: 'Identifier'
      }]
    },
    {
      code: 'const x = {y: ext}; x.y()',
      errors: [{
        message: 'Could not determine side-effects of member function',
        type: 'Identifier'
      }]
    },
    {
      code: 'const x = () => {}; x(ext())',// Is currently removed by rollup even though it should not be
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: 'const x = () => {ext()}; x()',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    }
  ]
})
