/* eslint-env mocha */

const rule = require('../../../lib/rules/no-side-effects-in-initialization')
const RuleTester = require('eslint').RuleTester

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
 * * If a global object or parameter is assigned as a member to an object, it can be freely
 *   mutated (also wrong here); to fix this, we could store a data structure for each variable
 *   noting "do-not-mutate" and "do-not-mutate-any-members" nodes
 * * Manually constructing an iterable will not trigger side-effects in the iterator function
 *   (no solution yet)
 */

/* Before release:
 * * run tests again by using rollup and checking if tree-shaking occurs
 */

const ruleTester = new RuleTester()

const testRule = ({ valid = [], invalid = [] }) => () => {
  ruleTester.run('no-side-effects-in-initialization', rule, { valid, invalid })
}

describe(
  'ArrayExpression',
  testRule({
    valid: ['[]', '[ext,ext]', '[1,,2,]'],
    invalid: [
      {
        code: '[ext()]',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: '[,,ext(),]',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })
)

describe(
  'ArrayPattern',
  testRule({
    valid: ['const [x] = []', 'const [,x,] = []'],
    invalid: [
      {
        code: 'const [x = ext()] = []',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'const [,x = ext(),] = []',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })
)

describe('ArrowFunctionExpression', () => {
  testRule({
    valid: ['a=>{a(); ext()}']
  })()

  describe(
    'when called',
    testRule({
      valid: ['(()=>{})()', '(a=>{})()', '((...a)=>{})()', '(({a})=>{})()'],
      invalid: [
        {
          code: '(()=>{ext()})()',
          errors: [
            {
              message: 'Could not determine side-effects of global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'new (()=>{})()',
          errors: [
            {
              message: 'Calling an arrow function with "new" is a side-effect',
              type: 'ArrowFunctionExpression'
            }
          ]
        },
        {
          code: '(({a = ext()})=>{})()',
          errors: [
            {
              message: 'Could not determine side-effects of global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: '(a=>{a()})(ext)',
          errors: [
            {
              message: 'Calling a function parameter is a side-effect',
              type: 'Identifier'
            }
          ]
        },
        {
          code: '((...a)=>{a()})(ext)',
          errors: [
            {
              message: 'Calling a function parameter is a side-effect',
              type: 'Identifier'
            }
          ]
        },
        {
          code: '(({a})=>{a()})(ext)',
          errors: [
            {
              message: 'Calling a function parameter is a side-effect',
              type: 'Identifier'
            }
          ]
        },
        {
          code: '(a=>{a.x = 1})(ext)',
          errors: [
            {
              message: 'Mutating a function parameter is a side-effect',
              type: 'Identifier'
            }
          ]
        },
        {
          code: '(a=>{const b = a;b.x = 1})(ext)',
          errors: [
            {
              message: 'Mutating a function parameter is a side-effect',
              type: 'Identifier'
            }
          ]
        },
        {
          code: '((...a)=>{a.x = 1})(ext)',
          errors: [
            {
              message: 'Mutating a function parameter is a side-effect',
              type: 'Identifier'
            }
          ]
        },
        {
          code: '(({a})=>{a.x = 1})(ext)',
          errors: [
            {
              message: 'Mutating a function parameter is a side-effect',
              type: 'Identifier'
            }
          ]
        }
      ]
    })
  )

  describe(
    'when mutated',
    testRule({
      valid: ['const x = ()=>{}; x.y = 1']
    })
  )
})

describe(
  'AssignmentExpression',
  testRule({
    valid: [
      'var x;x = 1',
      'var x;x += 1',
      'const x = {}; x.y = 1',
      'const x = {}; x["y"] = 1',
      'const x = {}, y = ()=>{}; x[y()] = 1',
      'function x(){this.y = 1}; const z = new x()'
    ],
    invalid: [
      {
        code: 'ext = 1',
        errors: [
          {
            message: 'Assignment to a global variable is a side-effect',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'ext += 1',
        errors: [
          {
            message: 'Assignment to a global variable is a side-effect',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'ext.x = 1',
        errors: [
          {
            message: 'Mutating a global variable is a side-effect',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'const x = {};x[ext()] = 1',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'this.x = 1',
        errors: [
          {
            message: 'Mutating an unknown this value is a side-effect',
            type: 'ThisExpression'
          }
        ]
      }
    ]
  })
)

describe(
  'AssignmentPattern',
  testRule({
    valid: [
      'const {x = ext} = {}',
      'const {x: y = ext} = {}',
      'const {[ext]: x = ext} = {}',
      'const x = ()=>{}, {y = x()} = {}'
    ],
    invalid: [
      {
        code: 'const {x = ext()} = {}',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'const {y: {x = ext()} = {}} = {}',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })
)

describe(
  'BinaryExpression',
  testRule({
    valid: ['1 + 2', 'if (1-1) ext()'],
    invalid: [
      {
        code: 'const x = 1 + ext()',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'const x = ext() + 1',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })
)

describe(
  'BlockStatement',
  testRule({
    valid: [
      '{}',
      'const x=()=>{};{const x=ext}x()',
      'const x=ext;{const x=()=>{}; x()}'
    ],
    invalid: [
      {
        code: '{ext()}',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'var x=()=>{};{var x=ext}x()',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'var x=ext;{x(); var x=()=>{}}',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })
)

describe(
  'BreakStatement',
  testRule({
    valid: ['while(true){break}']
  })
)

describe('CallExpression', () => {
  testRule({
    valid: [
      '(a=>{const y = a})(ext, ext)',
      'const x = ()=>{}, y = ()=>{}; x(y())'
    ],
    invalid: [
      {
        code: '3()',
        errors: [
          {
            message: 'Could not determine side-effects of calling Literal',
            type: 'Literal'
          }
        ]
      },
      {
        code: '(()=>{})(ext(), 1)',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: '(()=>{})(1, ext())',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })()

  describe(
    'when called',
    testRule({
      invalid: [
        {
          code: 'const x = ()=>ext; const y = x(); y()',
          errors: [
            {
              message: 'Calling the result of a function call is a side-effect',
              type: 'CallExpression'
            }
          ]
        }
      ]
    })
  )

  describe(
    'when mutated',
    testRule({
      invalid: [
        {
          code: 'const x = ()=>ext; const y = x(); y.z = 1',
          errors: [
            {
              message:
                'Mutating the result of a function call is a side-effect',
              type: 'CallExpression'
            }
          ]
        }
      ]
    })
  )
})

describe(
  'CatchClause',
  testRule({
    valid: [
      'try {} catch (error) {}',
      'const x=()=>{}; try {} catch (error) {const x=ext}; x()',
      'const x=ext; try {} catch (error) {const x=()=>{}; x()}'
    ],
    invalid: [
      {
        code: 'try {} catch (error) {ext()}',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'var x=()=>{}; try {} catch (error) {var x=ext}; x()',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })
)

describe('ClassBody', () => {
  testRule({
    valid: ['class x {a(){ext()}}'],
    invalid: [
      {
        code: 'class x {[ext()](){}}',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })()

  describe(
    'when called',
    testRule({
      valid: [
        'class x {a(){ext()}}; new x()',
        'class x {constructor(){}}; new x()',
        'class y{}; class x extends y{}; new x()',
        'class y{}; class x extends y{constructor(){super()}}; new x()'
      ],
      invalid: [
        {
          code: 'class x {constructor(){ext()}}; new x()',
          errors: [
            {
              message: 'Could not determine side-effects of global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'class x extends ext {}; new x()',
          errors: [
            {
              message: 'Could not determine side-effects of global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'class y {constructor(){ext()}}; class x extends y {}; new x()',
          errors: [
            {
              message: 'Could not determine side-effects of global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code:
            'class y {constructor(){ext()}}; class x extends y {constructor(){super()}}; new x()',
          errors: [
            {
              message: 'Could not determine side-effects of global function',
              type: 'Identifier'
            }
          ]
        }
      ]
    })
  )
})

describe('ClassDeclaration', () => {
  testRule({
    valid: ['class x extends ext {}'],
    invalid: [
      {
        code: 'class x extends ext() {}',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'class x {[ext()](){}}',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })()

  describe(
    'when called',
    testRule({
      valid: ['class x {}; new x()'],
      invalid: [
        {
          code: 'class x {constructor(){ext()}}; new x()',
          errors: [
            {
              message: 'Could not determine side-effects of global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'class x extends ext {}; new x()',
          errors: [
            {
              message: 'Could not determine side-effects of global function',
              type: 'Identifier'
            }
          ]
        }
      ]
    })
  )
})

describe('ClassExpression', () => {
  testRule({
    valid: ['(class extends ext {})'],
    invalid: [
      {
        code: '(class extends ext() {})',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: '(class {[ext()](){}})',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })()

  describe(
    'when called',
    testRule({
      valid: ['new (class {})()'],
      invalid: [
        {
          code: 'new (class {constructor(){ext()}})()',
          errors: [
            {
              message: 'Could not determine side-effects of global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'new (class extends ext {})()',
          errors: [
            {
              message: 'Could not determine side-effects of global function',
              type: 'Identifier'
            }
          ]
        }
      ]
    })
  )
})

describe('ConditionalExpression', () => {
  testRule({
    valid: [
      'ext ? 1 : 2',
      'true ? 1 : ext()',
      'false ? ext() : 2',
      'if (true ? false : true) ext()'
    ],
    invalid: [
      {
        code: 'ext() ? 1 : 2',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'ext ? ext() : 2',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'ext ? 1 : ext()',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'if (false ? false : true) ext()',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })()

  describe(
    'when called',
    testRule({
      valid: [
        'const x = ()=>{}, y = ()=>{};(ext ? x : y)()',
        'const x = ()=>{}; (true ? x : ext)()',
        'const x = ()=>{}; (false ? ext : x)()'
      ],
      invalid: [
        {
          code: 'const x = ()=>{}; (true ? ext : x)()',
          errors: [
            {
              message: 'Could not determine side-effects of global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'const x = ()=>{}; (false ? x : ext)()',
          errors: [
            {
              message: 'Could not determine side-effects of global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'const x = ()=>{}; (ext ? x : ext)()',
          errors: [
            {
              message: 'Could not determine side-effects of global function',
              type: 'Identifier'
            }
          ]
        }
      ]
    })
  )
})

describe(
  'ContinueStatement',
  testRule({
    valid: ['while(true){continue}']
  })
)

describe(
  'DebuggerStatement',
  testRule({
    invalid: [
      {
        code: 'debugger',
        errors: [
          {
            message: 'Debugger statements are side-effects',
            type: 'DebuggerStatement'
          }
        ]
      }
    ]
  })
)

describe(
  'DoWhileStatement',
  testRule({
    valid: [
      'do {} while(true)',
      'do {} while(ext > 0)',
      'const x = ()=>{}; do x(); while(true)'
    ],
    invalid: [
      {
        code: 'do {} while(ext())',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'do ext(); while(true)',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'do {ext()} while(true)',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })
)

describe(
  'EmptyStatement',
  testRule({
    valid: [';']
  })
)

describe(
  'ExportAllDeclaration',
  testRule({
    valid: ['export * from "x"']
  })
)

describe(
  'ExportDefaultDeclaration',
  testRule({
    valid: [
      'export default 2',
      'const x = 2; export default x',
      'export default function(){}',
      'export default (function(){})'
    ],
    invalid: [
      {
        code: 'export default ext()',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })
)

describe(
  'ExportNamedDeclaration',
  testRule({
    valid: [
      'export const x = 2',
      'export function x(){}',
      'const x = 2; export {x}',
      'export {x} from "y"',
      'export {x as y} from "z"',
      'export {x as default} from "z"'
    ],
    invalid: [
      {
        code: 'export const x=ext()',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })
)

describe(
  'ExpressionStatement',
  testRule({
    valid: ['const x = 1'],
    invalid: [
      {
        code: 'ext()',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })
)

describe(
  'ForInStatement',
  testRule({
    valid: ['for(const x in ext){x = 1}', 'let x; for(x in ext){}'],
    invalid: [
      {
        code: 'for(ext in {a: 1}){}',
        errors: [
          {
            message: 'Assignment to a global variable is a side-effect',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'for(const x in ext()){}',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'for(const x in {a: 1}){ext()}',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'for(const x in {a: 1}) ext()',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })
)

describe(
  'ForOfStatement',
  testRule({
    valid: ['for(const x of ext){x = 1}', 'let x; for(x of ext){}'],
    invalid: [
      {
        code: 'for(ext of {a: 1}){}',
        errors: [
          {
            message: 'Assignment to a global variable is a side-effect',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'for(const x of ext()){}',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'for(const x of {a: 1}){ext()}',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'for(const x of {a: 1}) ext()',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })
)

describe(
  'ForStatement',
  testRule({
    valid: ['for(let i = 0; i < 3; i++){i++}', 'for(;;){}'],
    invalid: [
      {
        code: 'for(ext();;){}',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'for(;ext();){}',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'for(;true;ext()){}',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'for(;true;) ext()',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'for(;true;){ext()}',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })
)

describe('FunctionDeclaration', () => {
  testRule({
    valid: ['function x(a){a(); ext()}']
  })()

  describe(
    'when called',
    testRule({
      valid: [
        'function x(){}; x()',
        'function x(a){}; x()',
        'function x(...a){}; x()',
        'function x({a}){}; x()'
      ],
      invalid: [
        {
          code: 'function x(){ext()}; x()',
          errors: [
            {
              message: 'Could not determine side-effects of global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'function x(){ext()}; new x()',
          errors: [
            {
              message: 'Could not determine side-effects of global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'function x(a = ext()){}; x()',
          errors: [
            {
              message: 'Could not determine side-effects of global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'function x(a){a()}; x(ext)',
          errors: [
            {
              message: 'Calling a function parameter is a side-effect',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'function x(...a){a()}; x(ext)',
          errors: [
            {
              message: 'Calling a function parameter is a side-effect',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'function x({a}){a()}; x(ext)',
          errors: [
            {
              message: 'Calling a function parameter is a side-effect',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'function x(a){a(); a(); a()}; x(ext)',
          errors: [
            {
              message: 'Calling a function parameter is a side-effect',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'function x(a){a.y = 1}; x(ext)',
          errors: [
            {
              message: 'Mutating a function parameter is a side-effect',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'function x(...a){a.y = 1}; x(ext)',
          errors: [
            {
              message: 'Mutating a function parameter is a side-effect',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'function x({a}){a.y = 1}; x(ext)',
          errors: [
            {
              message: 'Mutating a function parameter is a side-effect',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'function x(a){a.y = 1; a.y = 2; a.y = 3}; x(ext)',
          errors: [
            {
              message: 'Mutating a function parameter is a side-effect',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'function x(){ext = 1}; x(); x(); x()',
          errors: [
            {
              message: 'Assignment to a global variable is a side-effect',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'function x(){ext = 1}; new x(); new x(); new x()',
          errors: [
            {
              message: 'Assignment to a global variable is a side-effect',
              type: 'Identifier'
            }
          ]
        }
      ]
    })
  )

  describe(
    'when mutated',
    testRule({
      valid: ['function x(){}; x.y = 1']
    })
  )
})

describe('FunctionExpression', () => {
  testRule({
    valid: ['(function (a){a(); ext()})']
  })()

  describe(
    'when called',
    testRule({
      valid: [
        '(function (){}())',
        '(function (a){}())',
        '(function (...a){}())',
        '(function ({a}){}())'
      ],
      invalid: [
        {
          code: '(function (){ext()}())',
          errors: [
            {
              message: 'Could not determine side-effects of global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'new (function (){ext()})()',
          errors: [
            {
              message: 'Could not determine side-effects of global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: '(function ({a = ext()}){}())',
          errors: [
            {
              message: 'Could not determine side-effects of global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: '(function (a){a()}(ext))',
          errors: [
            {
              message: 'Calling a function parameter is a side-effect',
              type: 'Identifier'
            }
          ]
        },
        {
          code: '(function (...a){a()}(ext))',
          errors: [
            {
              message: 'Calling a function parameter is a side-effect',
              type: 'Identifier'
            }
          ]
        },
        {
          code: '(function ({a}){a()}(ext))',
          errors: [
            {
              message: 'Calling a function parameter is a side-effect',
              type: 'Identifier'
            }
          ]
        },
        {
          code: '(function (a){a.x = 1}(ext))',
          errors: [
            {
              message: 'Mutating a function parameter is a side-effect',
              type: 'Identifier'
            }
          ]
        },
        {
          code: '(function (a){const b = a;b.x = 1}(ext))',
          errors: [
            {
              message: 'Mutating a function parameter is a side-effect',
              type: 'Identifier'
            }
          ]
        },
        {
          code: '(function (...a){a.x = 1}(ext))',
          errors: [
            {
              message: 'Mutating a function parameter is a side-effect',
              type: 'Identifier'
            }
          ]
        },
        {
          code: '(function ({a}){a.x = 1}(ext))',
          errors: [
            {
              message: 'Mutating a function parameter is a side-effect',
              type: 'Identifier'
            }
          ]
        }
      ]
    })
  )
})

describe('Identifier', () => {
  testRule({
    valid: ['var x;x']
  })()

  describe(
    'when called',
    testRule({
      valid: [
        'const x = ()=>{}; x(ext)',
        'function x(){}; x(ext)',
        'let x = ()=>{};x = ()=>{}; x(ext)',
        'var x = ()=>{};var x = ()=>{}; x(ext)',
        'const x = ()=>{}, y = ()=>{x()}; y()',
        'const x = ext, y = ()=>{const x = ()=>{}; x()}; y()'
      ],
      invalid: [
        {
          code: 'ext()',
          errors: [
            {
              message: 'Could not determine side-effects of global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'const x = ext; x()',
          errors: [
            {
              message: 'Could not determine side-effects of global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'let x = ()=>{}; x = ext; x()',
          errors: [
            {
              message: 'Could not determine side-effects of global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'var x = ()=>{}; var x = ext; x()',
          errors: [
            {
              message: 'Could not determine side-effects of global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'const x = ()=>{ext()}; x()',
          errors: [
            {
              message: 'Could not determine side-effects of global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'const x = ()=>{ext = 1}; x(); x(); x()',
          errors: [
            {
              message: 'Assignment to a global variable is a side-effect',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'let x = ()=>{}; const y = ()=>{x()}; x = ext; y()',
          errors: [
            {
              message: 'Could not determine side-effects of global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'var x = ()=>{}; const y = ()=>{x()}; var x = ext; y()',
          errors: [
            {
              message: 'Could not determine side-effects of global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'const x = ()=>{}; const {y} = x(); y()',
          errors: [
            {
              message:
                'Could not determine side-effects of calling result of destructuring assignment',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'const x = ()=>{}; const [y] = x(); y()',
          errors: [
            {
              message:
                'Could not determine side-effects of calling result of destructuring assignment',
              type: 'Identifier'
            }
          ]
        }
      ]
    })
  )

  describe(
    'when mutated',
    testRule({
      valid: ['const x = {}; x.y = ext'],
      invalid: [
        {
          code: 'var x = ext; x.y = 1',
          errors: [
            {
              message: 'Mutating a global variable is a side-effect',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'var x = {}; x = ext; x.y = 1',
          errors: [
            {
              message: 'Mutating a global variable is a side-effect',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'var x = {}; var x = ext; x.y = 1',
          errors: [
            {
              message: 'Mutating a global variable is a side-effect',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'var x = {}; x = ext; x.y = 1; x.y = 1; x.y = 1',
          errors: [
            {
              message: 'Mutating a global variable is a side-effect',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'const x = {y:ext}; const {y} = x; y.z = 1',
          errors: [
            {
              message:
                'Mutating the result of a destructuring assignment is a side-effect',
              type: 'Identifier'
            }
          ]
        }
      ]
    })
  )
})

describe(
  'IfStatement',
  testRule({
    valid: [
      'let y;if (ext > 0) {y = 1} else {y = 2}',
      'if (false) {ext()}',
      'if (true) {} else {ext()}'
    ],
    invalid: [
      {
        code: 'if (ext()>0){}',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'if (1>0){ext()}',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'if (1<0){} else {ext()}',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'if (ext>0){ext()} else {ext()}',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          },
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })
)

describe(
  'ImportDeclaration',
  testRule({
    valid: [
      'import "x"',
      'import x from "y"',
      'import {x} from "y"',
      'import {x as y} from "z"',
      'import * as x from "y"'
    ],
    invalid: [
      {
        code: 'import x from "y"; x()',
        errors: [
          {
            message: 'Calling an import is a side-effect',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'import x from "y"; x.z = 1',
        errors: [
          {
            message: 'Mutating an import is a side-effect',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'import {x} from "y"; x()',
        errors: [
          {
            message: 'Calling an import is a side-effect',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'import {x} from "y"; x.z = 1',
        errors: [
          {
            message: 'Mutating an import is a side-effect',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'import {x as y} from "z"; y()',
        errors: [
          {
            message: 'Calling an import is a side-effect',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'import {x as y} from "z"; y.a = 1',
        errors: [
          {
            message: 'Mutating an import is a side-effect',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'import * as x from "y"; x.z()',
        errors: [
          {
            message: 'Could not determine side-effects of member function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'import * as x from "y"; x.z = 1',
        errors: [
          {
            message: 'Mutating an import is a side-effect',
            type: 'Identifier'
          }
        ]
      }
    ]
  })
)

describe(
  'LabeledStatement',
  testRule({
    valid: ['loop: for(;true;){continue loop}'],
    invalid: [
      {
        code: 'loop: for(;true;){ext()}',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })
)

describe(
  'Literal',
  testRule({
    valid: ['3', 'if (false) ext()'],
    invalid: [
      {
        code: 'if (true) ext()',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })
)

describe(
  'LogicalExpression',
  testRule({
    valid: [
      '3 || 4',
      'true || ext()',
      'false && ext()',
      'if (false && false) ext()',
      'if (true && false) ext()',
      'if (false && true) ext()',
      'if (false || false) ext()'
    ],
    invalid: [
      {
        code: 'ext() && true',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'true && ext()',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'false || ext()',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'if (true && true) ext()',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'if (false || true) ext()',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'if (true || false) ext()',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'if (true || true) ext()',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })
)

describe('MemberExpression', () => {
  testRule({
    valid: ['const x = ext.y', 'const x = ext["y"]'],
    invalid: [
      {
        code: 'const x = {};const y = x[ext()]',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })()

  describe(
    'when called',
    testRule({
      valid: ['const x = Object.keys({})'],
      invalid: [
        {
          code: 'ext.x()',
          errors: [
            {
              message: 'Could not determine side-effects of member function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'const x = {}; x.y()',
          errors: [
            {
              message: 'Could not determine side-effects of member function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'const x = ()=>{}; x().y()',
          errors: [
            {
              message: 'Could not determine side-effects of member function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'const Object = {}; const x = Object.keys({})',
          errors: [
            {
              message: 'Could not determine side-effects of member function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'const x = {}; x[ext()]()',
          errors: [
            {
              message: 'Could not determine side-effects of global function',
              type: 'Identifier'
            },
            {
              message: 'Could not determine side-effects of member function',
              type: 'CallExpression'
            }
          ]
        }
      ]
    })
  )

  describe(
    'when mutated',
    testRule({
      valid: ['const x = {};x.y = ext', 'const x = {y: ext};delete x.y'],
      invalid: [
        {
          code: 'const x = {y:{}};x.y.z = ext',
          errors: [
            {
              message: 'Mutating members of an object is a side-effect',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'const x = {y:ext};const y = x.y; y.z = 1',
          errors: [
            {
              message: 'Mutating members of an object is a side-effect',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'const x = {y: ext};delete x.y.z',
          errors: [
            {
              message: 'Mutating members of an object is a side-effect',
              type: 'Identifier'
            }
          ]
        }
      ]
    })
  )
})

describe(
  'MetaProperty',
  testRule({
    valid: ['function x(){const y = new.target}; x()']
  })
)

describe(
  'MethodDefinition',
  testRule({
    valid: ['class x {a(){}}', 'class x {static a(){}}'],
    invalid: [
      {
        code: 'class x {static [ext()](){}}',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })
)

describe(
  'NewExpression',
  testRule({
    valid: [
      'new (function (){this.x = 1})()', //
      'function x(){this.y = 1}; const z = new x()'
    ],
    invalid: [
      {
        code: 'new ext()',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'new (()=>{})()',
        errors: [
          {
            message: 'Calling an arrow function with "new" is a side-effect',
            type: 'ArrowFunctionExpression'
          }
        ]
      },
      {
        code: 'const x=()=>{}; new x()',
        errors: [
          {
            message: 'Calling an arrow function with "new" is a side-effect',
            type: 'ArrowFunctionExpression'
          }
        ]
      }
    ]
  })
)

describe(
  'ObjectExpression',
  testRule({
    valid: [
      'const x = {y: ext}',
      'const x = {["y"]: ext}',
      'const x = {};x.y = ext'
    ],
    invalid: [
      {
        code: 'const x = {y: ext()}',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'const x = {["y"]: ext()}',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'const x = {[ext()]: 1}',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })
)

describe(
  'ObjectPattern',
  testRule({
    valid: ['const {x} = {}', 'const {[ext]: x} = {}'],
    invalid: [
      {
        code: 'const {[ext()]: x} = {}',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })
)

describe(
  'RestElement',
  testRule({
    valid: ['const [...x] = []']
  })
)

describe(
  'ReturnStatement',
  testRule({
    valid: ['(()=>{return})()', '(()=>{return 1})()'],
    invalid: [
      {
        code: '(()=>{return ext()})()',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })
)

describe(
  'SequenceExpression',
  testRule({
    valid: ['1, 2', 'if (ext, false) ext()'],
    invalid: [
      {
        code: 'ext(), 1',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: '1, ext()',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'if (1, true) ext()',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'if (1, ext) ext()',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })
)

describe('Super', () => {
  describe(
    'when called',
    testRule({
      valid: ['class y{}; class x extends y{constructor(){super()}}; new x()'],
      invalid: [
        {
          code:
            'class y {constructor(){ext()}}; class x extends y {constructor(){super()}}; new x()',
          errors: [
            {
              message: 'Could not determine side-effects of global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'class x {constructor(){super()}}; new x()',
          errors: [
            {
              message:
                'Could not determine side effects of super class constructor',
              type: 'Super'
            }
          ]
        },
        {
          code:
            'class y{}; class x extends y{constructor(){super(); super.test()}}; new x()',
          errors: [
            {
              message: 'Could not determine side-effects of member function',
              type: 'Identifier'
            }
          ]
        }
      ]
    })
  )
})

describe(
  'SwitchCase',
  testRule({
    valid: ['switch(ext){case ext:const x = 1;break;default:}'],
    invalid: [
      {
        code: 'switch(ext){case ext():}',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'switch(ext){case 1:ext()}',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })
)

describe(
  'SwitchStatement',
  testRule({
    valid: [
      'switch(ext){}',
      'const x=()=>{}; switch(ext){case 1:const x=ext}; x()',
      'const x=ext; switch(ext){case 1:const x=()=>{}; x()}'
    ],
    invalid: [
      {
        code: 'switch(ext()){}',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'var x=()=>{}; switch(ext){case 1:var x=ext}; x()',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })
)

describe(
  'TaggedTemplateExpression',
  testRule({
    valid: ['const x = ()=>{}; x``'],
    invalid: [
      {
        code: 'ext``',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        // eslint-disable-next-line no-template-curly-in-string
        code: 'const x = ()=>{}; x`${ext()}`',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })
)

describe(
  'TemplateLiteral',
  testRule({
    valid: [
      '``',
      '`Literal`',
      // eslint-disable-next-line no-template-curly-in-string
      '`Literal ${ext}`',
      // eslint-disable-next-line no-template-curly-in-string
      'const x = ()=>"a"; `Literal ${x()}`'
    ],
    invalid: [
      {
        // eslint-disable-next-line no-template-curly-in-string
        code: '`Literal ${ext()}`',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })
)

describe('ThisExpression', () => {
  testRule({
    valid: ['this.x']
  })()

  describe(
    'when mutated',
    testRule({
      valid: [
        'new (function (){this.x = 1})()',
        'new (function (){{this.x = 1}})()',
        'new (function (){(()=>{this.x = 1})()})()',
        'function x(){this.y = 1}; new x()'
      ],
      invalid: [
        {
          code: 'this.x = 1',
          errors: [
            {
              message: 'Mutating an unknown this value is a side-effect',
              type: 'ThisExpression'
            }
          ]
        },
        {
          code: '(()=>{this.x = 1})()',
          errors: [
            {
              message: 'Mutating an unknown this value is a side-effect',
              type: 'ThisExpression'
            }
          ]
        },
        {
          code: '(function(){this.x = 1}())',
          errors: [
            {
              message: 'Mutating an unknown this value is a side-effect',
              type: 'ThisExpression'
            }
          ]
        },
        {
          code: 'new (function (){(function(){this.x = 1}())})()',
          errors: [
            {
              message: 'Mutating an unknown this value is a side-effect',
              type: 'ThisExpression'
            }
          ]
        },
        {
          code: 'function x(){this.y = 1}; x()',
          errors: [
            {
              message: 'Mutating an unknown this value is a side-effect',
              type: 'ThisExpression'
            }
          ]
        }
      ]
    })
  )
})

describe(
  'ThrowStatement',
  testRule({
    invalid: [
      {
        code: 'throw new Error("Hello Error")',
        errors: [
          {
            message: 'Throwing an error is a side-effect',
            type: 'ThrowStatement'
          }
        ]
      }
    ]
  })
)

describe(
  'TryStatement',
  testRule({
    valid: [
      'try {} catch (error) {}',
      'try {} finally {}',
      'try {} catch (error) {} finally {}'
    ],
    invalid: [
      {
        code: 'try {ext()} catch (error) {}',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'try {} finally {ext()}',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })
)

describe(
  'UnaryExpression',
  testRule({
    valid: ['!ext', 'const x = {};delete x.y', 'const x = {};delete x["y"]'],
    invalid: [
      {
        code: '!ext()',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'delete ext.x',
        errors: [
          {
            message: 'Mutating a global variable is a side-effect',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'delete ext["x"]',
        errors: [
          {
            message: 'Mutating a global variable is a side-effect',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'const x = ()=>{};delete x()',
        errors: [
          {
            message:
              'Using delete on anything but a MemberExpression is a side-effect',
            type: 'CallExpression'
          }
        ]
      }
    ]
  })
)

describe(
  'UpdateExpression',
  testRule({
    valid: ['let x=1;x++', 'const x={};x.y++'],
    invalid: [
      {
        code: 'ext++',
        errors: [
          {
            message: 'Assignment to a global variable is a side-effect',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'const x={};x[ext()]++',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })
)

describe(
  'VariableDeclaration',
  testRule({
    valid: ['const x = 1'],
    invalid: [
      {
        code: 'const x = ext()',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })
)

describe(
  'VariableDeclarator',
  testRule({
    valid: [
      'var x, y',
      'var x = 1, y = 2',
      'const x = 1, y = 2',
      'let x = 1, y = 2',
      'const {x} = {}'
    ],
    invalid: [
      {
        code: 'var x = ext(),y = ext()',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          },
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'const x = ext(),y = ext()',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          },
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'let x = ext(),y = ext()',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          },
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'const {x = ext()} = {}',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })
)

describe(
  'WhileStatement',
  testRule({
    valid: [
      'while(true){}',
      'while(ext > 0){}',
      'const x = ()=>{}; while(true)x()'
    ],
    invalid: [
      {
        code: 'while(ext()){}',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'while(true)ext()',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'while(true){ext()}',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })
)

describe('YieldExpression', () => {
  testRule({
    valid: [
      'function* x(){const a = yield}; x()',
      'function* x(){yield ext}; x()'
    ],
    invalid: [
      {
        code: 'function* x(){yield ext()}; x()',
        errors: [
          {
            message: 'Could not determine side-effects of global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })()

  describe(
    'when called',
    testRule({
      valid: [],
      invalid: [
        {
          code: 'function* x(){yield ext()}; x()',
          errors: [
            {
              message: 'Could not determine side-effects of global function',
              type: 'Identifier'
            }
          ]
        }
      ]
    })
  )
})
