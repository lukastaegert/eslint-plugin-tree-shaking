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
 * * side-effects in function call arguments
 * * Consider impure functions as unknown assignments to their arguments
 * * Creating ES6 classes is always impure
 * * "This" expressions in constructors are only handled properly on the top level
 */

/* Before release:
 * * use same code for *function expressions and calls to *function references
 * * export {..}
 * * destructuring assignment
 * * call to class declaration
 * * shorthand object notation
 * * tests for "new" arguments
 * * check if rollup checks caught errors
 */

// next-up: side-effect-h

const ruleTester = new RuleTester()
ruleTester.run('no-side-effects-in-initialization', rule, {
  valid: [
    // ArrowFunctionExpression
    'const x = () => {}',

    // AssignmentExpression
    'var x;x = 1',
    'const x = {}; x.y = 1',
    'const x = {}; x["y"] = 1',
    'const x = {}, y = ()=>{}; x[y()] = 1',
    'function x(){this.y = 1}; const z = new x()',

    // BinaryExpression
    '1 + 2',

    // BlockStatement
    '{const x = 1}',

    // CallExpression
    // * callee is MemberExpression
    'const x = Object.keys({})',
    // * callee is FunctionExpression
    '(function (){}())',
    // * callee is ArrowFunctionExpression
    '(()=>{})()',
    'const x = new (function (){(()=>{this.y = 1})()})()',
    // * callee is Identifier
    'const x = ()=>{}; x()',
    'function x(){}; x()',
    'let x = ()=>{};x = ()=>{}; x()',
    'var x = ()=>{};var x = ()=>{}; x()',
    'const x = ()=>{}; x(ext)',
    'const x = ()=>{}, y = ()=>{}; x(y())',
    'const x = ()=>{}, y = ()=>{x()}; y()',
    'const x = ext, y = ()=>{const x = ()=>{}; x()}; y()',
    'const x = new (function (){const x =()=>{this.z = 1};x()})()',

    // EmptyStatement
    ';',

    // ExportDefaultDeclaration
    'export default 42',

    // ExportNamedDeclaration
    'export const x = {}',

    // ExpressionStatement
    'const x = 1',

    // FunctionDeclaration
    'function x(){ext()}',

    // FunctionExpression
    '(function (){ext()})',

    // Identifier
    'var x;x',

    // IfStatement
    'let y;if (ext > 0) {y = 1} else {y = 2}',

    // Literal
    '3',

    // MemberExpression
    'const x = ext.y',
    'const x = ext["y"]',

    // NewExpression
    'new (function (){this.x = 1})()',
    'function x(){this.y = 1}; const z = new x()',

    // ObjectExpression
    'const x = {y: ext}',
    'const x = {["y"]: ext}',
    'const x = ()=>{};const y = {z: x()}',
    'const x = ()=>{};const y = {[x()]: ext}',

    // ThisExpression
    'this.x',

    // ThrowStatement

    // UnaryExpression
    '!ext',

    // VariableDeclaration
    'const x = 1',

    // VariableDeclarator
    'var x, y',
    'var x = 1, y = 2',
    'const x = 1, y = 2',
    'let x = 1, y = 2',
  ],

  invalid: [
    // ArrowFunctionExpression

    // AssignmentExpression
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
      code: 'const x = {};x[ext()] = 1',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: 'this.x = 1',
      errors: [{
        message: 'Assignment to a member of an unknown this value is a side-effect',
        type: 'Identifier'
      }]
    },

    // BinaryExpression
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

    // BlockStatement
    {
      code: '{ext()}',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },

    // CallExpression
    // * callee is MemberExpression
    {
      code: 'ext.x()',
      errors: [{
        message: 'Could not determine side-effects of member function',
        type: 'Identifier'
      }]
    },
    {
      code: 'const x = {}; x.y()',
      errors: [{
        message: 'Could not determine side-effects of member function',
        type: 'Identifier'
      }]
    },
    {
      code: 'const Object = {}; const x = Object.keys({})',
      errors: [{
        message: 'Could not determine side-effects of member function',
        type: 'Identifier'
      }]
    },
    {
      code: 'const x = {}; x[ext()]()',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }, {
        message: 'Could not determine side-effects of member function',
        type: 'CallExpression'
      }]
    },
    // * callee is FunctionExpression
    {
      code: '(function (){ext()}())',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: '(function (){this.x = 1}())',
      errors: [{
        message: 'Assignment to a member of an unknown this value is a side-effect',
        type: 'Identifier'
      }]
    },
    {
      code: 'const x = new (function (){(function(){this.y = 1}())})()',
      errors: [{
        message: 'Assignment to a member of an unknown this value is a side-effect',
        type: 'Identifier'
      }]
    },
    // * callee is ArrowFunctionExpression
    {
      code: '(()=>{ext()})()',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: '(()=>{this.x = 1})()',
      errors: [{
        message: 'Assignment to a member of an unknown this value is a side-effect',
        type: 'Identifier'
      }]
    },
    // * callee is Identifier
    {
      code: 'ext()',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: 'const x = ext; x()',
      errors: [{
        message: 'Expression with unknown side-effects is possibly called as a function',
        type: 'Identifier'
      }]
    },
    {
      code: 'let x = ()=>{}; x = ext; x()',
      errors: [{
        message: 'Expression with unknown side-effects is possibly called as a function',
        type: 'Identifier'
      }]
    },
    {
      code: 'var x = ()=>{}; var x = ext; x()',
      errors: [{
        message: 'Expression with unknown side-effects is possibly called as a function',
        type: 'Identifier'
      }]
    },
    {
      code: 'const x = ()=>{ext()}; x()',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: 'let x = ()=>{}; const y = ()=>{x()}; x = ext; y()',
      errors: [{
        message: 'Expression with unknown side-effects is possibly called as a function',
        type: 'Identifier'
      }]
    },
    {
      code: 'var x = ()=>{}; const y = ()=>{x()}; var x = ext; y()',
      errors: [{
        message: 'Expression with unknown side-effects is possibly called as a function',
        type: 'Identifier'
      }]
    },
    {
      code: 'const x = a=>{a()}; x(ext)',
      errors: [{
        message: 'Calling a function parameter is considered a side-effect',
        type: 'ArrowFunctionExpression'
      }]
    },
    {
      code: 'const x = ()=>{}; x(ext())',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: 'function x(){this.x = 1}; x()',
      errors: [{
        message: 'Assignment to a member of an unknown this value is a side-effect',
        type: 'Identifier'
      }]
    },
    {
      code: 'const x = ()=>{this.x = 1}; x()',
      errors: [{
        message: 'Assignment to a member of an unknown this value is a side-effect',
        type: 'Identifier'
      }]
    },
    {
      code: 'const x = new (function (){const y = function(){this.z = 1}; y()})()',
      errors: [{
        message: 'Assignment to a member of an unknown this value is a side-effect',
        type: 'Identifier'
      }]
    },

    // EmptyStatement

    // ExportDefaultDeclaration
    {
      code: 'export default ext()',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },

    // ExportNamedDeclaration
    {
      code: 'export const x=ext()',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },

    // ExpressionStatement
    {
      code: 'ext()',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },

    // Identifier

    // IfStatement
    {
      code: 'if (ext()>0){}',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: 'if (1>0){ext()}',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: 'if (1<0){} else {ext()}',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: 'if (ext>0){ext()} else {ext()}',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }, {
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },

    // Literal

    // MemberExpression
    {
      code: 'const x = {};const y = x[ext()]',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },

    // NewExpression
    {
      code: 'const x = new ext()',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: 'new (()=>{})()',
      errors: [{
        message: 'Calling an arrow function with "new" is a side-effect',
        type: 'ArrowFunctionExpression'
      }]
    },
    {
      code: 'const x=()=>{}; const y=new x()',
      errors: [{
        message: 'Calling an arrow function with "new" is a side-effect',
        type: 'ArrowFunctionExpression'
      }]
    },

    // ObjectExpression
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

    // ThisExpression

    // ThrowStatement
    {
      code: 'throw new Error("Hello Error")',
      errors: [{
        message: 'Throwing an error is a side-effect',
        type: 'ThrowStatement'
      }]
    },

    // UnaryExpression
    {
      code: '!ext()',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },

    // VariableDeclaration
    {
      code: 'const x = ext()',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },

    // VariableDeclarator
    {
      code: 'var x = ext(),y = ext()',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }, {
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: 'const x = ext(),y = ext()',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }, {
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: 'let x = ext(),y = ext()',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }, {
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
  ]
})
