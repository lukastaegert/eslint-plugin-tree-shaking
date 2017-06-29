// use   https://astexplorer.net
//       http://mazurov.github.io/escope-demo
// check https://github.com/rollup/rollup/tree/master/src/ast/nodes

const pureFunctions = require('../utils/pure-functions')

const getRootIdentifier = node => {
  if (node.type === 'Identifier') {
    return node.name
  }
  if (node.type === 'MemberExpression') {
    return getRootIdentifier(node.object)
  }
  return null
}

const getChildScopeForNode = (node, currentScope) => {
  const childScope = currentScope.childScopes.find(scope => scope.block === node)

  if (!childScope) {
    throw new Error(`Could not find childScope for ${node.type} node.`)
  }
  return childScope
}

const getVariableFromScope = (variableName, scope) => {
  const declarationInCurrentScope = scope.variables.find(({name}) => name === variableName)

  return declarationInCurrentScope ||
    (scope.upper && getVariableFromScope(variableName, scope.upper))
}

const reportDeclarationCallSideEffects = context => variableReference => {
  const {from, writeExpr} = variableReference

  if (writeExpr) {
    if (['FunctionExpression', 'ArrowFunctionExpression'].indexOf(writeExpr.type) < 0) {
      context.report(writeExpr,
        'Assigned expression with unknown side-effects might be called as a function')
    } else {
      reportSideEffects(context, writeExpr.body, getChildScopeForNode(writeExpr, from))
    }
  }
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

const REPORT_EFFECTS_BY_TYPE = {
  AssignmentExpression(context, node, scope) {
    if (!getVariableFromScope(getRootIdentifier(node.left), scope)) {
      if (node.left.type === 'MemberExpression') {
        context.report(node.left.property,
          'Assignment to a member of a global variable is a side-effect')
      } else {
        context.report(node.left, 'Assignment to a global variable is a side-effect')
      }
    }
    reportSideEffects(context, node.right, scope)
  },

  BlockStatement(context, node, scope) {
    node.body.forEach(subNode => reportSideEffects(context, subNode, scope))
  },

  CallExpression(context, node, scope) {
    node.arguments.forEach(subNode => reportSideEffects(context, subNode, scope))
    switch (node.callee.type) {
      case 'MemberExpression':
        if (!isPureFunction(node.callee)) {
          context.report(node.callee.property,
            'Could not determine side-effects of member function')
        }
        break
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        reportSideEffects(context, node.callee.body, getChildScopeForNode(node.callee, scope))
        break
      case 'Identifier':
        const variableInScope = getVariableFromScope(node.callee.name, scope)
        if (variableInScope) {
          variableInScope.references.forEach(reportDeclarationCallSideEffects(context))
        } else if (!isPureFunction(node.callee)) {
          context.report(node.callee, 'Could not determine side-effects of global function')
        }
        break
      default:
        throw new Error(`Unexpected callee type ${node.callee.type} in CallExpression`)
    }
  },

  ExportNamedDeclaration(context, node, scope) {
    reportSideEffects(context, node.declaration, scope)
  },

  ExpressionStatement(context, node, scope) {
    reportSideEffects(context, node.expression, scope)
  },

  Program(context, node) {
    const scope = getChildScopeForNode(node, context.getScope())
    node.body.forEach(subNode => reportSideEffects(context, subNode, scope))
  },

  VariableDeclaration(context, node, scope) {
    node.declarations && node.declarations
      .forEach(declarator => reportSideEffects(context, declarator, scope))
  },

  VariableDeclarator(context, node, scope) {
    if (node.init) {
      reportSideEffects(context, node.init, scope)
    }
  }
}

function reportSideEffects (context, node, scope) {
  if (REPORT_EFFECTS_BY_TYPE[node.type]) {
    REPORT_EFFECTS_BY_TYPE[node.type](context, node, scope)
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
    Program: node => reportSideEffects(context, node)
  })
}
