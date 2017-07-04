// use   https://astexplorer.net
//       https://github.com/estree/estree
//       http://mazurov.github.io/escope-demo
//       https://npmdoc.github.io/node-npmdoc-escope/build/apidoc.html
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

const getChildScopeForNodeIfExists = (node, currentScope) => currentScope.childScopes.find(
  scope => scope.block === node)

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
  const checkedCalledNodes = new WeakSet()
  const checkedNodesCalledWithNew = new WeakSet()

  const reportSideEffectsInCallToDefinition = (scope, options) => ({node, type}) => {
    switch (type) {
      case 'FunctionName':
        if (node.type === 'FunctionDeclaration') {
          reportSideEffectsWhenCalled(node, scope, options)
        } else {
          throw new Error(`Unexpected node type ${node.type} for FunctionName variable definition`)
        }
        break
      case 'Parameter':
        context.report(node, 'Calling a function parameter is considered a side-effect')
        break
      case 'Variable':
        // already handled by checking references - but we could add this check for completeness
        break
      default:
        throw new Error(`Unexpected variable definition type ${type}`)
    }
  }

  const REPORT_EFFECTS_BY_TYPE = {
    ArrowFunctionExpression: {
      reportEffectsWhenCalled(node, scope, options){
        if (options.calledWithNew) {
          context.report(node, 'Calling an arrow function with "new" is a side-effect')
        } else {
          reportSideEffects(node.body, getChildScopeForNode(node, scope), options)
        }
      }
    },

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
        const blockScope = getChildScopeForNodeIfExists(node, scope) || scope
        node.body.forEach(subNode => reportSideEffects(subNode, blockScope, options))
      }
    },

    BreakStatement: {},

    CallExpression: {
      reportEffects(node, scope, options) {
        node.arguments.forEach(subNode => reportSideEffects(subNode, scope, options))
        reportSideEffectsWhenCalled(node.callee, scope,
          Object.assign({}, options, {calledWithNew: false}))
      }
    },

    ContinueStatement: {},

    DebuggerStatement: {
      reportEffects(node) {
        context.report(node, 'Debugger statements are side-effects')
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

    ForStatement: {
      reportEffects(node, scope, options){
        const forScope = getChildScopeForNodeIfExists(node, scope) || scope
        node.init && reportSideEffects(node.init, forScope, options)
        node.test && reportSideEffects(node.test, forScope, options)
        node.update && reportSideEffects(node.update, forScope, options)
        reportSideEffects(node.body, forScope, options)
      }
    },

    FunctionDeclaration: {
      reportEffectsWhenCalled(node, scope, options){
        reportSideEffects(node.body, getChildScopeForNode(node, scope),
          Object.assign({}, options, {hasValidThis: options.calledWithNew}))
      }
    },

    FunctionExpression: {
      reportEffectsWhenCalled(node, scope, options){
        reportSideEffects(node.body, getChildScopeForNode(node, scope),
          Object.assign({}, options, {hasValidThis: options.calledWithNew}))
      }
    },

    Identifier: {
      reportEffectsWhenAssigned(node, scope){
        if (!getLocalVariable(node.name, scope)) {
          context.report(node, 'Assignment to a global variable is a side-effect')
        }
      },
      reportEffectsWhenCalled(node, scope, options){
        const variableInScope = getLocalVariable(node.name, scope)
        if (variableInScope) {
          variableInScope.references.forEach(({from, writeExpr}) => writeExpr &&
          reportSideEffectsWhenCalled(writeExpr, from, options))
          variableInScope.defs.forEach(
            reportSideEffectsInCallToDefinition(variableInScope.scope, options))
        } else if (!isPureFunction(node)) {
          context.report(node, 'Could not determine side-effects of global function')
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

    LabeledStatement: {
      reportEffects(node, scope, options){
        reportSideEffects(node.body, scope, options)
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
      },
      reportEffectsWhenCalled(node, scope, options){
        reportSideEffects(node, scope, options)
        if (getLocalVariable(getRootIdentifier(node), scope) || !isPureFunction(node)) {
          context.report(node.property, 'Could not determine side-effects of member function')
        }
      }
    },

    NewExpression: {
      reportEffects(node, scope, options) {
        node.arguments.forEach(subNode => reportSideEffects(subNode, scope, options))
        reportSideEffectsWhenCalled(node.callee, scope,
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

    ReturnStatement: {
      reportEffects(node, scope, options){
        node.argument && reportSideEffects(node.argument, scope, options)
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

    UpdateExpression: {
      reportEffects(node, scope, options) {
        reportSideEffectsWhenAssigned(node.argument, scope, options)
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
    },

    WhileStatement: {
      reportEffects(node, scope, options) {
        reportSideEffects(node.test, scope, options)
        reportSideEffects(node.body, scope, options)
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

  function reportSideEffectsWhenCalled (node, scope, options) {
    verifyNodeTypeIsKnown(node)
    if (checkedCalledNodes.has(node) ||
      (options.calledWithNew && checkedNodesCalledWithNew.has(node))) {
      return
    }
    if (options.calledWithNew) {
      checkedNodesCalledWithNew.add(node)
    } else {
      checkedCalledNodes.add(node)
    }
    if (REPORT_EFFECTS_BY_TYPE[node.type].reportEffectsWhenCalled) {
      REPORT_EFFECTS_BY_TYPE[node.type].reportEffectsWhenCalled(node, scope, options)
    } else {
      context.report(node, `Expression with unknown side-effects might be called as a function`)
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
