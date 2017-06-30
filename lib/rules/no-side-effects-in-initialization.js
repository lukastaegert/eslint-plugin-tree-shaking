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

  const reportSideEffectsInCallToAssignment = variableReference => {
    const {from, writeExpr} = variableReference

    if (writeExpr) {
      if (['FunctionExpression', 'ArrowFunctionExpression'].indexOf(writeExpr.type) < 0) {
        context.report(writeExpr,
          'Assigned expression with unknown side-effects might be called as a function')
      } else {
        reportSideEffects(writeExpr.body, getChildScopeForNode(writeExpr, from))
      }
    }
  }

  const reportSideEffectsInCallToDefinition = scope => variableDefinition => {
    if (variableDefinition.node.type === 'FunctionDeclaration') {
      reportSideEffects(variableDefinition.node.body,
        getChildScopeForNode(variableDefinition.node, scope))
    }
  }

  const checkVariableCall = variable => {
    if (checkedCalledVariables.has(variable)) {
      return
    }
    checkedCalledVariables.add(variable)
    variable.references.forEach(reportSideEffectsInCallToAssignment)
    variable.defs.forEach(reportSideEffectsInCallToDefinition(variable.scope))
  }

  const REPORT_EFFECTS_BY_TYPE = {
    AssignmentExpression(node, scope) {
      if (!getLocalVariable(getRootIdentifier(node.left), scope)) {
        if (node.left.type === 'MemberExpression') {
          context.report(node.left.property,
            'Assignment to a member of a global variable is a side-effect')
        } else {
          context.report(node.left, 'Assignment to a global variable is a side-effect')
        }
      }
      reportSideEffects(node.right, scope)
    },

    BlockStatement(node, scope) {
      node.body.forEach(subNode => reportSideEffects(subNode, scope))
    },

    CallExpression(node, scope) {
      node.arguments.forEach(subNode => reportSideEffects(subNode, scope))
      switch (node.callee.type) {
        case 'MemberExpression':
          if (getLocalVariable(getRootIdentifier(node.callee), scope) || !isPureFunction(node.callee)) {
            context.report(node.callee.property, 'Could not determine side-effects of member function')
          }
          break
        case 'FunctionExpression':
        case 'ArrowFunctionExpression':
          reportSideEffects(node.callee.body, getChildScopeForNode(node.callee, scope))
          break
        case 'Identifier':
          const variableInScope = getLocalVariable(node.callee.name, scope)
          if (variableInScope) {
            checkVariableCall(variableInScope)
          } else if (!isPureFunction(node.callee)) {
            context.report(node.callee, 'Could not determine side-effects of global function')
          }
          break
        default:
          throw new Error(`Unexpected callee type ${node.callee.type} in CallExpression`)
      }
    },

    ExportNamedDeclaration(node, scope) {
      reportSideEffects(node.declaration, scope)
    },

    ExpressionStatement(node, scope) {
      reportSideEffects(node.expression, scope)
    },

    Program(node) {
      const scope = getChildScopeForNode(node, context.getScope())
      node.body.forEach(subNode => reportSideEffects(subNode, scope))
    },

    VariableDeclaration(node, scope) {
      node.declarations && node.declarations
        .forEach(declarator => reportSideEffects(declarator, scope))
    },

    VariableDeclarator(node, scope) {
      if (node.init) {
        reportSideEffects(node.init, scope)
      }
    }
  }

  function reportSideEffects (node, scope) {
    if (REPORT_EFFECTS_BY_TYPE[node.type]) {
      REPORT_EFFECTS_BY_TYPE[node.type](node, scope)
    }
  }

  const scope = getChildScopeForNode(programNode, context.getScope())
  programNode.body.forEach(subNode => reportSideEffects(subNode, scope))
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
