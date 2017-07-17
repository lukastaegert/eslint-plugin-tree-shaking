# How to contribute

### You have code that is not tree-shaken by rollup even though there are no ESLint issues
* Make sure you are using [rollup-compatibility mode](./README.md#rollup-compatibility-mode)
* Make sure you are using the latest versions of both rollup and this plugin
* Check if there is already an issue about this
* If not, **file an issue!** The title should be prefixed with "\[rollup\] …" to make it easier to
  identify these issues
* Provide minimal code that exposes your issue

### You have code that has no ESLint issues even though you are sure there is a side-effect
* JavaScript is a very dynamic language. There are three kinds of side-effects which will usually
  NOT be reported by this plugin:
  * Invalid JavaScript syntax, e.g. calling an arrow function with `new` etc.
  * Modifications to built-in global functions which are considered to be pure, e.g. `Object.keys`
   (this is in line with rollup's behavior)
  * Side-effects in getters since all members of an object could be getters (again, this seems
    to reflect rollup's behavior; however, I am open for discussion here)
* Make sure you use the latest version of this plugin
* Check if there is already an issue about this
* If not, **file an issue!**
* Add minimal code that exposes your issue

### Webpack compatibility mode
* This would certainly be useful; however, there are other issues I want to address first, mainly,
  seeing how rollup's code could be improved.
* If you want to help here, this is what needs to be done:
  * Add code that can automatically run a code snippet in Webpack with the UglifyJS plugin to enable
    tree-shaking and check the result is removed properly
  * This should be run against all code snippets in this plugin's test suite; this is already done
    for rollup so you can get inspiration there
  * Add specific branches to the side-effect detection algorithm for differences in webpack
* The third point is optional, if you add the first two points, I can certainly help with the third
* Check the [Coding Guidelines](#coding-guidelines) before making a pull-request

### You have an idea on how to improve the package
* If you want to show anything by code or actually want to contribute code, file a pull request.
  Even if it is not merged, this pull request makes it easier to discuss proposed changes.
* Otherwise, please file an issue.

### Coding Guidelines
* Code style must follow the [standard](https://github.com/feross/standard) rules.
* Commit messages must follow the [AngularJS Commit Message Conventions](https://docs.google.com/document/d/1QrDFcIiPjSLDn3EL15IJygNPiHORgU1_OOAqWjiDU5Y/edit);
* Clean code is encouraged, e.g. short functions that do one thing, descriptive function/variable names,
  no comments that can be made obsolete by more descriptive naming or smaller functions etc.

If you `npm install` before committing anything, code style should be enforced automatically.
