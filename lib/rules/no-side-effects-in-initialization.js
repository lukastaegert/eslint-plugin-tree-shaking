// cf.   https://astexplorer.net
//       https://github.com/estree/estree
//       http://mazurov.github.io/escope-demo
//       https://npmdoc.github.io/node-npmdoc-escope/build/apidoc.html

const {
  getChildScopeForNodeIfExists,
  getLocalVariable,
  getRootNode,
  isPureFunction
} = require('../utils/helpers')
const Value = require('../utils/value')

const reportSideEffectsInProgram = (context, programNode) => {
  const checkedCalledNodes = new WeakSet()
  const checkedNodesCalledWithNew = new WeakSet()
  const checkedMutatedNodes = new WeakSet()

  const DEFINITIONS = {
    ClassName: {
      reportEffectsWhenCalled (definition, scope, options) {
        reportSideEffectsWhenCalled(definition.node, scope, options)
      }
    },
    FunctionName: {
      reportEffectsWhenCalled (definition, scope, options) {
        reportSideEffectsWhenCalled(definition.node, scope, options)
      }
    },
    ImportBinding: {
      reportEffectsWhenCalled (definition, scope, options) {
        if (checkedCalledNodes.has(definition.name)) {
          return
        }
        checkedCalledNodes.add(definition.name)
        context.report(definition.name, 'Calling an import is a side-effect')
      },
      reportEffectsWhenMutated (definition) {
        if (checkedMutatedNodes.has(definition.name)) {
          return
        }
        checkedMutatedNodes.add(definition.name)
        context.report(definition.name, 'Mutating an import is a side-effect')
      }
    },
    Parameter: {
      reportEffectsWhenCalled (definition) {
        if (checkedCalledNodes.has(definition.name)) {
          return
        }
        checkedCalledNodes.add(definition.name)
        context.report(
          definition.name,
          'Calling a function parameter is a side-effect'
        )
      },
      reportEffectsWhenMutated (definition) {
        if (checkedMutatedNodes.has(definition.name)) {
          return
        }
        checkedMutatedNodes.add(definition.name)
        context.report(
          definition.name,
          'Mutating a function parameter is a side-effect'
        )
      }
    },
    Variable: {
      // side effects are already handled by checking write expressions in references
    }
  }

  const BINARY_OPERATORS = {
    // eslint-disable-next-line eqeqeq
    '==': (left, right) => left == right,
    // eslint-disable-next-line eqeqeq
    '!=': (left, right) => left != right,
    '===': (left, right) => left === right,
    '!==': (left, right) => left !== right,
    '<': (left, right) => left < right,
    '<=': (left, right) => left <= right,
    '>': (left, right) => left > right,
    '>=': (left, right) => left >= right,
    '<<': (left, right) => left << right,
    '>>': (left, right) => left >> right,
    '>>>': (left, right) => left >>> right,
    '+': (left, right) => left + right,
    '-': (left, right) => left - right,
    '*': (left, right) => left * right,
    '/': (left, right) => left / right,
    '%': (left, right) => left % right,
    '|': (left, right) => left | right,
    '^': (left, right) => left ^ right,
    '&': (left, right) => left & right,
    '**': (left, right) => Math.pow(left, right),
    in: (left, right) => left in right,
    instanceof: (left, right) => left instanceof right
  }

  const LOGICAL_OPERATORS = {
    '&&': (getAndReportLeft, getAndReportRight) => {
      const leftValue = getAndReportLeft()
      if (!leftValue.hasValue) {
        getAndReportRight()
        return leftValue
      }
      if (!leftValue.value) {
        return leftValue
      }
      return getAndReportRight()
    },
    '||': (getAndReportLeft, getAndReportRight) => {
      const leftValue = getAndReportLeft()
      if (!leftValue.hasValue) {
        getAndReportRight()
        return leftValue
      }
      if (leftValue.value) {
        return leftValue
      }
      return getAndReportRight()
    }
  }

  const UNARY_OPERATORS = {
    '-': value => Value.of(-value),
    '+': value => Value.of(+value),
    '!': value => Value.of(!value),
    '~': value => Value.of(~value),
    typeof: value => Value.of(typeof value),
    void: () => Value.of(undefined),
    delete: () => Value.unknown()
  }

  const NODES = {
    ArrayPattern: {
      reportEffects (node, scope, options) {
        node.elements.forEach(
          subNode => subNode && reportSideEffects(subNode, scope, options)
        )
      }
    },

    ArrayExpression: {
      reportEffects (node, scope, options) {
        node.elements.forEach(
          subNode => subNode && reportSideEffects(subNode, scope, options)
        )
      }
    },

    ArrowFunctionExpression: {
      reportEffectsWhenCalled (node, scope, options) {
        node.params.forEach(subNode =>
          reportSideEffects(subNode, scope, options)
        )
        if (options.calledWithNew) {
          context.report(
            node,
            'Calling an arrow function with "new" is a side-effect'
          )
        } else {
          const functionScope = getChildScopeForNodeIfExists(node, scope)
          if (!functionScope) {
            reportFatalError(
              node,
              'Could not find child scope for ArrowFunctionExpression.'
            )
          } else {
            reportSideEffects(node.body, functionScope, options)
          }
        }
      }
    },

    AssignmentExpression: {
      reportEffects (node, scope, options) {
        reportSideEffectsWhenAssigned(node.left, scope, options)
        reportSideEffects(node.right, scope, options)
      }
    },

    AssignmentPattern: {
      reportEffects (node, scope, options) {
        reportSideEffects(node.left, scope, options)
        reportSideEffects(node.right, scope, options)
      }
    },

    BinaryExpression: {
      getValueAndReportEffects (node, scope, options) {
        const left = getValueAndReportSideEffects(node.left, scope, options)
        const right = getValueAndReportSideEffects(node.right, scope, options)

        if (left.hasValue && right.hasValue) {
          return Value.of(
            BINARY_OPERATORS[node.operator](left.value, right.value)
          )
        }
        return Value.unknown()
      }
    },

    BlockStatement: {
      reportEffects (node, scope, options) {
        const blockScope = getChildScopeForNodeIfExists(node, scope) || scope
        node.body.forEach(subNode =>
          reportSideEffects(subNode, blockScope, options)
        )
      }
    },

    BreakStatement: {},

    CallExpression: {
      reportEffects (node, scope, options) {
        node.arguments.forEach(subNode =>
          reportSideEffects(subNode, scope, options)
        )
        reportSideEffectsWhenCalled(
          node.callee,
          scope,
          Object.assign({}, options, { calledWithNew: false })
        )
      },
      reportEffectsWhenCalled (node, scope, options) {
        context.report(
          node,
          'Calling the result of a function call is a side-effect'
        )
      },
      reportEffectsWhenMutated (node, scope, options) {
        context.report(
          node,
          'Mutating the result of a function call is a side-effect'
        )
      }
    },

    CatchClause: {
      reportEffects (node, scope, options) {
        const catchScope = getChildScopeForNodeIfExists(node, scope)
        if (!catchScope) {
          reportFatalError(node, 'Could not find child scope for CatchClause.')
        } else {
          reportSideEffects(node.body, catchScope, options)
        }
      }
    },

    ClassBody: {
      reportEffects (node, scope, options) {
        node.body.forEach(subNode => reportSideEffects(subNode, scope, options))
      },
      reportEffectsWhenCalled (node, scope, options) {
        const classConstructor = node.body.find(
          subNode => subNode.kind === 'constructor'
        )
        if (classConstructor) {
          reportSideEffectsWhenCalled(classConstructor, scope, options)
        } else if (options.superClass) {
          reportSideEffectsWhenCalled(options.superClass, scope, options)
        }
      }
    },

    ClassDeclaration: {
      reportEffects (node, scope, options) {
        node.superClass && reportSideEffects(node.superClass, scope, options)
        reportSideEffects(node.body, scope, options)
      },
      reportEffectsWhenCalled (node, scope, options) {
        const classScope = getChildScopeForNodeIfExists(node, scope)
        if (!classScope) {
          reportFatalError(
            node,
            'Could not find child scope for ClassDeclaration.'
          )
        } else {
          reportSideEffectsWhenCalled(
            node.body,
            classScope,
            Object.assign({}, options, { superClass: node.superClass })
          )
        }
      }
    },

    ClassExpression: {
      reportEffects (node, scope, options) {
        node.superClass && reportSideEffects(node.superClass, scope, options)
        reportSideEffects(node.body, scope, options)
      },
      reportEffectsWhenCalled (node, scope, options) {
        const classScope = getChildScopeForNodeIfExists(node, scope)
        if (!classScope) {
          reportFatalError(
            node,
            'Could not find child scope for ClassExpression.'
          )
        } else {
          reportSideEffectsWhenCalled(
            node.body,
            classScope,
            Object.assign({}, options, { superClass: node.superClass })
          )
        }
      }
    },

    ConditionalExpression: {
      getValueAndReportEffects (node, scope, options) {
        const testResult = getValueAndReportSideEffects(
          node.test,
          scope,
          options
        )
        if (testResult.hasValue) {
          return testResult.value
            ? getValueAndReportSideEffects(node.consequent, scope, options)
            : getValueAndReportSideEffects(node.alternate, scope, options)
        } else {
          reportSideEffects(node.consequent, scope, options)
          reportSideEffects(node.alternate, scope, options)
          return testResult
        }
      },
      reportEffectsWhenCalled (node, scope, options) {
        const testResult = getValueAndReportSideEffects(
          node.test,
          scope,
          options
        )
        if (testResult.hasValue) {
          return testResult.value
            ? reportSideEffectsWhenCalled(node.consequent, scope, options)
            : reportSideEffectsWhenCalled(node.alternate, scope, options)
        } else {
          reportSideEffectsWhenCalled(node.consequent, scope, options)
          reportSideEffectsWhenCalled(node.alternate, scope, options)
        }
      }
    },

    ContinueStatement: {},

    DebuggerStatement: {
      reportEffects (node) {
        context.report(node, 'Debugger statements are side-effects')
      }
    },

    DoWhileStatement: {
      reportEffects (node, scope, options) {
        reportSideEffects(node.test, scope, options)
        reportSideEffects(node.body, scope, options)
      }
    },

    EmptyStatement: {},

    ExportAllDeclaration: {},

    ExportDefaultDeclaration: {
      reportEffects (node, scope, options) {
        reportSideEffects(node.declaration, scope, options)
      }
    },

    ExportNamedDeclaration: {
      reportEffects (node, scope, options) {
        node.declaration && reportSideEffects(node.declaration, scope, options)
      }
    },

    ExpressionStatement: {
      reportEffects (node, scope, options) {
        reportSideEffects(node.expression, scope, options)
      }
    },

    ForInStatement: {
      reportEffects (node, scope, options) {
        const forScope = getChildScopeForNodeIfExists(node, scope) || scope
        if (node.left.type !== 'VariableDeclaration') {
          reportSideEffectsWhenAssigned(node.left, forScope, options)
        }
        reportSideEffects(node.right, forScope, options)
        reportSideEffects(node.body, forScope, options)
      }
    },

    ForOfStatement: {
      reportEffects (node, scope, options) {
        const forScope = getChildScopeForNodeIfExists(node, scope) || scope
        if (node.left.type !== 'VariableDeclaration') {
          reportSideEffectsWhenAssigned(node.left, forScope, options)
        }
        reportSideEffects(node.right, forScope, options)
        reportSideEffects(node.body, forScope, options)
      }
    },

    ForStatement: {
      reportEffects (node, scope, options) {
        const forScope = getChildScopeForNodeIfExists(node, scope) || scope
        node.init && reportSideEffects(node.init, forScope, options)
        node.test && reportSideEffects(node.test, forScope, options)
        node.update && reportSideEffects(node.update, forScope, options)
        reportSideEffects(node.body, forScope, options)
      }
    },

    FunctionDeclaration: {
      reportEffectsWhenCalled (node, scope, options) {
        node.params.forEach(subNode =>
          reportSideEffects(subNode, scope, options)
        )
        const functionScope = getChildScopeForNodeIfExists(node, scope)
        if (!functionScope) {
          reportFatalError(
            node,
            'Could not find child scope for FunctionDeclaration.'
          )
        } else {
          reportSideEffects(
            node.body,
            functionScope,
            Object.assign({}, options, { hasValidThis: options.calledWithNew })
          )
        }
      }
    },

    FunctionExpression: {
      reportEffectsWhenCalled (node, scope, options) {
        node.params.forEach(subNode =>
          reportSideEffects(subNode, scope, options)
        )
        const functionScope = getChildScopeForNodeIfExists(node, scope)
        if (!functionScope) {
          reportFatalError(
            node,
            'Could not find child scope for FunctionExpression.'
          )
        } else {
          reportSideEffects(
            node.body,
            functionScope,
            Object.assign({}, options, { hasValidThis: options.calledWithNew })
          )
        }
      }
    },

    Identifier: {
      reportEffectsWhenAssigned (node, scope) {
        if (!getLocalVariable(node.name, scope)) {
          context.report(
            node,
            'Assignment to a global variable is a side-effect'
          )
        }
      },
      reportEffectsWhenCalled (node, scope, options) {
        const variableInScope = getLocalVariable(node.name, scope)
        if (variableInScope) {
          variableInScope.references.forEach(
            ({ from, identifier, partial, writeExpr }) => {
              if (partial) {
                context.report(
                  identifier,
                  'Could not determine side-effects of calling result of destructuring assignment'
                )
              } else {
                writeExpr &&
                  reportSideEffectsWhenCalled(writeExpr, from, options)
              }
            }
          )
          variableInScope.defs.forEach(
            reportSideEffectsInDefinitionWhenCalled(
              variableInScope.scope,
              options
            )
          )
        } else if (!isPureFunction(node)) {
          context.report(
            node,
            'Could not determine side-effects of global function'
          )
        }
      },
      reportEffectsWhenMutated (node, scope, options) {
        const localVariable = getLocalVariable(node.name, scope)
        if (localVariable) {
          localVariable.references.forEach(
            ({ from, identifier, partial, writeExpr }) => {
              if (partial) {
                context.report(
                  identifier,
                  'Mutating the result of a destructuring assignment is a side-effect'
                )
              } else {
                writeExpr &&
                  reportSideEffectsWhenMutated(writeExpr, from, options)
              }
            }
          )
          localVariable.defs.forEach(
            reportSideEffectsInDefinitionWhenMutated(
              localVariable.scope,
              options
            )
          )
        } else {
          context.report(node, 'Mutating a global variable is a side-effect')
        }
      }
    },

    IfStatement: {
      reportEffects (node, scope, options) {
        const testResult = getValueAndReportSideEffects(
          node.test,
          scope,
          options
        )
        if (testResult.hasValue) {
          testResult.value
            ? reportSideEffects(node.consequent, scope, options)
            : node.alternate &&
              reportSideEffects(node.alternate, scope, options)
        } else {
          reportSideEffects(node.consequent, scope, options)
          node.alternate && reportSideEffects(node.alternate, scope, options)
        }
      }
    },

    ImportDeclaration: {
      reportEffects (node, scope, options) {}
    },

    LabeledStatement: {
      reportEffects (node, scope, options) {
        reportSideEffects(node.body, scope, options)
      }
    },

    Literal: {
      getValueAndReportEffects (node) {
        return Value.of(node.value)
      }
    },

    LogicalExpression: {
      getValueAndReportEffects (node, scope, options) {
        return LOGICAL_OPERATORS[node.operator](
          () => getValueAndReportSideEffects(node.left, scope, options),
          () => getValueAndReportSideEffects(node.right, scope, options)
        )
      }
    },

    MemberExpression: {
      reportEffects (node, scope, options) {
        node.computed && reportSideEffects(node.property, scope, options)
        reportSideEffects(node.object, scope, options)
      },
      reportEffectsWhenAssigned (node, scope, options) {
        reportSideEffects(node, scope, options)
        reportSideEffectsWhenMutated(node.object, scope, options)
      },
      reportEffectsWhenMutated (node) {
        context.report(
          node.property,
          'Mutating members of an object is a side-effect'
        )
      },
      reportEffectsWhenCalled (node, scope, options) {
        reportSideEffects(node, scope, options)
        const rootNode = getRootNode(node)
        if (
          rootNode.type !== 'Identifier' ||
          getLocalVariable(rootNode.name, scope) ||
          !isPureFunction(node)
        ) {
          context.report(
            node.property,
            'Could not determine side-effects of member function'
          )
        }
      }
    },

    MethodDefinition: {
      reportEffects (node, scope, options) {
        reportSideEffects(node.key, scope, options)
      },
      reportEffectsWhenCalled (node, scope, options) {
        reportSideEffectsWhenCalled(node.value, scope, options)
      }
    },

    NewExpression: {
      reportEffects (node, scope, options) {
        node.arguments.forEach(subNode =>
          reportSideEffects(subNode, scope, options)
        )
        reportSideEffectsWhenCalled(
          node.callee,
          scope,
          Object.assign({}, options, { calledWithNew: true })
        )
      }
    },

    ObjectExpression: {
      reportEffects (node, scope, options) {
        node.properties.forEach(subNode => {
          reportSideEffects(subNode.key, scope, options)
          reportSideEffects(subNode.value, scope, options)
        })
      }
    },

    ObjectPattern: {
      reportEffects (node, scope, options) {
        node.properties.forEach(subNode => {
          reportSideEffects(subNode.key, scope, options)
          reportSideEffects(subNode.value, scope, options)
        })
      }
    },

    RestElement: {},

    ReturnStatement: {
      reportEffects (node, scope, options) {
        node.argument && reportSideEffects(node.argument, scope, options)
      }
    },

    SequenceExpression: {
      getValueAndReportEffects (node, scope, options) {
        return node.expressions.reduce(
          (result, expression) =>
            getValueAndReportSideEffects(expression, scope, options),
          Value.unknown()
        )
      }
    },

    Super: {
      reportEffectsWhenCalled (node, scope, options) {
        if (options.superClass) {
          reportSideEffectsWhenCalled(options.superClass, scope, options)
        } else {
          context.report(
            node,
            'Could not determine side effects of super class constructor'
          )
        }
      }
    },

    SwitchCase: {
      reportEffects (node, scope, options) {
        node.test && reportSideEffects(node.test, scope, options)
        node.consequent.forEach(subNode =>
          reportSideEffects(subNode, scope, options)
        )
      }
    },

    SwitchStatement: {
      reportEffects (node, scope, options) {
        reportSideEffects(node.discriminant, scope, options)
        const switchScope = getChildScopeForNodeIfExists(node, scope)
        if (!switchScope) {
          reportFatalError(
            node,
            'Could not find child scope for SwitchStatement.'
          )
        } else {
          node.cases.forEach(subNode =>
            reportSideEffects(subNode, switchScope, options)
          )
        }
      }
    },

    ThisExpression: {
      reportEffectsWhenMutated (node, scope, options) {
        if (!options.hasValidThis) {
          context.report(
            node,
            'Mutating an unknown this value is a side-effect'
          )
        }
      }
    },

    ThrowStatement: {
      reportEffects (node) {
        context.report(node, 'Throwing an error is a side-effect')
      }
    },

    TryStatement: {
      reportEffects (node, scope, options) {
        reportSideEffects(node.block, scope, options)
        node.handler && reportSideEffects(node.handler, scope, options)
        node.finalizer && reportSideEffects(node.finalizer, scope, options)
      }
    },

    UnaryExpression: {
      getValueAndReportEffects (node, scope, options) {
        if (node.operator === 'delete') {
          if (node.argument.type !== 'MemberExpression') {
            context.report(
              node.argument,
              'Using delete on anything but a MemberExpression is a side-effect'
            )
          } else {
            reportSideEffectsWhenMutated(node.argument.object, scope, options)
          }
        }
        return getValueAndReportSideEffects(
          node.argument,
          scope,
          options
        ).chain(UNARY_OPERATORS[node.operator])
      }
    },

    UpdateExpression: {
      reportEffects (node, scope, options) {
        // Increment/decrement work like "assign updated value", not like a mutation
        // cf. y={};x={y};x.y++ => x.y={y:NaN}, y={}
        reportSideEffectsWhenAssigned(node.argument, scope, options)
      }
    },

    VariableDeclaration: {
      reportEffects (node, scope, options) {
        node.declarations &&
          node.declarations.forEach(declarator =>
            reportSideEffects(declarator, scope, options)
          )
      }
    },

    VariableDeclarator: {
      reportEffects (node, scope, options) {
        reportSideEffects(node.id, scope, options)
        node.init && reportSideEffects(node.init, scope, options)
      }
    },

    WhileStatement: {
      reportEffects (node, scope, options) {
        reportSideEffects(node.test, scope, options)
        reportSideEffects(node.body, scope, options)
      }
    }
  }

  const verifyNodeTypeIsKnown = node => {
    if (!NODES[node.type]) {
      reportFatalError(node, `Unknown node type ${node.type}.`)
      return false
    }
    return true
  }

  function reportSideEffects (node, scope, options) {
    if (!verifyNodeTypeIsKnown(node)) {
      return
    }
    if (NODES[node.type].reportEffects) {
      NODES[node.type].reportEffects(node, scope, options)
    } else if (NODES[node.type].getValueAndReportEffects) {
      NODES[node.type].getValueAndReportEffects(node, scope, options)
    }
  }

  function reportSideEffectsWhenAssigned (node, scope, options) {
    if (!verifyNodeTypeIsKnown(node)) {
      return
    }
    if (NODES[node.type].reportEffectsWhenAssigned) {
      NODES[node.type].reportEffectsWhenAssigned(node, scope, options)
    } else {
      reportFatalError(node, `Unexpected assignment target ${node.type}.`)
    }
  }

  function reportSideEffectsWhenMutated (node, scope, options) {
    if (!verifyNodeTypeIsKnown(node) || checkedMutatedNodes.has(node)) {
      return
    }
    checkedMutatedNodes.add(node)
    if (NODES[node.type].reportEffectsWhenMutated) {
      NODES[node.type].reportEffectsWhenMutated(node, scope, options)
    }
  }

  function reportSideEffectsWhenCalled (node, scope, options) {
    if (
      !verifyNodeTypeIsKnown(node) ||
      checkedCalledNodes.has(node) ||
      (options.calledWithNew && checkedNodesCalledWithNew.has(node))
    ) {
      return
    }
    if (options.calledWithNew) {
      checkedNodesCalledWithNew.add(node)
    } else {
      checkedCalledNodes.add(node)
    }
    if (NODES[node.type].reportEffectsWhenCalled) {
      NODES[node.type].reportEffectsWhenCalled(node, scope, options)
    } else {
      context.report(
        node,
        `Expression with unknown side-effects might be called as a function`
      )
    }
  }

  function getValueAndReportSideEffects (node, scope, options) {
    if (!verifyNodeTypeIsKnown(node)) {
      return
    }
    if (NODES[node.type].getValueAndReportEffects) {
      return NODES[node.type].getValueAndReportEffects(node, scope, options)
    }
    reportSideEffects(node, scope, options)
    return Value.unknown()
  }

  const verifyDefinitionTypeIsKnown = definition => {
    if (!DEFINITIONS[definition.type]) {
      reportFatalError(
        definition.name,
        `Unexpected definition type ${definition.type}.`
      )
      return false
    }
    return true
  }

  function reportSideEffectsInDefinitionWhenCalled (scope, options) {
    return definition => {
      if (!verifyDefinitionTypeIsKnown(definition)) {
        return
      }
      if (DEFINITIONS[definition.type].reportEffectsWhenCalled) {
        DEFINITIONS[definition.type].reportEffectsWhenCalled(
          definition,
          scope,
          options
        )
      }
    }
  }

  function reportSideEffectsInDefinitionWhenMutated (scope, options) {
    return definition => {
      if (!verifyDefinitionTypeIsKnown(definition)) {
        return
      }
      if (DEFINITIONS[definition.type].reportEffectsWhenMutated) {
        DEFINITIONS[definition.type].reportEffectsWhenMutated(
          definition,
          scope,
          options
        )
      }
    }
  }

  function reportFatalError (node, message) {
    context.report(
      node,
      message +
        '\nIf you are using the latest version of this plugin, please ' +
        'consider filing an issue noting this message, the offending statement, your ESLint ' +
        'version, and any active ESLint presets and plugins'
    )
  }

  const moduleScope = getChildScopeForNodeIfExists(
    programNode,
    context.getScope()
  )
  if (!moduleScope) {
    reportFatalError(programNode, 'Could not find module scope.')
  } else {
    programNode.body.forEach(subNode =>
      reportSideEffects(subNode, moduleScope, {})
    )
  }
}

module.exports = {
  meta: {
    docs: {
      description: 'disallow side-effects in module initialization',
      category: 'Best Practices',
      recommended: false
    },
    schema: []
  },
  create: context => ({
    Program: node => reportSideEffectsInProgram(context, node)
  })
}
