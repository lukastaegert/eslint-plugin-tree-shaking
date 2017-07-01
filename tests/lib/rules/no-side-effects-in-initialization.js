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
 * * Consider impure functions as unknown assignments to their arguments
 * * Creating ES6 classes is always impure
 * * "This" expressions in constructors are only handled properly on the top level
 */

/* Before release:
 * * export {..}
 * * destructuring assignment
 * * call to class declaration
 * * shorthand object notation
 * * tests for "new" arguments
 */

// next-up: side-effect-es5-classes

const ruleTester = new RuleTester()
ruleTester.run('no-side-effects-in-initialization', rule, {
  valid: [
    'const x = 1',
    'let x; x = 1',
    'let x = 1 + 2; x = 2 + 3',
    'var x = 1 + 2; var x = 2 + 3',
    'const x = {y: 1}',
    'const x = {["y"]: 1}',
    'const x = {y: ext}',
    'const x = () => {};const y = {z: x()}',
    'const x = function(){};const y = {[x()]: 1}',
    'const x = {}; x.y = 1',
    'const x = () => {}; x()',
    'const x = () => {}, y = () => {}; x(y())',
    'const x = () => {}, y = () => {x()}; y()',
    'const x = ext, y = () => {const x = () => {}; x()}; y()',
    'let y;if (ext > 0) {y = 1} else {y = 2}',
    '(function () {}())',
    'var keys = Object.keys({})',
    'export const x = {}',
    'function Foo(){}; const x = new Foo()',
    'function Foo(){this.x = 1}; const x = new Foo()'
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
      code: 'const x = 1 + ext()',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: 'const x = ext() + 1',
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
      code: 'const x = {};x[ext()]()',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }, {
        message: 'Could not determine side-effects of member function',
        type: 'CallExpression'
      }]
    },
    {
      code: 'const x = {};x[ext()] = 1',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: 'const x = {};const y = x[ext()]',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: 'const x = ext; x()',
      errors: [{
        message: 'Expression with unknown side-effects is called as a function',
        type: 'Identifier'
      }]
    },
    {
      code: 'let x = () => {}; x = ext; x()',
      errors: [{
        message: 'Expression with unknown side-effects is called as a function',
        type: 'Identifier'
      }]
    },
    {
      code: 'var x = () => {}; var x = ext; x()',// Is currently removed by rollup even though it should not be
      errors: [{
        message: 'Expression with unknown side-effects is called as a function',
        type: 'Identifier'
      }]
    },
    {
      code: 'const x = {y: ext()}',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: 'const x = {["y"]: ext()}',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: 'const x = {[ext()]: 1}',
      errors: [{
        message: 'Could not determine side-effects of global function',
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
      code: 'if (ext()>0){}',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: 'if (ext>0){ext()}',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: 'if (ext>0){} else {ext()}',
      errors: [{
        message: 'Could not determine side-effects of global function',
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
    },
    {
      code: '(function () {ext()}())',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: 'function foo () {var Object = {keys: function () {console.log( "side-effect" )}};' +
      'var keys = Object.keys({});}foo();',
      errors: [{
        message: 'Could not determine side-effects of member function',
        type: 'Identifier'
      }]
    },
    {
      code: 'const x = new Foo()',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: 'const x=()=>{this.x = 1}; const y=new x()',
      errors: [{
        message: 'Calling an arrow function with "new" is a side-effect',
        type: 'ArrowFunctionExpression'
      }]
    }
  ]
})
