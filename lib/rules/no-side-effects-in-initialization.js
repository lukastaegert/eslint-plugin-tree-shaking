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
  const checkedMutatedNodes = new WeakSet()

  const REPORT_EFFECTS_BY_DEFINITION_TYPE = {
    FunctionName: {
      reportEffectsWhenCalled(definition, scope, options) {
        reportSideEffectsWhenCalled(definition.node, scope, options)
      }
    },
    Parameter: {
      reportEffectsWhenCalled(definition) {
        if (checkedCalledNodes.has(definition.name)) {
          return;
        }
        checkedCalledNodes.add(definition.name)
        context.report(definition.name, 'Calling a function parameter is considered a side-effect')
      },
      reportSideEffectsWhenMutated(definition) {
        if (checkedMutatedNodes.has(definition.name)) {
          return;
        }
        checkedMutatedNodes.add(definition.name)
        context.report(definition.name, 'Mutating a function parameter is a side-effect')
      }
    },
    Variable: {
      // side effects are already handled by checking write expressions in references
    },
  }

  const REPORT_EFFECTS_BY_TYPE = {
    ArrayExpression: {
      reportEffects(node, scope, options) {
        node.elements.forEach(subNode => subNode && reportSideEffects(subNode, scope, options))
      }
    },

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

    CatchClause: {
      reportEffects(node, scope, options) {
        const catchScope = getChildScopeForNode(node, scope)
        reportSideEffects(node.body, catchScope, options)
      }
    },

    ContinueStatement: {},

    DebuggerStatement: {
      reportEffects(node) {
        context.report(node, 'Debugger statements are side-effects')
      }
    },

    DoWhileStatement: {
      reportEffects(node, scope, options) {
        reportSideEffects(node.test, scope, options)
        reportSideEffects(node.body, scope, options)
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

    ForInStatement: {
      reportEffects(node, scope, options){
        const forScope = getChildScopeForNodeIfExists(node, scope) || scope
        if (node.left.type !== 'VariableDeclaration') {
          reportSideEffectsWhenAssigned(node.left, forScope, options)
        }
        reportSideEffects(node.right, forScope, options)
        reportSideEffects(node.body, forScope, options)
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
            reportSideEffectsInDefinitionWhenCalled(variableInScope.scope, options))
        } else if (!isPureFunction(node)) {
          context.report(node, 'Could not determine side-effects of global function')
        }
      },
      reportEffectsWhenMutated(node, scope, options){
        const localVariable = getLocalVariable(node.name, scope)
        if (localVariable) {
          localVariable.references.forEach(({from, writeExpr}) => writeExpr &&
          reportSideEffectsWhenMutated(writeExpr, from, options))
          localVariable.defs.forEach(
            reportSideEffectsInDefinitionWhenMutated(localVariable.scope, options))
        } else {
          context.report(node, 'Mutating a global variable is a side-effect')
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
        reportSideEffectsWhenMutated(node.object, scope, options)
      },
      reportEffectsWhenMutated(node){
        context.report(node.property, 'Mutating members of an object is a side-effect')
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

    SwitchCase: {
      reportEffects(node, scope, options){
        node.test && reportSideEffects(node.test, scope, options)
        node.consequent.forEach(subNode => reportSideEffects(subNode, scope, options))
      }
    },

    SwitchStatement: {
      reportEffects(node, scope, options){
        reportSideEffects(node.discriminant, scope, options)
        const switchScope = getChildScopeForNode(node, scope)
        node.cases.forEach(subNode => reportSideEffects(subNode, switchScope, options))
      }
    },

    ThisExpression: {
      reportEffectsWhenMutated(node, scope, options){
        if (!options.hasValidThis) {
          context.report(node, 'Mutating an unknown this value is a side-effect')
        }
      }
    },

    ThrowStatement: {
      reportEffects(node){
        context.report(node, 'Throwing an error is a side-effect')
      }
    },

    TryStatement: {
      reportEffects(node, scope, options){
        reportSideEffects(node.block, scope, options)
        node.handler && reportSideEffects(node.handler, scope, options)
        node.finalizer && reportSideEffects(node.finalizer, scope, options)
      }
    },

    UnaryExpression: {
      reportEffects(node, scope, options) {
        reportSideEffects(node.argument, scope, options)
        if (node.operator === 'delete') {
          if (node.argument.type !== 'MemberExpression') {
            context.report('Using delete on anything but a MemberExpression is a side-effect')
          } else {
            reportSideEffectsWhenMutated(node.argument.object, scope, options)
          }
        }
      }
    },

    UpdateExpression: {
      reportEffects(node, scope, options) {
        // Increment/decrement work like "assign updated value", not like a mutation
        // cf. y={};x={y};x.y++ => x.y={y:NaN}, y={}
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
      throw new Error(`Unexpected assignment target ${node.type}`)
    }
  }

  function reportSideEffectsWhenMutated (node, scope, options) {
    verifyNodeTypeIsKnown(node)
    if (checkedMutatedNodes.has(node)) {
      return
    }
    checkedMutatedNodes.add(node)
    if (REPORT_EFFECTS_BY_TYPE[node.type].reportEffectsWhenMutated) {
      REPORT_EFFECTS_BY_TYPE[node.type].reportEffectsWhenMutated(node, scope, options)
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

  const verifyDefinitionTypeIsKnown = definition => {
    if (!REPORT_EFFECTS_BY_DEFINITION_TYPE[definition.type]) {
      throw new Error(`Unknown node type ${definition.type}`)
    }
  }

  function reportSideEffectsInDefinitionWhenCalled (scope, options) {
    return definition => {
      verifyDefinitionTypeIsKnown(definition)
      if (REPORT_EFFECTS_BY_DEFINITION_TYPE[definition.type].reportEffectsWhenCalled) {
        REPORT_EFFECTS_BY_DEFINITION_TYPE[definition.type].reportEffectsWhenCalled(definition,
          scope, options)
      }
    }
  }

  function reportSideEffectsInDefinitionWhenMutated (scope, options) {
    return definition => {
      verifyDefinitionTypeIsKnown(definition)
      if (REPORT_EFFECTS_BY_DEFINITION_TYPE[definition.type].reportSideEffectsWhenMutated) {
        REPORT_EFFECTS_BY_DEFINITION_TYPE[definition.type].reportSideEffectsWhenMutated(definition,
          scope, options)
      }
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
