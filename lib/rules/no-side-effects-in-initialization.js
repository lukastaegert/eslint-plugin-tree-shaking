// TODO find variable declarations first before going into deeper recursion
// TODO add Program node to find initial declarations, also BlockStatement
// use https://astexplorer.net
//     https://github.com/rollup/rollup/tree/master/src/ast/nodes

const REPORT_EFFECTS_BY_TYPE = {
  AssignmentExpression(node, declaredVariables, context) {
    reportSideEffects(node.right, declaredVariables, context)
  },
  CallExpression(node, declaredVariables, context) {

  },
  VariableDeclaration(node, declaredVariables, context) {
    node.declarations && node.declarations.forEach(declarator =>
      reportSideEffects(declarator, declaredVariables, context))
  },
  VariableDeclarator(node, declaredVariables, context) {
    reportSideEffects(node.init, declaredVariables, context)
  }
}

function reportSideEffects (node, declaredVariables, context) {
  if (REPORT_EFFECTS_BY_TYPE[node.type]) {
    REPORT_EFFECTS_BY_TYPE[node.type](node, declaredVariables, context)
  }
}

function reportEffect (node, context) {
  context.report(node, 'Initialization code should not have side effects')
}

function isTopLevelNode (node) {
  return node.parent.type === 'Program'
}

function getDeclaredVariables (node) {

}

const reportAllSideEffects = context => programNode => {
  programNode.body.forEach(node => {
    console.log(node.type)
    console.log(context.getDeclaredVariables(node))
  })
}

module.exports = {
  create: context => ({
    Program: reportAllSideEffects(context)
  })
}
