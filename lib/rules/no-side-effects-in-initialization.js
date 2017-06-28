// use   https://astexplorer.net
//       http://mazurov.github.io/escope-demo
// check https://github.com/rollup/rollup/tree/master/src/ast/nodes

function reportEffect (node, context) {
  context.report(node, 'Initialization code should not have side effects')
}

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
  const {from, writeExpr} = variableReference;

  if (writeExpr) {
    if (['FunctionExpression', 'ArrowFunctionExpression'].indexOf(writeExpr.type) < 0) {
      reportEffect(writeExpr, context)
    } else {
      reportSideEffects(context, writeExpr.body, getChildScopeForNode(writeExpr, from))
    }
  }
}

const REPORT_EFFECTS_BY_TYPE = {
  AssignmentExpression(context, node, scope) {
    if (!getVariableFromScope(getRootIdentifier(node.left), scope)) {
      reportEffect(node.left, context)
    }
    reportSideEffects(context, node.right, scope)
  },
  BlockStatement(context, node, scope) {
    node.body.forEach(subNode => reportSideEffects(context, subNode, scope));
  },
  CallExpression(context, node, scope) {
    node.arguments.forEach(subNode => reportSideEffects(context, subNode, scope))
    const variableInScope = getVariableFromScope(getRootIdentifier(node.callee), scope)

    if (!variableInScope) {
      reportEffect(node.callee, context)
    } else if (node.callee.type === 'MemberExpression') {
      reportEffect(node.callee, context)
    } else if (node.callee.type === 'Identifier') {
      variableInScope.references.forEach(reportDeclarationCallSideEffects(context))
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
  create: context => ({
    Program: node => reportSideEffects(context, node)
  })
}
