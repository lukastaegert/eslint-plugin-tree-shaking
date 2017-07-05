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
 * * destructuring assignment
 * * call to class declaration
 * * shorthand object notation
 * * check if rollup checks caught errors
 * * run tests again by using rollup and checking if tree-shaking occurs
 */

// next-up: side-effect-h/i
// next-up: side-effect-k
// next-up: LogicalExpression

const ruleTester = new RuleTester()

const testRule = ({valid = [], invalid = []}) => () => {
  ruleTester.run('no-side-effects-in-initialization', rule, {valid, invalid})
}

describe('ArrayExpression', testRule({
  valid: [
    '[]',
    '[ext,ext]',
    '[1,,2,]',
  ],
  invalid: [
    {
      code: '[ext()]',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: '[,,ext(),]',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
  ]
}))

describe('ArrowFunctionExpression', () => {
  testRule({
    valid: [
      'a=>{a(); ext()}',
    ]
  })()

  describe('when called', testRule({
    valid: [
      '(()=>{})()',
      'new (function (){(()=>{this.y = 1})()})()',
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
        code: 'new (()=>{})()',
        errors: [{
          message: 'Calling an arrow function with "new" is a side-effect',
          type: 'ArrowFunctionExpression'
        }]
      },
      {
        code: '(a=>{a()})(ext)',
        errors: [{
          message: 'Calling a function parameter is considered a side-effect',
          type: 'ArrowFunctionExpression'
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
})

describe('AssignmentExpression', testRule({
  valid: [
    'var x;x = 1',
    'var x;x += 1',
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
      code: 'ext += 1',
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
    '{}',
    'const x=()=>{};{const x=ext}x()',
    'const x=ext;{const x=()=>{}; x()}',
  ],
  invalid: [
    {
      code: '{ext()}',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: 'var x=()=>{};{var x=ext}x()',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: 'var x=ext;{x(); var x=()=>{}}',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
  ]
}))

describe('BreakStatement', testRule({
  valid: [
    'while(true){break}',
  ]
}))

describe('CallExpression', testRule({
  valid: [
    '(a=>{const y = a})(ext, ext)',
    'const x = ()=>{}, y = ()=>{}; x(y())',
  ],
  invalid: [
    {
      code: '3()',
      errors: [{
        message: 'Expression with unknown side-effects might be called as a function',
        type: 'Literal'
      }]
    },
    {
      code: '(()=>{})(ext(), 1)',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: '(()=>{})(1, ext())',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
  ]
}))

describe('CatchClause', testRule({
  valid: [
    'try {} catch (error) {}',
    'const x=()=>{}; try {} catch (error) {const x=ext}; x()',
    'const x=ext; try {} catch (error) {const x=()=>{}; x()}',
  ],
  invalid: [
    {
      code: 'try {} catch (error) {ext()}',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: 'var x=()=>{}; try {} catch (error) {var x=ext}; x()',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
  ]
}))

describe('ContinueStatement', testRule({
  valid: [
    'while(true){continue}',
  ]
}))

describe('DebuggerStatement', testRule({
  invalid: [
    {
      code: 'debugger',
      errors: [{
        message: 'Debugger statements are side-effects',
        type: 'DebuggerStatement'
      }]
    },
  ]
}))

describe('DoWhileStatement', testRule({
  valid: [
    'do {} while(true)',
    'do {} while(ext > 0)',
    'const x = ()=>{}; do x(); while(true)',
  ],
  invalid: [
    {
      code: 'do {} while(ext())',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: 'do ext(); while(true)',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: 'do {ext()} while(true)',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
  ]
}))

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

describe('ForInStatement', testRule({
  valid: [
    'for(const x in ext){x = 1}',
    'let x; for(x in ext){}',
  ],
  invalid: [
    {
      code: 'for(ext in {a: 1}){}',
      errors: [{
        message: 'Assignment to a global variable is a side-effect',
        type: 'Identifier'
      }]
    },
    {
      code: 'for(const x in ext()){}',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: 'for(const x in {a: 1}){ext()}',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: 'for(const x in {a: 1}) ext()',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
  ]
}))

describe('ForStatement', testRule({
  valid: [
    'for(let i = 0; i < 3; i++){i++}',
    'for(;;){}',
  ],
  invalid: [
    {
      code: 'for(ext();;){}',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: 'for(;ext();){}',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: 'for(;true;ext()){}',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: 'for(;true;) ext()',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: 'for(;true;){ext()}',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
  ]
}))

describe('FunctionDeclaration', () => {
  testRule({
    valid: [
      'function x(a){a(); ext()}',
    ]
  })()

  describe('when called', testRule({
    valid: [
      'function x(){}; x()',
      'function x(){this.y = 1}; new x()',
      'function x(){if (ext > 0){this.y = 1}}; new x()',
    ],
    invalid: [
      {
        code: 'function x(){ext()}; x()',
        errors: [{
          message: 'Could not determine side-effects of global function',
          type: 'Identifier'
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
        code: 'function x(a){a()}; x(ext)',
        errors: [{
          message: 'Calling a function parameter is considered a side-effect',
          type: 'FunctionDeclaration'
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
        code: 'function x(){this.y = 1}; x()',
        errors: [{
          message: 'Assignment to a member of an unknown this value is a side-effect',
          type: 'Identifier'
        }]
      },
      {
        code: 'new (function (){function x(){this.y = 1}; x()})()',
        errors: [{
          message: 'Assignment to a member of an unknown this value is a side-effect',
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
        code: 'function x(){ext = 1}; new x(); new x(); new x()',
        errors: [{
          message: 'Assignment to a global variable is a side-effect',
          type: 'Identifier'
        }]
      },
    ]
  }))
})

describe('FunctionExpression', () => {
  testRule({
    valid: [
      '(function (a){a(); ext()})',
    ]
  })()

  describe('when called', testRule({
    valid: [
      '(function (){}())',
      'new (function (){this.x = 1})()',
      'new (function (){if (ext > 0){this.x = 1}})()',
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
        code: 'new (function (){ext()})()',
        errors: [{
          message: 'Could not determine side-effects of global function',
          type: 'Identifier'
        }]
      },
      {
        code: '(function (a){a()}(ext))',
        errors: [{
          message: 'Calling a function parameter is considered a side-effect',
          type: 'FunctionExpression'
        }]
      },
      {
        code: 'new (function (a){a()})(ext)',
        errors: [{
          message: 'Calling a function parameter is considered a side-effect',
          type: 'FunctionExpression'
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
        code: 'new (function (){(function(){this.y = 1}())})()',
        errors: [{
          message: 'Assignment to a member of an unknown this value is a side-effect',
          type: 'Identifier'
        }]
      },
    ]
  }))
})

describe('Identifier', () => {
  testRule({
    valid: [
      'var x;x',
    ]
  })()

  describe('when called', testRule({
    valid: [
      'const x = ()=>{}; x(ext)',
      'function x(){}; x(ext)',
      'let x = ()=>{};x = ()=>{}; x(ext)',
      'var x = ()=>{};var x = ()=>{}; x(ext)',
      'const x = ()=>{}, y = ()=>{x()}; y()',
      'const x = ext, y = ()=>{const x = ()=>{}; x()}; y()',
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
    ]
  }))
})

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

describe('LabeledStatement', testRule({
  valid: [
    'loop: for(;true;){continue loop}',
  ],
  invalid: [
    {
      code: 'loop: for(;true;){ext()}',
      errors: [{
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

describe('MemberExpression', () => {
  testRule({
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
  })()

  describe('when called', testRule({
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
})

describe('NewExpression', testRule({
  valid: [
    'new (function (){this.x = 1})()',//
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
  ]
}))

describe('ObjectExpression', testRule({
  valid: [
    'const x = {y: ext}',
    'const x = {["y"]: ext}',
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

describe('ReturnStatement', testRule({
  valid: [
    '(()=>{return})()',
    '(()=>{return 1})()',
  ],
  invalid: [
    {
      code: '(()=>{return ext()})()',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
  ]
}))

describe('SwitchCase', testRule({
  valid: [
    'switch(ext){case ext:const x = 1;break;default:}',
  ],
  invalid: [
    {
      code: 'switch(ext){case ext():}',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: 'switch(ext){case 1:ext()}',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
  ]
}))

describe('SwitchStatement', testRule({
  valid: [
    'switch(ext){}',
    'const x=()=>{}; switch(ext){case 1:const x=ext}; x()',
    'const x=ext; switch(ext){case 1:const x=()=>{}; x()}',
  ],
  invalid: [
    {
      code: 'switch(ext()){}',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: 'var x=()=>{}; switch(ext){case 1:var x=ext}; x()',
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

describe('TryStatement', testRule({
  valid: [
    'try {} catch (error) {}',
    'try {} finally {}',
    'try {} catch (error) {} finally {}',
  ],
  invalid: [
    {
      code: 'try {ext()} catch (error) {}',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: 'try {} finally {ext()}',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
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

describe('UpdateExpression', testRule({
  valid: [
    'let x=1;x++',
    'const x={};x.y++',
  ],
  invalid: [
    {
      code: 'ext++',
      errors: [{
        message: 'Assignment to a global variable is a side-effect',
        type: 'Identifier'
      }]
    },
    {
      code: 'const x={};x[ext()]++',
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

describe('WhileStatement', testRule({
  valid: [
    'while(true){}',
    'while(ext > 0){}',
    'const x = ()=>{}; while(true)x()',
  ],
  invalid: [
    {
      code: 'while(ext()){}',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: 'while(true)ext()',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
    {
      code: 'while(true){ext()}',
      errors: [{
        message: 'Could not determine side-effects of global function',
        type: 'Identifier'
      }]
    },
  ]
}))
