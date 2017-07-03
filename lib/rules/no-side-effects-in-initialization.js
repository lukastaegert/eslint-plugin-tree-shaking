// use   https://astexplorer.net
//       http://mazurov.github.io/escope-demo
//       https://developer.mozilla.org/en-US/docs/Mozilla/Projects/SpiderMonkey/Parser_API
// check https://github.com/rollup/rollup/tree/master/src/ast/nodes

const pureFunctions = require('../utils/pure-functions')

const getRootIdentifier = node => {
  if (node.type === 'MemberExpression') {
    return getRootIdentifier(node.object)
  }
  if (node.type === 'Identifier') {
    return node.name
  }
  throw new Error(`Unexpected root node type ${node.type}`)
}

const getRootNode = node => {
  if (node.type === 'MemberExpression') {
    return getRootNode(node.object)
  }
  return node
}

const getChildScopeForNode = (node, currentScope) => {
  const childScope = currentScope.childScopes.find(scope => scope.block === node)

  if (!childScope) {
    throw new Error(`Could not find childScope for ${node.type} node.`)
  }
  return childScope
}

const getLocalVariable = (variableName, scope) => {
  const variableInCurrentScope = scope.variables.find(({name}) => name === variableName)
  return variableInCurrentScope ||
    (scope.upper && scope.upper.type !== 'global' && getLocalVariable(variableName, scope.upper))
}

const flattenMemberExpressionIfPossible = node => {
  switch (node.type) {
    case 'MemberExpression':
      if (node.computed || node.property.type !== 'Identifier') {
        return null
      }
      const flattenedParent = flattenMemberExpressionIfPossible(node.object)
      return flattenedParent && `${flattenedParent}.${node.property.name}`
    case 'Identifier':
      return node.name
    default:
      return null
  }
}

const isPureFunction = node => {
  const flattenedExpression = flattenMemberExpressionIfPossible(node)
  return pureFunctions[flattenedExpression]
}

const reportSideEffectsInProgram = (context, programNode) => {
  const checkedCalledVariables = new WeakSet()
  const checkedCalledVariablesWithNew = new WeakSet()

  const reportSideEffectsInCallToReference = options => ({from, writeExpr}) => {
    if (writeExpr) {
      switch (writeExpr.type) {
        case 'FunctionExpression':
          reportSideEffects(writeExpr.body, getChildScopeForNode(writeExpr, from),
            Object.assign({}, options, {hasValidThis: options.calledWithNew}))
          break
        case 'ArrowFunctionExpression':
          if (options.calledWithNew) {
            context.report(writeExpr, 'Calling an arrow function with "new" is a side-effect')
          } else {
            reportSideEffects(writeExpr.body, getChildScopeForNode(writeExpr, from), options)
          }
          break
        default:
          context.report(writeExpr,
            `Expression with unknown side-effects is possibly called as a function`)
      }
    }
  }

  const reportSideEffectsInCallToDefinition = (scope, options) => ({node, type}) => {
    switch (type) {
      case 'FunctionName':
        if (node.type === 'FunctionDeclaration') {
          reportSideEffects(node.body, getChildScopeForNode(node, scope),
            Object.assign({}, options, {hasValidThis: options.calledWithNew}))
        } else {
          throw new Error(`Unexpected node type ${node.type} for FunctionName variable definition`)
        }
        break
      case 'Parameter':
        context.report(node, 'Calling a function parameter is considered a side-effect')
        break
      default:
    }
  }

  const checkVariableCall = (variable, options) => {
    if (checkedCalledVariables.has(variable) ||
      (options.calledWithNew && checkedCalledVariablesWithNew.has(variable))) {
      return
    }
    if (options.calledWithNew) {
      checkedCalledVariablesWithNew.add(variable)
    } else {
      checkedCalledVariables.add(variable)
    }
    variable.references.forEach(reportSideEffectsInCallToReference(options))
    variable.defs.forEach(reportSideEffectsInCallToDefinition(variable.scope, options))
  }

  const reportSideEffectsInCallExpression = (node, scope, options) => {
    node.arguments.forEach(subNode => reportSideEffects(subNode, scope, options))
    switch (node.callee.type) {
      case 'MemberExpression':
        reportSideEffects(node.callee, scope, options)
        if (getLocalVariable(getRootIdentifier(node.callee), scope) ||
          !isPureFunction(node.callee)) {
          context.report(node.callee.property,
            'Could not determine side-effects of member function')
        }
        break
      case 'FunctionExpression':
        reportSideEffects(node.callee.body, getChildScopeForNode(node.callee, scope),
          Object.assign({}, options, {hasValidThis: options.calledWithNew}))
        break
      case 'ArrowFunctionExpression':
        if (options.calledWithNew) {
          context.report(node.callee, 'Calling an arrow function with "new" is a side-effect')
        } else {
          reportSideEffects(node.callee.body, getChildScopeForNode(node.callee, scope), options)
        }
        break
      case 'Identifier':
        const variableInScope = getLocalVariable(node.callee.name, scope)
        if (variableInScope) {
          checkVariableCall(variableInScope, options)
        } else if (!isPureFunction(node.callee)) {
          context.report(node.callee, 'Could not determine side-effects of global function')
        }
        break
      default:
        throw new Error(`Unexpected callee type ${node.callee.type} in CallExpression`)
    }
  }

  const REPORT_EFFECTS_BY_TYPE = {
    ArrowFunctionExpression(){},

    AssignmentExpression: {
      reportEffects(node, scope, options) {
        reportSideEffectsWhenAssigned(node.left, scope, options)
        reportSideEffects(node.right, scope, options)
      }
    },

    BinaryExpression: {
      reportEffects(node, scope, options) {
        reportSideEffects(node.left, scope, options)
        reportSideEffects(node.right, scope, options)
      }
    },

    BlockStatement: {
      reportEffects(node, scope, options) {
        node.body.forEach(subNode => reportSideEffects(subNode, scope, options))
      }
    },

    CallExpression: {
      reportEffects(node, scope, options) {
        reportSideEffectsInCallExpression(node, scope,
          Object.assign({}, options, {calledWithNew: false}))
      }
    },

    EmptyStatement: {},

    ExportDefaultDeclaration: {
      reportEffects(node, scope, options) {
        reportSideEffects(node.declaration, scope, options)
      }
    },

    ExportNamedDeclaration: {
      reportEffects(node, scope, options) {
        reportSideEffects(node.declaration, scope, options)
      }
    },

    ExpressionStatement: {
      reportEffects(node, scope, options) {
        reportSideEffects(node.expression, scope, options)
      }
    },

    FunctionDeclaration: {},

    FunctionExpression: {},

    Identifier: {
      reportEffectsWhenAssigned(node, scope){
        if (!getLocalVariable(node.name, scope)) {
          context.report(node, 'Assignment to a global variable is a side-effect')
        }
      }
    },

    IfStatement: {
      reportEffects(node, scope, options){
        reportSideEffects(node.test, scope, options)
        reportSideEffects(node.consequent, scope, options)
        node.alternate && reportSideEffects(node.alternate, scope, options)
      }
    },

    Literal: {},

    MemberExpression: {
      reportEffects(node, scope, options){
        node.computed && reportSideEffects(node.property, scope, options)
        reportSideEffects(node.object, scope, options)
      },
      reportEffectsWhenAssigned(node, scope, options){
        reportSideEffects(node, scope, options)
        switch (getRootNode(node).type) {
          case 'ThisExpression':
            if (!options.hasValidThis) {
              context.report(node.property,
                'Assignment to a member of an unknown this value is a side-effect')
            }
            break
          case 'Identifier':
            if (!getLocalVariable(getRootIdentifier(node), scope)) {
              context.report(node.property,
                'Assignment to a member of a global variable is a side-effect')
            }
            break
          default:
            throw new Error(
              `Unexpected left root node type ${getRootNode(node).type} in AssignmentExpression`)
        }
      }
    },

    NewExpression: {
      reportEffects(node, scope, options) {
        reportSideEffectsInCallExpression(node, scope,
          Object.assign({}, options, {calledWithNew: true}))
      }
    },

    ObjectExpression: {
      reportEffects(node, scope, options) {
        node.properties.forEach(subNode => {
          reportSideEffects(subNode.key, scope, options)
          reportSideEffects(subNode.value, scope, options)
        })
      }
    },

    ThisExpression: {},

    ThrowStatement: {
      reportEffects(node){
        context.report(node, 'Throwing an error is a side-effect')
      }
    },

    UnaryExpression: {
      reportEffects(node, scope, options) {
        reportSideEffects(node.argument, scope, options)
      }
    },

    VariableDeclaration: {
      reportEffects(node, scope, options) {
        node.declarations && node.declarations
          .forEach(declarator => reportSideEffects(declarator, scope, options))
      }
    },

    VariableDeclarator: {
      reportEffects(node, scope, options) {
        if (node.init) {
          reportSideEffects(node.init, scope, options)
        }
      }
    }
  }

  const verifyNodeTypeIsKnown = node => {
    if (!REPORT_EFFECTS_BY_TYPE[node.type]) {
      throw new Error(`Unknown node type ${node.type}`)
    }
  }

  function reportSideEffects (node, scope, options) {
    verifyNodeTypeIsKnown(node)
    if (REPORT_EFFECTS_BY_TYPE[node.type].reportEffects) {
      REPORT_EFFECTS_BY_TYPE[node.type].reportEffects(node, scope, options)
    }
  }

  function reportSideEffectsWhenAssigned (node, scope, options) {
    verifyNodeTypeIsKnown(node)
    if (REPORT_EFFECTS_BY_TYPE[node.type].reportEffectsWhenAssigned) {
      REPORT_EFFECTS_BY_TYPE[node.type].reportEffectsWhenAssigned(node, scope, options)
    } else {
      throw new Error(`Unexpected assignment target ${node.type} in AssignmentExpression`)
    }
  }

  const scope = getChildScopeForNode(programNode, context.getScope())
  programNode.body.forEach(subNode => reportSideEffects(subNode, scope, {}))
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
