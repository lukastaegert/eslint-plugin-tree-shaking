const {fromPairs, merge} = require('ramda')

// use https://astexplorer.net
//     https://github.com/rollup/rollup/tree/master/src/ast/nodes

function reportEffect (node, context) {
  context.report(node, 'Initialization code should not have side effects')
}

const getDeclaredVariablesObject = (context, node) =>
  fromPairs(context.getDeclaredVariables(node).map(({name}) => [name, true]))

const getVariablesDeclaredInBody = (context, node) => node.body.reduce(
  (declaredVariables, subNode) =>
    merge(declaredVariables, getDeclaredVariablesObject(context, subNode)), {}
)

const getBaseIdentifier = node => {
  if (node.type === 'Identifier') {
    return node.name
  }
  if (node.type === 'MemberExpression') {
    return getBaseIdentifier(node.object)
  }
  return null
}

const REPORT_EFFECTS_BY_TYPE = {
  AssignmentExpression(context, node, declaredVariables) {
    if (!declaredVariables[getBaseIdentifier(node.left)]) {
      reportEffect(node.left, context)
    }
    reportSideEffects(context, node.right, declaredVariables)
  },
  CallExpression(context, node, declaredVariables) {
    if (!declaredVariables[getBaseIdentifier(node.callee)]) {
      reportEffect(node.callee, context)
    }
    node.arguments.forEach(subNode => reportSideEffects(context, subNode, declaredVariables))
  },
  ExportNamedDeclaration(context, node, declaredVariables) {
    reportSideEffects(context, node.declaration, declaredVariables)
  },
  ExpressionStatement(context, node, declaredVariables) {
    reportSideEffects(context, node.expression, declaredVariables)
  },
  Program(context, node, declaredVariables) {
    const locallyKnownVariables = merge(declaredVariables, getVariablesDeclaredInBody(context, node))
    node.body.forEach(subNode => reportSideEffects(context, subNode, locallyKnownVariables))
  },
  VariableDeclaration(context, node, declaredVariables) {
    node.declarations && node.declarations
      .forEach(declarator => reportSideEffects(context, declarator, declaredVariables))
  },
  VariableDeclarator(context, node, declaredVariables) {
    if (node.init) {
      reportSideEffects(context, node.init, declaredVariables)
    }
  }
}

function reportSideEffects (context, node, declaredVariables = {}) {
  if (REPORT_EFFECTS_BY_TYPE[node.type]) {
    REPORT_EFFECTS_BY_TYPE[node.type](context, node, declaredVariables)
  }
}

module.exports = {
  create: context => ({
    Program: node => reportSideEffects(context, node)
  })
}
