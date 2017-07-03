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
 * * "this" expressions in constructors are only handled properly on the top level
 */

/* Before release:
 * * export {..}
 * * destructuring assignment
 * * call to class declaration
 * * shorthand object notation
 * * check if rollup checks caught errors
 * * run tests again by using rollup and checking if tree-shaking occurs
 */

// next-up: side-effect-h

const ruleTester = new RuleTester()

const testRule = ({valid = [], invalid = []}) => () => {
  ruleTester.run('no-side-effects-in-initialization', rule, {valid, invalid})
}

describe('ArrowFunctionExpression', testRule({
  valid: [
    'const x = () => {}',
  ]
}))

describe('AssignmentExpression', testRule({
  valid: [
    'var x;x = 1',
    'const x = {}; x.y = 1',
    'const x = {}; x["y"] = 1',
    'const x = {}, y = ()=>{}; x[y()] = 1',
    'function x(){this.y = 1}; const z = new x()',
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
  ]
}))

describe('BinaryExpression', testRule({
  valid: [
    '1 + 2',
  ],
  invalid: [
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
  ]
}))

describe('BlockStatement', testRule({
  valid: [
    '{const x = 1}'
  ],
  invalid: [
    {
      code: '{ext()}',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
  ]
}))

describe('CallExpression', () => {
  describe('callee is MemberExpression', testRule({
    valid: [
      'const x = Object.keys({})',
    ],
    invalid: [
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
    ]
  }))

  describe('callee is FunctionExpression', testRule({
    valid: [
      '(function (){}())',
    ],
    invalid: [
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
    ]
  }))

  describe('callee is ArrowFunctionExpression', testRule({
    valid: [
      '(()=>{})()',
      'const x = new (function (){(()=>{this.y = 1})()})()',
    ],
    invalid: [
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
    ]
  }))

  describe('callee is Identifier', testRule({
    valid: [
      'const x = ()=>{}; x()',
      'function x(){}; x()',
      'let x = ()=>{};x = ()=>{}; x()',
      'var x = ()=>{};var x = ()=>{}; x()',
      'const x = ()=>{}; x(ext)',
      'const x = ()=>{}, y = ()=>{}; x(y())',
      'const x = ()=>{}, y = ()=>{x()}; y()',
      'const x = ext, y = ()=>{const x = ()=>{}; x()}; y()',
      'const x = new (function (){const x =()=>{this.z = 1};x()})()',
    ],
    invalid: [
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
          message: 'Could not determine side-effects of global function',
          type: 'Identifier'
        }]
      },
      {
        code: 'let x = ()=>{}; x = ext; x()',
        errors: [{
          message: 'Could not determine side-effects of global function',
          type: 'Identifier'
        }]
      },
      {
        code: 'var x = ()=>{}; var x = ext; x()',
        errors: [{
          message: 'Could not determine side-effects of global function',
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
        code: 'const x = ()=>{ext = 1}; x(); x(); x()',
        errors: [{
          message: 'Assignment to a global variable is a side-effect',
          type: 'Identifier'
        }]
      },
      {
        code: 'function x(){ext()}; x()',
        errors: [{
          message: 'Could not determine side-effects of global function',
          type: 'Identifier'
        }]
      },
      {
        code: 'function x(){ext = 1}; x(); x(); x()',
        errors: [{
          message: 'Assignment to a global variable is a side-effect',
          type: 'Identifier'
        }]
      },
      {
        code: 'let x = ()=>{}; const y = ()=>{x()}; x = ext; y()',
        errors: [{
          message: 'Could not determine side-effects of global function',
          type: 'Identifier'
        }]
      },
      {
        code: 'var x = ()=>{}; const y = ()=>{x()}; var x = ext; y()',
        errors: [{
          message: 'Could not determine side-effects of global function',
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
    ]
  }))

  describe('callee is Other', testRule({
    invalid: [
      {
        code: '3()',
        errors: [{
          message: 'Expression with unknown side-effects might be called as a function',
          type: 'Literal'
        }]
      },
      {
        code: 'const x = 3; x()',
        errors: [{
          message: 'Expression with unknown side-effects might be called as a function',
          type: 'Literal'
        }]
      },
    ]
  }))
})

describe('EmptyStatement', testRule({
  valid: [
    ';',
  ]
}))

describe('ExportDefaultDeclaration', testRule({
  valid: [
    'export default 42',
  ],
  invalid: [
    {
      code: 'export default ext()',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
  ]
}))

describe('ExportNamedDeclaration', testRule({
  valid: [
    'export const x = {}',
  ],
  invalid: [
    {
      code: 'export const x=ext()',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
  ]
}))

describe('ExpressionStatement', testRule({
  valid: [
    'const x = 1',
  ],
  invalid: [
    {
      code: 'ext()',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
  ]
}))

describe('FunctionDeclaration', testRule({
  valid: [
    'function x(){ext()}',
  ]
}))

describe('FunctionExpression', testRule({
  valid: [
    '(function (){ext()})',
  ]
}))

describe('Identifier', testRule({
  valid: [
    'var x;x',
  ]
}))

describe('IfStatement', testRule({
  valid: [
    'let y;if (ext > 0) {y = 1} else {y = 2}',
  ],
  invalid: [
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
  ]
}))

describe('Literal', testRule({
  valid: [
    '3',
  ]
}))

describe('MemberExpression', testRule({
  valid: [
    'const x = ext.y',
    'const x = ext["y"]',
  ],
  invalid: [
    {
      code: 'const x = {};const y = x[ext()]',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
  ]
}))

describe('NewExpression', testRule({
  valid: [
    'new (function (){this.x = 1})()',
    'function x(){this.y = 1}; const z = new x()',
  ],
  invalid: [
    {
      code: 'new ext()',
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
      code: 'const x=()=>{}; new x()',
      errors: [{
        message: 'Calling an arrow function with "new" is a side-effect',
        type: 'ArrowFunctionExpression'
      }]
    },
    {
      code: 'function x(){}; new x(ext())',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: 'function x(a){a()}; new x(ext)',
      errors: [{
        message: 'Calling a function parameter is considered a side-effect',
        type: 'FunctionDeclaration'
      }]
    },
    {
      code: 'function x(){ext()}; new x()',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: 'function x(){ext = 1}; new x(); new x(); new x()',
      errors: [{
        message: 'Assignment to a global variable is a side-effect',
        type: 'Identifier'
      }]
    },
  ]
}))

describe('ObjectExpression', testRule({
  valid: [
    'const x = {y: ext}',
    'const x = {["y"]: ext}',
    'const x = ()=>{};const y = {z: x()}',
    'const x = ()=>{};const y = {[x()]: ext}',
  ],
  invalid: [
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
  ]
}))

describe('ThisExpression', testRule({
  valid: [
    'this.x',
  ]
}))

describe('ThrowStatement', testRule({
  invalid: [
    {
      code: 'throw new Error("Hello Error")',
      errors: [{
        message: 'Throwing an error is a side-effect',
        type: 'ThrowStatement'
      }]
    },
  ]
}))

describe('UnaryExpression', testRule({
  valid: [
    '!ext',
  ],
  invalid: [
    {
      code: '!ext()',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
  ]
}))

describe('VariableDeclaration', testRule({
  valid: [
    'const x = 1',
  ],
  invalid: [
    {
      code: 'const x = ext()',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
  ]
}))

describe('VariableDeclarator', testRule({
  valid: [
    'var x, y',
    'var x = 1, y = 2',
    'const x = 1, y = 2',
    'let x = 1, y = 2',
  ],
  invalid: [
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
}))
