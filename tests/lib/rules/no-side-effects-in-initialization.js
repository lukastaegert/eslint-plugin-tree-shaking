/* eslint-env mocha */

/* Bugs in rollup:
 * * Reassigning or mutating a variable that has at some point a non-trivial value will be an effect
 *   even if it is never used
 * * Reassigning var with var is handled differently from reassigning without var
 * * Side-effects in function call arguments are ignored
 * * Side-effects in default parameter values are ignored
 * * Side-effects in destructuring default values are ignored
 * * Side-effects in computed properties in assignments and class bodies are ignored
 * * Assigning to a global variable by a ForInStatement/ForOfStatement is ignored
 * * Assigning values to members of MemberExpressions is ignored even though this could mutate a
 *   global variable
 * * Variable shadowing does not work properly in SwitchScopes
 * * Side-effects in TaggedTemplateLiterals are ignored
 * * Manually constructing an iterable will not trigger side-effects in the iterator function
 * * Calling an imported arrow function always seems to have side-effects
 */

/* Possible improvements for rollup:
 * * Consider impure functions as unknown assignments to their arguments
 * * Properly handle valid this values
 * * If a LogicalExpression does not need both arguments to determine its value, do not consider
 *   side-effects in the other argument
 * * SequenceExpressions return their last value
 * * "delete" is not necessarily a side-effect
 * * Properly clean up top-level BlockStatements
 * * Instantiating ES6 classes does not need to be a side-effect
 * * LabeledStatements do not necessarily have side-effects
 */

const rule = require('../../../lib/rules/no-side-effects-in-initialization')
const { Linter, RuleTester } = require('eslint')
const fs = require('fs')
const path = require('path')
const rollup = require('rollup')

const BUNDLER_TEST_PATH = path.join(__dirname, '../../../test-resources')
const BUNDLER_TEST_FILE = path.join(BUNDLER_TEST_PATH, 'test.js')
const BUNDLER_IMPORT_FILE = path.join(BUNDLER_TEST_PATH, 'main.js')
const RULE_NAME = 'no-side-effects-in-initialization'

const PARSER_OPTIONS = {
  ecmaVersion: 2017,
  sourceType: 'module'
}

RuleTester.setDefaultConfig({
  parserOptions: PARSER_OPTIONS
})
const ruleTester = new RuleTester()

const linter = new Linter()
linter.defineRule(RULE_NAME, rule)

const createRollupOutput = code => {
  fs.writeFileSync(BUNDLER_TEST_FILE, code)
  return rollup
    .rollup({ entry: BUNDLER_IMPORT_FILE })
    .then(bundle => bundle.generate({ format: 'es' }))
    .then(result => result.code.trim())
}

const getEsLintErrors = code =>
  linter.verify(code, {
    parserOptions: PARSER_OPTIONS,
    rules: { [RULE_NAME]: [1, { compatibility: 'rollup' }] }
  })

const getErrorFreeCodeKeptMessage = (
  code,
  rollupOutput
) => `${code} was not removed by rollup even though it contained no errors. Rollup output:
${rollupOutput}\n`

const getErroneousCodeRemovedMessage = (
  code,
  esLintErrors
) => `${code} was removed by rollup even though it contained errors:
${esLintErrors.map(error => `- ${error.message}`).join('\n')}\n`

const verifyCodeWithRollup = code => {
  it(`reflects rollup's result for: ${code}`, () => {
    const esLintErrors = getEsLintErrors(code)
    return createRollupOutput(code)
      .catch(error => `Rollup threw error: ${error.message}`)
      .then(output => {
        if (esLintErrors.length === 0 && output.length > 0) {
          throw new Error(getErrorFreeCodeKeptMessage(code, output))
        } else if (esLintErrors.length > 0 && output.length === 0) {
          console.warn(getErroneousCodeRemovedMessage(code, esLintErrors))
        }
      })
  })
}

const verifyCodeSnippetsWithRollup = codeSnippets =>
  codeSnippets.forEach(codeSnippet =>
    verifyCodeWithRollup(codeSnippet.code || codeSnippet)
  )

const testRule = ({ valid = [], invalid = [] }) => () => {
  ruleTester.run(RULE_NAME, rule, {
    valid,
    invalid
  })
  verifyCodeSnippetsWithRollup(valid)
  verifyCodeSnippetsWithRollup(invalid)
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
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: '[,,ext(),]',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
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
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'const [,x = ext(),] = []',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
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
              message:
                'Cannot determine side-effects of calling global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: '(({a = ext()})=>{})()',
          errors: [
            {
              message:
                'Cannot determine side-effects of calling global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: '(a=>{a()})(ext)',
          errors: [
            {
              message:
                'Cannot determine side-effects of calling function parameter',
              type: 'Identifier'
            }
          ]
        },
        {
          code: '((...a)=>{a()})(ext)',
          errors: [
            {
              message:
                'Cannot determine side-effects of calling function parameter',
              type: 'Identifier'
            }
          ]
        },
        {
          code: '(({a})=>{a()})(ext)',
          errors: [
            {
              message:
                'Cannot determine side-effects of calling function parameter',
              type: 'Identifier'
            }
          ]
        },
        {
          code: '(a=>{a.x = 1})(ext)',
          errors: [
            {
              message:
                'Cannot determine side-effects of mutating function parameter',
              type: 'Identifier'
            }
          ]
        },
        {
          code: '(a=>{const b = a;b.x = 1})(ext)',
          errors: [
            {
              message:
                'Cannot determine side-effects of mutating function parameter',
              type: 'Identifier'
            }
          ]
        },
        {
          code: '((...a)=>{a.x = 1})(ext)',
          errors: [
            {
              message:
                'Cannot determine side-effects of mutating function parameter',
              type: 'Identifier'
            }
          ]
        },
        {
          code: '(({a})=>{a.x = 1})(ext)',
          errors: [
            {
              message:
                'Cannot determine side-effects of mutating function parameter',
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
      'var x;x = {}',
      'var x;x += 1',
      'const x = {}; x.y = 1',
      'const x = {}; x["y"] = 1',
      'const x = {}, y = ()=>{}; x[y()] = 1',
      'function x(){this.y = 1}; const z = new x()',
      'let x = 1; x = 2 + 3',
      'let x; x = 2 + 3'
    ],
    invalid: [
      {
        code: 'ext = 1',
        errors: [
          {
            message:
              'Cannot determine side-effects of assignment to global variable',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'ext += 1',
        errors: [
          {
            message:
              'Cannot determine side-effects of assignment to global variable',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'ext.x = 1',
        errors: [
          {
            message:
              'Cannot determine side-effects of mutating global variable',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'const x = {};x[ext()] = 1',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'this.x = 1',
        errors: [
          {
            message:
              'Cannot determine side-effects of mutating unknown this value',
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
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'const {y: {x = ext()} = {}} = {}',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })
)

describe(
  'AwaitExpression',
  testRule({
    valid: [
      'const x = () => Promise.resolve(); const y = async ()=>{await x()}; y()'
    ],
    invalid: [
      {
        code: 'const x = async ()=>{await ext()}; x()',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
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
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'const x = ext() + 1',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
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
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'var x=()=>{};{var x=ext}x()',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'var x=ext;{x(); var x=()=>{}}',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
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
        code: '(()=>{})(ext(), 1)',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: '(()=>{})(1, ext())',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
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
              message:
                'Cannot determine side-effects of calling function return value',
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
                'Cannot determine side-effects of mutating function return value',
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
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'var x=()=>{}; try {} catch (error) {var x=ext}; x()',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
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
            message: 'Cannot determine side-effects of calling global function',
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
              message:
                'Cannot determine side-effects of calling global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'class x extends ext {}; new x()',
          errors: [
            {
              message:
                'Cannot determine side-effects of calling global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'class y {constructor(){ext()}}; class x extends y {}; new x()',
          errors: [
            {
              message:
                'Cannot determine side-effects of calling global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code:
            'class y {constructor(){ext()}}; class x extends y {constructor(){super()}}; new x()',
          errors: [
            {
              message:
                'Cannot determine side-effects of calling global function',
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
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'class x {[ext()](){}}',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
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
              message:
                'Cannot determine side-effects of calling global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'class x extends ext {}; new x()',
          errors: [
            {
              message:
                'Cannot determine side-effects of calling global function',
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
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: '(class {[ext()](){}})',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
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
              message:
                'Cannot determine side-effects of calling global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'new (class extends ext {})()',
          errors: [
            {
              message:
                'Cannot determine side-effects of calling global function',
              type: 'Identifier'
            }
          ]
        }
      ]
    })
  )
})

describe(
  'ClassProperty',
  testRule({
    valid: [
      {
        code: 'class x {y = 1}',
        parser: 'babel-eslint'
      }
    ],
    invalid: [
      {
        code: 'class x {[ext()] = 1}',
        parser: 'babel-eslint',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'class x {y = ext()}',
        parser: 'babel-eslint',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })
)

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
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'ext ? ext() : 2',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'ext ? 1 : ext()',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'if (false ? false : true) ext()',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
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
              message:
                'Cannot determine side-effects of calling global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'const x = ()=>{}; (false ? x : ext)()',
          errors: [
            {
              message:
                'Cannot determine side-effects of calling global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'const x = ()=>{}; (ext ? x : ext)()',
          errors: [
            {
              message:
                'Cannot determine side-effects of calling global function',
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
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'do ext(); while(true)',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'do {ext()} while(true)',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
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
      'export default ext',
      'const x = ext; export default x',
      'export default function(){}',
      'export default (function(){})',
      'const x = function(){}; export default /* tree-shaking no-side-effects-when-called */ x',
      'export default /* tree-shaking no-side-effects-when-called */ function(){}'
    ],
    invalid: [
      {
        code: 'export default ext()',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code:
          'export default /* tree-shaking no-side-effects-when-called */ ext',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code:
          'const x = ext; export default /* tree-shaking no-side-effects-when-called */ x',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
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
      'export const x = ext',
      'export function x(){ext()}',
      'const x = ext; export {x}',
      'export {x} from "./import"',
      'export {x as y} from "./import"',
      'export {x as default} from "./import"',
      'export const /* tree-shaking no-side-effects-when-called */ x = function(){}',
      'export function /* tree-shaking no-side-effects-when-called */ x(){}',
      'const x = function(){}; export {/* tree-shaking no-side-effects-when-called */ x}'
    ],
    invalid: [
      {
        code: 'export const x = ext()',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code:
          'export const /* tree-shaking no-side-effects-when-called */ x = ext',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code:
          'export function /* tree-shaking no-side-effects-when-called */ x(){ext()}',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code:
          'const x = ext; export {/* tree-shaking no-side-effects-when-called */ x}',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
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
            message: 'Cannot determine side-effects of calling global function',
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
            message:
              'Cannot determine side-effects of assignment to global variable',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'for(const x in ext()){}',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'for(const x in {a: 1}){ext()}',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'for(const x in {a: 1}) ext()',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
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
    valid: ['for(const x of ext){}', 'let x; for(x of ext){}'],
    invalid: [
      {
        code: 'for(ext of {a: 1}){}',
        errors: [
          {
            message:
              'Cannot determine side-effects of assignment to global variable',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'for(const x of ext()){}',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'for(const x of {a: 1}){ext()}',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'for(const x of {a: 1}) ext()',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
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
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'for(;ext();){}',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'for(;true;ext()){}',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'for(;true;) ext()',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'for(;true;){ext()}',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
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
              message:
                'Cannot determine side-effects of calling global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'function x(){ext()}; new x()',
          errors: [
            {
              message:
                'Cannot determine side-effects of calling global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'function x(a = ext()){}; x()',
          errors: [
            {
              message:
                'Cannot determine side-effects of calling global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'function x(a){a()}; x(ext)',
          errors: [
            {
              message:
                'Cannot determine side-effects of calling function parameter',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'function x(...a){a()}; x(ext)',
          errors: [
            {
              message:
                'Cannot determine side-effects of calling function parameter',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'function x({a}){a()}; x(ext)',
          errors: [
            {
              message:
                'Cannot determine side-effects of calling function parameter',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'function x(a){a(); a(); a()}; x(ext)',
          errors: [
            {
              message:
                'Cannot determine side-effects of calling function parameter',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'function x(a){a.y = 1}; x(ext)',
          errors: [
            {
              message:
                'Cannot determine side-effects of mutating function parameter',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'function x(...a){a.y = 1}; x(ext)',
          errors: [
            {
              message:
                'Cannot determine side-effects of mutating function parameter',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'function x({a}){a.y = 1}; x(ext)',
          errors: [
            {
              message:
                'Cannot determine side-effects of mutating function parameter',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'function x(a){a.y = 1; a.y = 2; a.y = 3}; x(ext)',
          errors: [
            {
              message:
                'Cannot determine side-effects of mutating function parameter',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'function x(){ext = 1}; x(); x(); x()',
          errors: [
            {
              message:
                'Cannot determine side-effects of assignment to global variable',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'function x(){ext = 1}; new x(); new x(); new x()',
          errors: [
            {
              message:
                'Cannot determine side-effects of assignment to global variable',
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
              message:
                'Cannot determine side-effects of calling global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'new (function (){ext()})()',
          errors: [
            {
              message:
                'Cannot determine side-effects of calling global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: '(function ({a = ext()}){}())',
          errors: [
            {
              message:
                'Cannot determine side-effects of calling global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: '(function (a){a()}(ext))',
          errors: [
            {
              message:
                'Cannot determine side-effects of calling function parameter',
              type: 'Identifier'
            }
          ]
        },
        {
          code: '(function (...a){a()}(ext))',
          errors: [
            {
              message:
                'Cannot determine side-effects of calling function parameter',
              type: 'Identifier'
            }
          ]
        },
        {
          code: '(function ({a}){a()}(ext))',
          errors: [
            {
              message:
                'Cannot determine side-effects of calling function parameter',
              type: 'Identifier'
            }
          ]
        },
        {
          code: '(function (a){a.x = 1}(ext))',
          errors: [
            {
              message:
                'Cannot determine side-effects of mutating function parameter',
              type: 'Identifier'
            }
          ]
        },
        {
          code: '(function (a){const b = a;b.x = 1}(ext))',
          errors: [
            {
              message:
                'Cannot determine side-effects of mutating function parameter',
              type: 'Identifier'
            }
          ]
        },
        {
          code: '(function (...a){a.x = 1}(ext))',
          errors: [
            {
              message:
                'Cannot determine side-effects of mutating function parameter',
              type: 'Identifier'
            }
          ]
        },
        {
          code: '(function ({a}){a.x = 1}(ext))',
          errors: [
            {
              message:
                'Cannot determine side-effects of mutating function parameter',
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
              message:
                'Cannot determine side-effects of calling global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'const x = ext; x()',
          errors: [
            {
              message:
                'Cannot determine side-effects of calling global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'let x = ()=>{}; x = ext; x()',
          errors: [
            {
              message:
                'Cannot determine side-effects of calling global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'var x = ()=>{}; var x = ext; x()',
          errors: [
            {
              message:
                'Cannot determine side-effects of calling global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'const x = ()=>{ext()}; x()',
          errors: [
            {
              message:
                'Cannot determine side-effects of calling global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'const x = ()=>{ext = 1}; x(); x(); x()',
          errors: [
            {
              message:
                'Cannot determine side-effects of assignment to global variable',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'let x = ()=>{}; const y = ()=>{x()}; x = ext; y()',
          errors: [
            {
              message:
                'Cannot determine side-effects of calling global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'var x = ()=>{}; const y = ()=>{x()}; var x = ext; y()',
          errors: [
            {
              message:
                'Cannot determine side-effects of calling global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'const x = ()=>{}; const {y} = x(); y()',
          errors: [
            {
              message:
                'Cannot determine side-effects of calling destructured variable',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'const x = ()=>{}; const [y] = x(); y()',
          errors: [
            {
              message:
                'Cannot determine side-effects of calling destructured variable',
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
              message:
                'Cannot determine side-effects of mutating global variable',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'var x = {}; x = ext; x.y = 1',
          errors: [
            {
              message:
                'Cannot determine side-effects of mutating global variable',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'var x = {}; var x = ext; x.y = 1',
          errors: [
            {
              message:
                'Cannot determine side-effects of mutating global variable',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'var x = {}; x = ext; x.y = 1; x.y = 1; x.y = 1',
          errors: [
            {
              message:
                'Cannot determine side-effects of mutating global variable',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'const x = {y:ext}; const {y} = x; y.z = 1',
          errors: [
            {
              message:
                'Cannot determine side-effects of mutating destructured variable',
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
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'if (1>0){ext()}',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'if (1<0){} else {ext()}',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'if (ext>0){ext()} else {ext()}',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          },
          {
            message: 'Cannot determine side-effects of calling global function',
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
      'import "./import"',
      'import x from "./import-default"',
      'import {x} from "./import"',
      'import {x as y} from "./import"',
      'import * as x from "./import"',
      'import /* tree-shaking no-side-effects-when-called */ x from "./import-default-no-effects"; x()',
      'import /* test */ /*tree-shaking  no-side-effects-when-called */ x from "./import-default-no-effects"; x()',
      'import /* tree-shaking  no-side-effects-when-called*/ /* test */ x from "./import-default-no-effects"; x()',
      'import {/* tree-shaking  no-side-effects-when-called */ x} from "./import-no-effects"; x()',
      'import {x as /* tree-shaking  no-side-effects-when-called */ y} from "./import-no-effects"; y()'
    ],
    invalid: [
      {
        code: 'import x from "./import-default"; x()',
        errors: [
          {
            message:
              'Cannot determine side-effects of calling imported function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'import x from "./import-default"; x.z = 1',
        errors: [
          {
            message:
              'Cannot determine side-effects of mutating imported variable',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'import {x} from "./import"; x()',
        errors: [
          {
            message:
              'Cannot determine side-effects of calling imported function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'import {x} from "./import"; x.z = 1',
        errors: [
          {
            message:
              'Cannot determine side-effects of mutating imported variable',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'import {x as y} from "./import"; y()',
        errors: [
          {
            message:
              'Cannot determine side-effects of calling imported function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'import {x as y} from "./import"; y.a = 1',
        errors: [
          {
            message:
              'Cannot determine side-effects of mutating imported variable',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'import * as y from "./import"; y.x()',
        errors: [
          {
            message: 'Cannot determine side-effects of calling member function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'import * as y from "./import"; y.x = 1',
        errors: [
          {
            message:
              'Cannot determine side-effects of mutating imported variable',
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
            message: 'Cannot determine side-effects of calling global function',
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
            message: 'Cannot determine side-effects of calling global function',
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
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'true && ext()',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'false || ext()',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'if (true && true) ext()',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'if (false || true) ext()',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'if (true || false) ext()',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'if (true || true) ext()',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      }
    ]
  })
)

describe('MemberExpression', () => {
  testRule({
    valid: ['const x = ext.y', 'const x = ext["y"]', 'let x = ()=>{}; x.y = 1'],
    invalid: [
      {
        code: 'const x = {};const y = x[ext()]',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
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
              message:
                'Cannot determine side-effects of calling member function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'const x = {}; x.y()',
          errors: [
            {
              message:
                'Cannot determine side-effects of calling member function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'const x = ()=>{}; x().y()',
          errors: [
            {
              message:
                'Cannot determine side-effects of calling member function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'const Object = {}; const x = Object.keys({})',
          errors: [
            {
              message:
                'Cannot determine side-effects of calling member function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'const x = {}; x[ext()]()',
          errors: [
            {
              message:
                'Cannot determine side-effects of calling global function',
              type: 'Identifier'
            },
            {
              message:
                'Cannot determine side-effects of calling member function',
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
          code: 'const x = {y: ext};x.y.z = 1',
          errors: [
            {
              message: 'Cannot determine side-effects of mutating member',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'const x = {y:ext};const y = x.y; y.z = 1',
          errors: [
            {
              message: 'Cannot determine side-effects of mutating member',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'const x = {y: ext};delete x.y.z',
          errors: [
            {
              message: 'Cannot determine side-effects of mutating member',
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
            message: 'Cannot determine side-effects of calling global function',
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
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
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
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'const x = {["y"]: ext()}',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'const x = {[ext()]: 1}',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
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
            message: 'Cannot determine side-effects of calling global function',
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
            message: 'Cannot determine side-effects of calling global function',
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
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: '1, ext()',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'if (1, true) ext()',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'if (1, ext) ext()',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
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
              message:
                'Cannot determine side-effects of calling global function',
              type: 'Identifier'
            }
          ]
        },
        {
          code: 'class x {constructor(){super()}}; new x()',
          errors: [
            {
              message:
                'Cannot determine side-effects of calling super class constructor',
              type: 'Super'
            }
          ]
        },
        {
          code:
            'class y{}; class x extends y{constructor(){super(); super.test()}}; new x()',
          errors: [
            {
              message:
                'Cannot determine side-effects of calling member function',
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
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'switch(ext){case 1:ext()}',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
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
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'var x=()=>{}; switch(ext){case 1:var x=ext}; x()',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
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
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        // eslint-disable-next-line no-template-curly-in-string
        code: 'const x = ()=>{}; x`${ext()}`',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
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
            message: 'Cannot determine side-effects of calling global function',
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
              message:
                'Cannot determine side-effects of mutating unknown this value',
              type: 'ThisExpression'
            }
          ]
        },
        {
          code: '(()=>{this.x = 1})()',
          errors: [
            {
              message:
                'Cannot determine side-effects of mutating unknown this value',
              type: 'ThisExpression'
            }
          ]
        },
        {
          code: '(function(){this.x = 1}())',
          errors: [
            {
              message:
                'Cannot determine side-effects of mutating unknown this value',
              type: 'ThisExpression'
            }
          ]
        },
        {
          code: 'new (function (){(function(){this.x = 1}())})()',
          errors: [
            {
              message:
                'Cannot determine side-effects of mutating unknown this value',
              type: 'ThisExpression'
            }
          ]
        },
        {
          code: 'function x(){this.y = 1}; x()',
          errors: [
            {
              message:
                'Cannot determine side-effects of mutating unknown this value',
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
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'try {} finally {ext()}',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
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
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'delete ext.x',
        errors: [
          {
            message:
              'Cannot determine side-effects of mutating global variable',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'delete ext["x"]',
        errors: [
          {
            message:
              'Cannot determine side-effects of mutating global variable',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'const x = ()=>{};delete x()',
        errors: [
          {
            message:
              'Cannot determine side-effects of deleting anything but a MemberExpression',
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
            message:
              'Cannot determine side-effects of assignment to global variable',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'const x={};x[ext()]++',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
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
            message: 'Cannot determine side-effects of calling global function',
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
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          },
          {
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'const x = ext(),y = ext()',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          },
          {
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'let x = ext(),y = ext()',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          },
          {
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'const {x = ext()} = {}',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
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
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'while(true)ext()',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
            type: 'Identifier'
          }
        ]
      },
      {
        code: 'while(true){ext()}',
        errors: [
          {
            message: 'Cannot determine side-effects of calling global function',
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
            message: 'Cannot determine side-effects of calling global function',
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
              message:
                'Cannot determine side-effects of calling global function',
              type: 'Identifier'
            }
          ]
        }
      ]
    })
  )
})
