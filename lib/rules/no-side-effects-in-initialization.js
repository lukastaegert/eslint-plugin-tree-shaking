// cf.   https://astexplorer.net
//       https://github.com/estree/estree
//       https://github.com/facebook/jsx/blob/master/AST.md
//       http://mazurov.github.io/escope-demo
//       https://npmdoc.github.io/node-npmdoc-escope/build/apidoc.html

const COMMENT_NO_SIDE_EFFECT_WHEN_CALLED = "no-side-effects-when-called";

const getUnknownSideEffectError = (subject) => `Cannot determine side-effects of ${subject}`;

const getAssignmentError = (target) => getUnknownSideEffectError(`assignment to ${target}`);
const getCallError = (target) => getUnknownSideEffectError(`calling ${target}`);
const getMutationError = (target) => getUnknownSideEffectError(`mutating ${target}`);

const ERROR_ASSIGN_GLOBAL = getAssignmentError("global variable");
const ERROR_CALL_DESTRUCTURED = getCallError("destructured variable");
const ERROR_CALL_GLOBAL = getCallError("global function");
const ERROR_CALL_IMPORT = getCallError("imported function");
const ERROR_CALL_MEMBER = getCallError("member function");
const ERROR_CALL_PARAMETER = getCallError("function parameter");
const ERROR_CALL_RETURN_VALUE = getCallError("function return value");
const ERROR_DEBUGGER = "Debugger statements are side-effects";
const ERROR_DELETE_OTHER = getUnknownSideEffectError("deleting anything but a MemberExpression");
const ERROR_ITERATOR = getUnknownSideEffectError("iterating over an iterable");
const ERROR_MUTATE_DESTRUCTURED = getMutationError("destructured variable");
const ERROR_MUTATE_GLOBAL = getMutationError("global variable");
const ERROR_MUTATE_IMPORT = getMutationError("imported variable");
const ERROR_MUTATE_MEMBER = getMutationError("member");
const ERROR_MUTATE_PARAMETER = getMutationError("function parameter");
const ERROR_MUTATE_RETURN_VALUE = getMutationError("function return value");
const ERROR_MUTATE_THIS = getMutationError("unknown this value");
const ERROR_THROW = "Throwing an error is a side-effect";

const {
  getChildScopeForNodeIfExists,
  isLocalVariableAWhitelistedModule,
  getLocalVariable,
  getRootNode,
  getTreeShakingComments,
  isFirstLetterUpperCase,
  isPureFunction,
  isFunctionSideEffectFree,
  noEffects,
} = require("../utils/helpers");
const Value = require("../utils/value");

const reportSideEffectsInProgram = (context, programNode) => {
  const checkedCalledNodes = new WeakSet();
  const checkedNodesCalledWithNew = new WeakSet();
  const checkedMutatedNodes = new WeakSet();

  const DEFINITIONS = {
    ClassName: {
      reportEffectsWhenCalled(definition, scope, options) {
        reportSideEffectsWhenCalled(definition.node, scope, options);
      },
    },
    FunctionName: {
      reportEffectsWhenCalled(definition, scope, options) {
        reportSideEffectsWhenCalled(definition.node, scope, options);
      },
    },
    ImportBinding: {
      reportEffectsWhenCalled(definition) {
        checkedCalledNodes.add(definition);
        if (checkedCalledNodes.has(definition.name)) {
          return;
        }
        if (
          !getTreeShakingComments(context.sourceCode.getCommentsBefore(definition.name)).has(
            COMMENT_NO_SIDE_EFFECT_WHEN_CALLED,
          ) &&
          !isFunctionSideEffectFree(
            definition.name.name,
            definition.parent.source.value,
            context.options,
          )
        ) {
          context.report(definition.name, ERROR_CALL_IMPORT);
        }
      },
      reportEffectsWhenMutated(definition) {
        if (checkedMutatedNodes.has(definition.name)) {
          return;
        }
        checkedMutatedNodes.add(definition.name);
        context.report(definition.name, ERROR_MUTATE_IMPORT);
      },
    },
    Parameter: {
      reportEffectsWhenCalled(definition) {
        if (checkedCalledNodes.has(definition.name)) {
          return;
        }
        checkedCalledNodes.add(definition.name);
        context.report(definition.name, ERROR_CALL_PARAMETER);
      },
      reportEffectsWhenMutated(definition) {
        if (checkedMutatedNodes.has(definition.name)) {
          return;
        }
        checkedMutatedNodes.add(definition.name);
        context.report(definition.name, ERROR_MUTATE_PARAMETER);
      },
    },
    Variable: {
      // side effects are already handled by checking write expressions in references
    },
  };

  const BINARY_OPERATORS = {
    // eslint-disable-next-line eqeqeq
    "==": (left, right) => left == right,
    // eslint-disable-next-line eqeqeq
    "!=": (left, right) => left != right,
    "===": (left, right) => left === right,
    "!==": (left, right) => left !== right,
    "<": (left, right) => left < right,
    "<=": (left, right) => left <= right,
    ">": (left, right) => left > right,
    ">=": (left, right) => left >= right,
    "<<": (left, right) => left << right,
    ">>": (left, right) => left >> right,
    ">>>": (left, right) => left >>> right,
    "+": (left, right) => left + right,
    "-": (left, right) => left - right,
    "*": (left, right) => left * right,
    "/": (left, right) => left / right,
    "%": (left, right) => left % right,
    "|": (left, right) => left | right,
    "^": (left, right) => left ^ right,
    "&": (left, right) => left & right,
    "**": (left, right) => Math.pow(left, right),
    in: (left, right) => left in right,
    instanceof: (left, right) => left instanceof right,
  };

  const LOGICAL_OPERATORS = {
    "&&": (getAndReportLeft, getAndReportRight) => {
      const leftValue = getAndReportLeft();
      if (!leftValue.hasValue) {
        getAndReportRight();
        return leftValue;
      }
      if (!leftValue.value) {
        return leftValue;
      }
      return getAndReportRight();
    },
    "||": (getAndReportLeft, getAndReportRight) => {
      const leftValue = getAndReportLeft();
      if (!leftValue.hasValue) {
        getAndReportRight();
        return leftValue;
      }
      if (leftValue.value) {
        return leftValue;
      }
      return getAndReportRight();
    },
    "??": (getAndReportLeft, getAndReportRight) => {
      const leftValue = getAndReportLeft();
      if (!leftValue.hasValue) {
        getAndReportRight();
        return leftValue;
      }
      if (leftValue.value) {
        return leftValue;
      }
      return getAndReportRight();
    },
  };

  const UNARY_OPERATORS = {
    "-": (value) => Value.of(-value),
    "+": (value) => Value.of(+value),
    "!": (value) => Value.of(!value),
    "~": (value) => Value.of(~value),
    typeof: (value) => Value.of(typeof value),
    void: () => Value.of(undefined),
    delete: () => Value.unknown(),
  };

  const NODES = {
    ArrayExpression: {
      reportEffects(node, scope, options) {
        node.elements.forEach((subNode) => reportSideEffects(subNode, scope, options));
      },
    },

    ArrayPattern: {
      reportEffects(node, scope, options) {
        node.elements.forEach((subNode) => reportSideEffects(subNode, scope, options));
      },
    },

    ArrowFunctionExpression: {
      reportEffects: noEffects,
      reportEffectsWhenCalled(node, scope, options) {
        node.params.forEach((subNode) => reportSideEffects(subNode, scope, options));
        const functionScope = getChildScopeForNodeIfExists(node, scope);
        if (!functionScope) {
          reportFatalError(node, "Could not find child scope for ArrowFunctionExpression.");
        } else {
          reportSideEffects(node.body, functionScope, options);
        }
      },
      reportEffectsWhenMutated: noEffects,
    },

    AssignmentExpression: {
      reportEffects(node, scope, options) {
        reportSideEffectsWhenAssigned(node.left, scope, options);
        reportSideEffects(node.right, scope, options);
      },
    },

    AssignmentPattern: {
      reportEffects(node, scope, options) {
        reportSideEffects(node.left, scope, options);
        reportSideEffects(node.right, scope, options);
      },
    },

    AwaitExpression: {
      reportEffects(node, scope, options) {
        reportSideEffects(node.argument, scope, options);
      },
    },

    BinaryExpression: {
      getValueAndReportEffects(node, scope, options) {
        const left = getValueAndReportSideEffects(node.left, scope, options);
        const right = getValueAndReportSideEffects(node.right, scope, options);

        if (left.hasValue && right.hasValue) {
          return Value.of(BINARY_OPERATORS[node.operator](left.value, right.value));
        }
        return Value.unknown();
      },
    },

    BlockStatement: {
      reportEffects(node, scope, options) {
        const blockScope = getChildScopeForNodeIfExists(node, scope) || scope;
        node.body.forEach((subNode) => reportSideEffects(subNode, blockScope, options));
      },
    },

    BreakStatement: {
      reportEffects: noEffects,
    },

    CallExpression: {
      reportEffects(node, scope, options) {
        node.arguments.forEach((subNode) => reportSideEffects(subNode, scope, options));
        reportSideEffectsWhenCalled(
          node.callee,
          scope,
          Object.assign({}, options, { calledWithNew: false }),
        );
      },
      reportEffectsWhenCalled(node, scope) {
        const localVariable = getLocalVariable(node.callee.name, scope);
        if (
          localVariable &&
          isLocalVariableAWhitelistedModule(localVariable, undefined, context.options)
        ) {
          return;
        }
        context.report(node, ERROR_CALL_RETURN_VALUE);
      },
      reportEffectsWhenMutated(node) {
        context.report(node, ERROR_MUTATE_RETURN_VALUE);
      },
    },

    CatchClause: {
      reportEffects(node, scope, options) {
        const catchScope = getChildScopeForNodeIfExists(node, scope);
        if (!catchScope) {
          reportFatalError(node, "Could not find child scope for CatchClause.");
        } else {
          reportSideEffects(node.body, catchScope, options);
        }
      },
    },

    ClassBody: {
      reportEffects(node, scope, options) {
        node.body.forEach((subNode) => reportSideEffects(subNode, scope, options));
      },
      reportEffectsWhenCalled(node, scope, options) {
        const classConstructor = node.body.find((subNode) => subNode.kind === "constructor");
        if (classConstructor) {
          reportSideEffectsWhenCalled(classConstructor, scope, options);
        } else if (options.superClass) {
          reportSideEffectsWhenCalled(options.superClass, scope, options);
        }

        node.body
          .filter((subNode) => subNode.type === "PropertyDefinition")
          .forEach((subNode) => reportSideEffectsWhenCalled(subNode, scope, options));
      },
    },

    ClassDeclaration: {
      reportEffects(node, scope, options) {
        reportSideEffects(node.superClass, scope, options);
        reportSideEffects(node.body, scope, options);
      },
      reportEffectsWhenCalled(node, scope, options) {
        const classScope = getChildScopeForNodeIfExists(node, scope);
        if (!classScope) {
          reportFatalError(node, "Could not find child scope for ClassDeclaration.");
        } else {
          reportSideEffectsWhenCalled(
            node.body,
            classScope,
            Object.assign({}, options, { superClass: node.superClass }),
          );
        }
      },
    },

    ClassExpression: {
      reportEffects(node, scope, options) {
        reportSideEffects(node.superClass, scope, options);
        reportSideEffects(node.body, scope, options);
      },
      reportEffectsWhenCalled(node, scope, options) {
        const classScope = getChildScopeForNodeIfExists(node, scope);
        if (!classScope) {
          reportFatalError(node, "Could not find child scope for ClassExpression.");
        } else {
          reportSideEffectsWhenCalled(
            node.body,
            classScope,
            Object.assign({}, options, { superClass: node.superClass }),
          );
        }
      },
    },

    ClassProperty: {
      reportEffects(node, scope, options) {
        reportSideEffects(node.key, scope, options);
        reportSideEffects(node.value, scope, options);
      },
    },

    ConditionalExpression: {
      getValueAndReportEffects(node, scope, options) {
        const testResult = getValueAndReportSideEffects(node.test, scope, options);
        if (testResult.hasValue) {
          return testResult.value
            ? getValueAndReportSideEffects(node.consequent, scope, options)
            : getValueAndReportSideEffects(node.alternate, scope, options);
        } else {
          reportSideEffects(node.consequent, scope, options);
          reportSideEffects(node.alternate, scope, options);
          return testResult;
        }
      },
      reportEffectsWhenCalled(node, scope, options) {
        const testResult = getValueAndReportSideEffects(node.test, scope, options);
        if (testResult.hasValue) {
          return testResult.value
            ? reportSideEffectsWhenCalled(node.consequent, scope, options)
            : reportSideEffectsWhenCalled(node.alternate, scope, options);
        } else {
          reportSideEffectsWhenCalled(node.consequent, scope, options);
          reportSideEffectsWhenCalled(node.alternate, scope, options);
        }
      },
    },

    ContinueStatement: {
      reportEffects: noEffects,
    },

    DebuggerStatement: {
      reportEffects(node) {
        context.report(node, ERROR_DEBUGGER);
      },
    },

    DoWhileStatement: {
      reportEffects(node, scope, options) {
        reportSideEffects(node.test, scope, options);
        reportSideEffects(node.body, scope, options);
      },
    },

    EmptyStatement: {
      reportEffects: noEffects,
    },

    ExportAllDeclaration: {
      reportEffects: noEffects,
    },

    ExportDefaultDeclaration: {
      reportEffects(node, scope, options) {
        if (
          getTreeShakingComments(context.sourceCode.getCommentsBefore(node.declaration)).has(
            COMMENT_NO_SIDE_EFFECT_WHEN_CALLED,
          )
        ) {
          reportSideEffectsWhenCalled(node.declaration, scope, options);
        }
        reportSideEffects(node.declaration, scope, options);
      },
    },

    ExportNamedDeclaration: {
      reportEffects(node, scope, options) {
        node.specifiers.forEach((subNode) => reportSideEffects(subNode, scope, options));
        reportSideEffects(node.declaration, scope, options);
      },
    },

    ExportSpecifier: {
      reportEffects(node, scope, options) {
        if (
          getTreeShakingComments(context.sourceCode.getCommentsBefore(node.exported)).has(
            COMMENT_NO_SIDE_EFFECT_WHEN_CALLED,
          )
        ) {
          reportSideEffectsWhenCalled(node.exported, scope, options);
        }
      },
    },

    ExpressionStatement: {
      reportEffects(node, scope, options) {
        reportSideEffects(node.expression, scope, options);
      },
    },

    ForInStatement: {
      reportEffects(node, scope, options) {
        const forScope = getChildScopeForNodeIfExists(node, scope) || scope;
        if (node.left.type !== "VariableDeclaration") {
          reportSideEffectsWhenAssigned(node.left, forScope, options);
        }
        reportSideEffects(node.right, forScope, options);
        reportSideEffects(node.body, forScope, options);
      },
    },

    ForOfStatement: {
      reportEffects(node, scope, options) {
        const forScope = getChildScopeForNodeIfExists(node, scope) || scope;
        if (node.left.type !== "VariableDeclaration") {
          reportSideEffectsWhenAssigned(node.left, forScope, options);
        }
        reportSideEffects(node.right, forScope, options);
        reportSideEffects(node.body, forScope, options);
        context.report(node.right, ERROR_ITERATOR);
      },
    },

    ForStatement: {
      reportEffects(node, scope, options) {
        const forScope = getChildScopeForNodeIfExists(node, scope) || scope;
        reportSideEffects(node.init, forScope, options);
        reportSideEffects(node.test, forScope, options);
        reportSideEffects(node.update, forScope, options);
        reportSideEffects(node.body, forScope, options);
      },
    },

    FunctionDeclaration: {
      reportEffects(node, scope, options) {
        if (
          node.id &&
          getTreeShakingComments(context.sourceCode.getCommentsBefore(node.id)).has(
            COMMENT_NO_SIDE_EFFECT_WHEN_CALLED,
          )
        ) {
          reportSideEffectsWhenCalled(node.id, scope, options);
        }
      },
      reportEffectsWhenCalled(node, scope, options) {
        node.params.forEach((subNode) => reportSideEffects(subNode, scope, options));
        const functionScope = getChildScopeForNodeIfExists(node, scope);
        if (!functionScope) {
          reportFatalError(node, "Could not find child scope for FunctionDeclaration.");
        } else {
          reportSideEffects(
            node.body,
            functionScope,
            Object.assign({}, options, { hasValidThis: options.calledWithNew }),
          );
        }
      },
    },

    FunctionExpression: {
      reportEffects: noEffects,
      reportEffectsWhenCalled(node, scope, options) {
        node.params.forEach((subNode) => reportSideEffects(subNode, scope, options));
        const functionScope = getChildScopeForNodeIfExists(node, scope);
        if (!functionScope) {
          reportFatalError(node, "Could not find child scope for FunctionExpression.");
        } else {
          reportSideEffects(
            node.body,
            functionScope,
            Object.assign({}, options, { hasValidThis: options.calledWithNew }),
          );
        }
      },
    },

    Identifier: {
      reportEffects: noEffects,
      reportEffectsWhenAssigned(node, scope) {
        if (!getLocalVariable(node.name, scope)) {
          context.report(node, ERROR_ASSIGN_GLOBAL);
        }
      },
      reportEffectsWhenCalled(node, scope, options) {
        const variableInScope = getLocalVariable(node.name, scope);
        if (variableInScope) {
          variableInScope.references.forEach(({ from, identifier, partial, writeExpr }) => {
            if (partial) {
              context.report(identifier, ERROR_CALL_DESTRUCTURED);
            } else {
              writeExpr && reportSideEffectsWhenCalled(writeExpr, from, options);
            }
          });
          variableInScope.defs.forEach(
            reportSideEffectsInDefinitionWhenCalled(variableInScope.scope, options),
          );
        } else if (!isPureFunction(node, context)) {
          context.report(node, ERROR_CALL_GLOBAL);
        }
      },
      reportEffectsWhenMutated(node, scope, options) {
        const localVariable = getLocalVariable(node.name, scope);
        if (localVariable) {
          localVariable.references.forEach(({ from, identifier, partial, writeExpr }) => {
            if (partial) {
              context.report(identifier, ERROR_MUTATE_DESTRUCTURED);
            } else {
              writeExpr && reportSideEffectsWhenMutated(writeExpr, from, options);
            }
          });
          localVariable.defs.forEach(
            reportSideEffectsInDefinitionWhenMutated(localVariable.scope, options),
          );
        } else {
          context.report(node, ERROR_MUTATE_GLOBAL);
        }
      },
    },

    IfStatement: {
      reportEffects(node, scope, options) {
        const testResult = getValueAndReportSideEffects(node.test, scope, options);
        if (testResult.hasValue) {
          testResult.value
            ? reportSideEffects(node.consequent, scope, options)
            : reportSideEffects(node.alternate, scope, options);
        } else {
          reportSideEffects(node.consequent, scope, options);
          reportSideEffects(node.alternate, scope, options);
        }
      },
    },

    ImportDeclaration: {
      reportEffects: noEffects,
    },

    JSXAttribute: {
      reportEffects(node, scope, options) {
        reportSideEffects(node.value, scope, options);
      },
    },

    JSXElement: {
      reportEffects(node, scope, options) {
        reportSideEffects(node.openingElement, scope, options);
        node.children.forEach((subNode) => reportSideEffects(subNode, scope, options));
      },
    },

    JSXEmptyExpression: {
      reportEffects: noEffects,
    },

    JSXExpressionContainer: {
      reportEffects(node, scope, options) {
        reportSideEffects(node.expression, scope, options);
      },
    },

    JSXIdentifier: {
      reportEffectsWhenCalled(node, scope, options) {
        if (isFirstLetterUpperCase(node.name)) {
          const variableInScope = getLocalVariable(node.name, scope);
          if (variableInScope) {
            variableInScope.references.forEach(({ from, identifier, partial, writeExpr }) => {
              if (partial) {
                context.report(identifier, ERROR_CALL_DESTRUCTURED);
              } else {
                reportSideEffectsWhenCalled(
                  writeExpr,
                  from,
                  Object.assign({}, options, { calledWithNew: true }),
                );
              }
            });
            variableInScope.defs.forEach(
              reportSideEffectsInDefinitionWhenCalled(
                variableInScope.scope,
                Object.assign({}, options, { calledWithNew: true }),
              ),
            );
          } else {
            context.report(node, ERROR_CALL_GLOBAL);
          }
        }
      },
    },

    JSXMemberExpression: {
      reportEffectsWhenCalled(node) {
        context.report(node.property, ERROR_CALL_MEMBER);
      },
    },

    JSXOpeningElement: {
      reportEffects(node, scope, options) {
        reportSideEffectsWhenCalled(node.name, scope, options);
        node.attributes.forEach((subNode) => reportSideEffects(subNode, scope, options));
      },
    },

    JSXSpreadAttribute: {
      reportEffects(node, scope, options) {
        reportSideEffects(node.argument, scope, options);
      },
    },

    JSXText: {
      reportEffects: noEffects,
    },

    LabeledStatement: {
      reportEffects(node, scope, options) {
        reportSideEffects(node.body, scope, options);
      },
    },

    Literal: {
      getValueAndReportEffects(node) {
        return Value.of(node.value);
      },
    },

    LogicalExpression: {
      getValueAndReportEffects(node, scope, options) {
        return LOGICAL_OPERATORS[node.operator](
          () => getValueAndReportSideEffects(node.left, scope, options),
          () => getValueAndReportSideEffects(node.right, scope, options),
        );
      },
    },

    MemberExpression: {
      reportEffects(node, scope, options) {
        reportSideEffects(node.property, scope, options);
        reportSideEffects(node.object, scope, options);
      },
      reportEffectsWhenAssigned(node, scope, options) {
        reportSideEffects(node, scope, options);
        reportSideEffectsWhenMutated(node.object, scope, options);
      },
      reportEffectsWhenMutated(node) {
        context.report(node.property, ERROR_MUTATE_MEMBER);
      },
      reportEffectsWhenCalled(node, scope, options) {
        reportSideEffects(node, scope, options);
        const rootNode = getRootNode(node);
        if (rootNode.type !== "Identifier") {
          context.report(node.property, ERROR_CALL_MEMBER);
          return;
        }
        const localVariable = getLocalVariable(rootNode.name, scope);
        if (localVariable) {
          if (
            isLocalVariableAWhitelistedModule(localVariable, node.property.name, context.options)
          ) {
            return;
          } else {
            context.report(node.property, ERROR_CALL_MEMBER);
            return;
          }
        }
        if (!isPureFunction(node, context)) {
          context.report(node.property, ERROR_CALL_MEMBER);
        }
      },
    },

    MetaProperty: {
      reportEffects: noEffects,
    },

    MethodDefinition: {
      reportEffects(node, scope, options) {
        reportSideEffects(node.key, scope, options);
      },
      reportEffectsWhenCalled(node, scope, options) {
        reportSideEffectsWhenCalled(node.value, scope, options);
      },
    },

    NewExpression: {
      reportEffects(node, scope, options) {
        node.arguments.forEach((subNode) => reportSideEffects(subNode, scope, options));
        reportSideEffectsWhenCalled(
          node.callee,
          scope,
          Object.assign({}, options, { calledWithNew: true }),
        );
      },
    },

    ObjectExpression: {
      reportEffects(node, scope, options) {
        node.properties.forEach((subNode) => {
          reportSideEffects(subNode.key, scope, options);
          reportSideEffects(subNode.value, scope, options);
        });
      },
      reportEffectsWhenMutated: noEffects,
    },

    ObjectPattern: {
      reportEffects(node, scope, options) {
        node.properties.forEach((subNode) => {
          reportSideEffects(subNode.key, scope, options);
          reportSideEffects(subNode.value, scope, options);
        });
      },
    },

    PropertyDefinition: {
      reportEffects(node, scope, options) {
        reportSideEffects(node.key, scope, options);
      },
      reportEffectsWhenCalled(node, scope, options) {
        reportSideEffects(node.value, scope, options);
      },
    },

    RestElement: {
      reportEffects: noEffects,
    },

    ReturnStatement: {
      reportEffects(node, scope, options) {
        reportSideEffects(node.argument, scope, options);
      },
    },

    SequenceExpression: {
      getValueAndReportEffects(node, scope, options) {
        return node.expressions.reduce(
          (result, expression) => getValueAndReportSideEffects(expression, scope, options),
          Value.unknown(),
        );
      },
    },

    Super: {
      reportEffects: noEffects,
      reportEffectsWhenCalled(node, scope, options) {
        context.report(node, getCallError("super"));
      },
    },

    SwitchCase: {
      reportEffects(node, scope, options) {
        reportSideEffects(node.test, scope, options);
        node.consequent.forEach((subNode) => reportSideEffects(subNode, scope, options));
      },
    },

    SwitchStatement: {
      reportEffects(node, scope, options) {
        reportSideEffects(node.discriminant, scope, options);
        const switchScope = getChildScopeForNodeIfExists(node, scope);
        if (!switchScope) {
          reportFatalError(node, "Could not find child scope for SwitchStatement.");
        } else {
          node.cases.forEach((subNode) => reportSideEffects(subNode, switchScope, options));
        }
      },
    },

    TaggedTemplateExpression: {
      reportEffects(node, scope, options) {
        reportSideEffectsWhenCalled(node.tag, scope, options);
        reportSideEffects(node.quasi, scope, options);
      },
    },

    TemplateLiteral: {
      reportEffects(node, scope, options) {
        node.expressions.forEach((subNode) => reportSideEffects(subNode, scope, options));
      },
    },

    ThisExpression: {
      reportEffects: noEffects,
      reportEffectsWhenMutated(node, scope, options) {
        if (!options.hasValidThis) {
          context.report(node, ERROR_MUTATE_THIS);
        }
      },
    },

    ThrowStatement: {
      reportEffects(node) {
        context.report(node, ERROR_THROW);
      },
    },

    TryStatement: {
      reportEffects(node, scope, options) {
        reportSideEffects(node.block, scope, options);
        reportSideEffects(node.handler, scope, options);
        reportSideEffects(node.finalizer, scope, options);
      },
    },

    UnaryExpression: {
      getValueAndReportEffects(node, scope, options) {
        if (node.operator === "delete") {
          if (node.argument.type !== "MemberExpression") {
            context.report(node.argument, ERROR_DELETE_OTHER);
          } else {
            reportSideEffectsWhenMutated(node.argument.object, scope, options);
          }
        }
        return getValueAndReportSideEffects(node.argument, scope, options).chain(
          UNARY_OPERATORS[node.operator],
        );
      },
    },

    UpdateExpression: {
      reportEffects(node, scope, options) {
        // Increment/decrement work like "assign updated value", not like a mutation
        // cf. y={};x={y};x.y++ => x.y={y:NaN}, y={}
        reportSideEffectsWhenAssigned(node.argument, scope, options);
      },
    },

    VariableDeclaration: {
      reportEffects(node, scope, options) {
        node.declarations.forEach((declarator) => reportSideEffects(declarator, scope, options));
      },
    },

    VariableDeclarator: {
      reportEffects(node, scope, options) {
        reportSideEffects(node.id, scope, options);
        if (
          getTreeShakingComments(context.sourceCode.getCommentsBefore(node.id)).has(
            COMMENT_NO_SIDE_EFFECT_WHEN_CALLED,
          )
        ) {
          reportSideEffectsWhenCalled(node.id, scope, options);
        }
        reportSideEffects(node.init, scope, options);
      },
    },

    WhileStatement: {
      reportEffects(node, scope, options) {
        reportSideEffects(node.test, scope, options);
        reportSideEffects(node.body, scope, options);
      },
    },

    YieldExpression: {
      reportEffects(node, scope, options) {
        reportSideEffects(node.argument, scope, options);
      },
    },
  };

  const verifyNodeTypeIsKnown = (node) => {
    if (!node) {
      return false;
    }
    if (!NODES[node.type]) {
      if (!node.type.startsWith("TS")) {
        reportFatalError(node, `Unknown node type ${node.type}.`);
      }
      return false;
    }
    return true;
  };

  function reportSideEffects(node, scope, options) {
    if (!verifyNodeTypeIsKnown(node)) {
      return;
    }
    if (NODES[node.type].reportEffects) {
      NODES[node.type].reportEffects(node, scope, options);
    } else if (NODES[node.type].getValueAndReportEffects) {
      NODES[node.type].getValueAndReportEffects(node, scope, options);
    } else {
      context.report(node, getUnknownSideEffectError(node.type));
    }
  }

  function reportSideEffectsWhenAssigned(node, scope, options) {
    if (!verifyNodeTypeIsKnown(node)) {
      return;
    }
    if (NODES[node.type].reportEffectsWhenAssigned) {
      NODES[node.type].reportEffectsWhenAssigned(node, scope, options);
    } else {
      context.report(node, getAssignmentError(node.type));
    }
  }

  function reportSideEffectsWhenMutated(node, scope, options) {
    if (!verifyNodeTypeIsKnown(node) || checkedMutatedNodes.has(node)) {
      return;
    }
    checkedMutatedNodes.add(node);
    if (NODES[node.type].reportEffectsWhenMutated) {
      NODES[node.type].reportEffectsWhenMutated(node, scope, options);
    } else {
      context.report(node, getMutationError(node.type));
    }
  }

  function reportSideEffectsWhenCalled(node, scope, options) {
    if (
      !verifyNodeTypeIsKnown(node) ||
      checkedCalledNodes.has(node) ||
      (options.calledWithNew && checkedNodesCalledWithNew.has(node))
    ) {
      return;
    }
    if (options.calledWithNew) {
      checkedNodesCalledWithNew.add(node);
    } else {
      checkedCalledNodes.add(node);
    }
    if (NODES[node.type].reportEffectsWhenCalled) {
      NODES[node.type].reportEffectsWhenCalled(node, scope, options);
    } else {
      context.report(node, getCallError(node.type));
    }
  }

  function getValueAndReportSideEffects(node, scope, options) {
    if (!verifyNodeTypeIsKnown(node)) {
      return;
    }
    if (NODES[node.type].getValueAndReportEffects) {
      return NODES[node.type].getValueAndReportEffects(node, scope, options);
    }
    reportSideEffects(node, scope, options);
    return Value.unknown();
  }

  const verifyDefinitionTypeIsKnown = (definition) => {
    if (!DEFINITIONS[definition.type]) {
      reportFatalError(definition.name, `Unknown definition type ${definition.type}.`);
      return false;
    }
    return true;
  };

  function reportSideEffectsInDefinitionWhenCalled(scope, options) {
    return (definition) => {
      if (!verifyDefinitionTypeIsKnown(definition)) {
        return;
      }
      if (DEFINITIONS[definition.type].reportEffectsWhenCalled) {
        DEFINITIONS[definition.type].reportEffectsWhenCalled(definition, scope, options);
      }
    };
  }

  function reportSideEffectsInDefinitionWhenMutated(scope, options) {
    return (definition) => {
      if (!verifyDefinitionTypeIsKnown(definition)) {
        return;
      }
      if (DEFINITIONS[definition.type].reportEffectsWhenMutated) {
        DEFINITIONS[definition.type].reportEffectsWhenMutated(definition, scope, options);
      }
    };
  }

  function reportFatalError(node, message) {
    context.report(
      node,
      message +
        "\nIf you are using the latest version of this plugin, please " +
        "consider filing an issue noting this message, the offending statement, your ESLint " +
        "version, and any active ESLint presets and plugins",
    );
  }

  const moduleScope = getChildScopeForNodeIfExists(programNode, context.getScope());
  if (!moduleScope) {
    reportFatalError(programNode, "Could not find module scope.");
  } else {
    programNode.body.forEach((subNode) => reportSideEffects(subNode, moduleScope, {}));
  }
};

module.exports = {
  meta: {
    docs: {
      description: "disallow side-effects in module initialization",
      category: "Best Practices",
      recommended: false,
    },
    schema: [
      {
        type: "object",
        properties: {
          noSideEffectsWhenCalled: {
            type: "array",
            items: {
              anyOf: [
                {
                  type: "object",
                  properties: {
                    module: { type: "string" },
                    functions: {
                      anyOf: [
                        { type: "string", pattern: "^\\*$" },
                        { type: "array", items: { type: "string" } },
                      ],
                    },
                  },
                  additionalProperties: false,
                },
                {
                  type: "object",
                  properties: {
                    function: { type: "string" },
                  },
                  additionalProperties: false,
                },
              ],
            },
          },
        },
        additionalProperties: false,
      },
    ],
  },
  create: (context) => ({
    Program: (node) => reportSideEffectsInProgram(context, node),
  }),
};
