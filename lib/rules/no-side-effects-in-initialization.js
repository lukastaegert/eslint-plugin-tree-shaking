// use   https://astexplorer.net
//       http://mazurov.github.io/escope-demo
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

  const reportSideEffectsInCallToReference = ({calledWithNew}) => variableReference => {
    const {from, writeExpr} = variableReference

    if (writeExpr) {
      if (['FunctionExpression', 'ArrowFunctionExpression'].indexOf(writeExpr.type) < 0) {
        context.report(writeExpr,
          'Assigned expression with unknown side-effects might be called as a function')
      } else {
        reportSideEffects(writeExpr.body, getChildScopeForNode(writeExpr, from),
          {hasValidThis: calledWithNew})
      }
    }
  }

  const reportSideEffectsInCallToDefinition = (scope, {calledWithNew}) => variableDefinition => {
    if (variableDefinition.node.type === 'FunctionDeclaration') {
      reportSideEffects(variableDefinition.node.body,
        getChildScopeForNode(variableDefinition.node, scope), {hasValidThis: calledWithNew})
    }
  }

  const checkVariableCall = (variable, {calledWithNew}) => {
    if (checkedCalledVariables.has(variable) ||
      (calledWithNew && checkedCalledVariablesWithNew.has(variable))) {
      return
    }
    if (calledWithNew) {
      checkedCalledVariablesWithNew.add(variable)
    } else {
      checkedCalledVariables.add(variable)
    }
    variable.references.forEach(reportSideEffectsInCallToReference({calledWithNew}))
    variable.defs.forEach(reportSideEffectsInCallToDefinition(variable.scope, {calledWithNew}))
  }

  const reportSideEffectsInCallExpression = (node, scope, {calledWithNew}) => {
    node.arguments.forEach(subNode => reportSideEffects(subNode, scope, {hasValidThis: false}))
    switch (node.callee.type) {
      case 'MemberExpression':
        if (getLocalVariable(getRootIdentifier(node.callee), scope) ||
          !isPureFunction(node.callee)) {
          context.report(node.callee.property,
            'Could not determine side-effects of member function')
        }
        break
      case 'FunctionExpression':
        reportSideEffects(node.callee.body, getChildScopeForNode(node.callee, scope),
          {hasValidThis: true})
        break
      case 'ArrowFunctionExpression':
        if (calledWithNew) {
          context.report(node.callee,
            'Calling an arrow function with "new" is considered a side effect')
        } else {
          reportSideEffects(node.callee.body, getChildScopeForNode(node.callee, scope),
            {hasValidThis: false})
        }
        break
      case 'Identifier':
        const variableInScope = getLocalVariable(node.callee.name, scope)
        if (variableInScope) {
          checkVariableCall(variableInScope, {calledWithNew})
        } else if (!isPureFunction(node.callee)) {
          context.report(node.callee, 'Could not determine side-effects of global function')
        }
        break
      default:
        throw new Error(`Unexpected callee type ${node.callee.type} in CallExpression`)
    }
  }

  const reportSideEffectsInAssignmentToMemberExpression = (node, scope, {hasValidThis}) => {
    switch (getRootNode(node).type) {
      case 'ThisExpression':
        if (!hasValidThis) {
          context.report(node.property, 'Assignment to a member of an unknown this value is a side effect')
        }
        break;
      case 'Identifier':
        if (!getLocalVariable(getRootIdentifier(node), scope)) {
          context.report(node.property, 'Assignment to a member of a global variable is a side-effect')
        }
        break;
      default:
        throw new Error(`Unexpected left root node type ${getRootNode(node).type} in AssignmentExpression`)
    }
  }

  const REPORT_EFFECTS_BY_TYPE = {
    ArrowFunctionExpression(){},

    AssignmentExpression(node, scope, options) {
      switch (node.left.type) {
        case 'MemberExpression':
          reportSideEffectsInAssignmentToMemberExpression(node.left, scope, options)
          break;
        case 'Identifier':
          if (!getLocalVariable(node.left.name, scope)) {
            context.report(node.left, 'Assignment to a global variable is a side-effect')
          }
          break;
        default:
          throw new Error(`Unexpected left type ${node.left.type} in AssignmentExpression`)
      }
      reportSideEffects(node.right, scope, options)
    },

    BinaryExpression(node, scope, options) {
      reportSideEffects(node.left, scope, options)
      reportSideEffects(node.right, scope, options)
    },

    BlockStatement(node, scope, options) {
      node.body.forEach(subNode => reportSideEffects(subNode, scope, options))
    },

    CallExpression(node, scope) {
      reportSideEffectsInCallExpression(node, scope, {calledWithNew: false})
    },

    ExportNamedDeclaration(node, scope, options) {
      reportSideEffects(node.declaration, scope, options)
    },

    ExpressionStatement(node, scope, options) {
      reportSideEffects(node.expression, scope, options)
    },

    EmptyStatement(){},

    FunctionDeclaration(){},

    FunctionExpression(){},

    Identifier(){},

    Literal(){},

    NewExpression(node, scope) {
      reportSideEffectsInCallExpression(node, scope, {calledWithNew: true})
    },

    ObjectExpression(node, scope, options) {
      node.properties.forEach(subNode => {
        reportSideEffects(subNode.key, scope, options)
        reportSideEffects(subNode.value, scope, options)
      })
    },

    VariableDeclaration(node, scope, options) {
      node.declarations && node.declarations
        .forEach(declarator => reportSideEffects(declarator, scope, options))
    },

    VariableDeclarator(node, scope, options) {
      if (node.init) {
        reportSideEffects(node.init, scope, options)
      }
    }
  }

  function reportSideEffects (node, scope, options) {
    if (REPORT_EFFECTS_BY_TYPE[node.type]) {
      REPORT_EFFECTS_BY_TYPE[node.type](node, scope, options)
    } else {
      throw new Error(`Unknown node type ${node.type}`)
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
