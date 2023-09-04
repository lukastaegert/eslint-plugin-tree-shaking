const TREE_SHAKING_COMMENT_ID = "tree-shaking";

const pureFunctions = require("../utils/pure-functions");

const getRootNode = (node) => {
  if (node.type === "MemberExpression") {
    return getRootNode(node.object);
  }
  return node;
};

const getChildScopeForNodeIfExists = (node, currentScope) =>
  currentScope.childScopes.find((scope) => scope.block === node);

const getLocalVariable = (variableName, scope) => {
  const variableInCurrentScope = scope.variables.find(({ name }) => name === variableName);
  return (
    variableInCurrentScope ||
    (scope.upper && scope.upper.type !== "global" && getLocalVariable(variableName, scope.upper))
  );
};

const flattenMemberExpressionIfPossible = (node) => {
  switch (node.type) {
    case "MemberExpression":
      if (node.computed || node.property.type !== "Identifier") {
        return null;
      }
      // eslint-disable-next-line no-case-declarations
      const flattenedParent = flattenMemberExpressionIfPossible(node.object);
      return flattenedParent && `${flattenedParent}.${node.property.name}`;
    case "Identifier":
      return node.name;
    default:
      return null;
  }
};

const isPureFunction = (node, contextOptions) => {
  const flattenedExpression = flattenMemberExpressionIfPossible(node);
  if (contextOptions.length > 0) {
    if (
      contextOptions[0].noSideEffectsWhenCalled.find(
        (whiteListedFunction) => whiteListedFunction.function === flattenedExpression,
      )
    ) {
      return true;
    }
  }
  return pureFunctions[flattenedExpression];
};

const noEffects = () => {};

const parseComment = (comment) =>
  comment.value
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);

const getTreeShakingComments = (comments) => {
  const treeShakingComments = comments
    .map(parseComment)
    .filter(([id]) => id === TREE_SHAKING_COMMENT_ID)
    .map((tokens) => tokens.slice(1))
    .reduce((result, tokens) => result.concat(tokens), []);
  return { has: (token) => treeShakingComments.indexOf(token) >= 0 };
};

const isFunctionSideEfectFree = (functionName, moduleName, contextOptions) => {
  if (contextOptions.length === 0) {
    return false;
  }

  for (const whiteListedFunction of contextOptions[0].noSideEffectsWhenCalled) {
    if (
      (whiteListedFunction.module === moduleName ||
        (whiteListedFunction.module === "#local" && moduleName[0] === ".")) &&
      (whiteListedFunction.functions === "*" ||
        whiteListedFunction.functions.includes(functionName))
    ) {
      return true;
    }
  }
  return false;
};

const isLocalVariableAWhitelistedModule = (variable, property, contextOptions) => {
  if (
    variable.scope.type === "module" &&
    variable.defs[0].parent &&
    variable.defs[0].parent.source
  ) {
    return isFunctionSideEfectFree(property, variable.defs[0].parent.source.value, contextOptions);
  }
  return false;
};

const isFirstLetterUpperCase = (string) => string[0] >= "A" && string[0] <= "Z";

module.exports = {
  getChildScopeForNodeIfExists,
  getLocalVariable,
  isLocalVariableAWhitelistedModule,
  getRootNode,
  getTreeShakingComments,
  isFunctionSideEfectFree,
  isFirstLetterUpperCase,
  isPureFunction,
  noEffects,
};
