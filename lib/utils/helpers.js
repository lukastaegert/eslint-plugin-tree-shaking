const TREE_SHAKING_COMMENT_ID = 'tree-shaking'

const pureFunctions = require('../utils/pure-functions')

const getRootNode = node => {
  if (node.type === 'MemberExpression') {
    return getRootNode(node.object)
  }
  return node
}

const getChildScopeForNodeIfExists = (node, currentScope) =>
  currentScope.childScopes.find(scope => scope.block === node)

const getLocalVariable = (variableName, scope) => {
  const variableInCurrentScope = scope.variables.find(({ name }) => name === variableName)
  return (
    variableInCurrentScope ||
    (scope.upper && scope.upper.type !== 'global' && getLocalVariable(variableName, scope.upper))
  )
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

const noEffects = () => {}

const parseComment = comment =>
  comment.value
    .split(' ')
    .map(token => token.trim())
    .filter(Boolean)

const getTreeShakingComments = comments => {
  const treeShakingComments = comments
    .map(parseComment)
    .filter(([id]) => id === TREE_SHAKING_COMMENT_ID)
    .map(tokens => tokens.slice(1))
    .reduce((result, tokens) => result.concat(tokens), [])
  return { has: token => treeShakingComments.indexOf(token) >= 0 }
}

const isFirstLetterUpperCase = string => string[0] >= 'A' && string[0] <= 'Z'

module.exports = {
  getChildScopeForNodeIfExists,
  getLocalVariable,
  getRootNode,
  getTreeShakingComments,
  isFirstLetterUpperCase,
  isPureFunction,
  noEffects
}
