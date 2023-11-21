import { Rule } from "eslint";
import { noSideEffectsInInitialization } from "./rules/no-side-effects-in-initialization";

export const rules: Record<string, Rule.RuleModule> = {
  "no-side-effects-in-initialization": noSideEffectsInInitialization,
};
