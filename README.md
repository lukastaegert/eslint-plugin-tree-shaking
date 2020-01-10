# eslint-plugin-tree-shaking

Marks all side-effects in module initialization that will interfere with tree-shaking

[![npm](https://img.shields.io/npm/v/eslint-plugin-tree-shaking.svg?maxAge=3600)](https://www.npmjs.com/package/eslint-plugin-tree-shaking)
[![JavaScript Style Guide](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?maxAge=3600)](http://standardjs.com/)
[![Greenkeeper badge](https://badges.greenkeeper.io/lukastaegert/eslint-plugin-tree-shaking.svg)](https://greenkeeper.io/)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg?maxAge=3600)](https://github.com/semantic-release/semantic-release)

## Usage

This plugin is intended as a means for library developers to identify patterns that will
interfere with the tree-shaking algorithm of their module bundler (i.e.
[rollup or webpack](https://medium.com/webpack/webpack-and-rollup-the-same-but-different-a41ad427058c)).

**JavaScript:**
```javascript
myGlobal = 17
const x = {[globalFunction()]: 'myString'}

export default 42
```

**Rollup output:**
```javascript
myGlobal = 17;
const x = {[globalFunction()]: 'myString'};

var index = 42;

export default index;
```

**ESLint output:**
```
1:1   error  Cannot determine side-effects of assignment to global variable
2:13  error  Cannot determine side-effects of calling global function
```

This plugin is most useful when you
[integrate ESLint with your editor](http://eslint.org/docs/user-guide/integrations).

## Installation and Setup

You'll first need to install [ESLint](http://eslint.org):

```
$ npm i eslint --save-dev
```

Next, install `eslint-plugin-tree-shaking`:

```
$ npm install eslint-plugin-tree-shaking --save-dev
```

**Note:** If you installed ESLint globally (using the `-g` flag) then you must also install `eslint-plugin-tree-shaking` globally.

Add `tree-shaking` to the plugins section of your `.eslintrc` configuration file. You can omit the `eslint-plugin-` prefix:
```json
{
    "plugins": [
        "tree-shaking"
    ]
}
```

Then add the rule `no-side-effects-in-initialization` to the rules section:
```json
{
    "rules": {
        "tree-shaking/no-side-effects-in-initialization": 2
    }
}
```

## Magic Comments

ESLint only ever analyzes one file at a time and by default, this plugin assumes that all imported
functions have side-effects. If this is not the case, this plugin supports magic comments you can
add before identifiers in imports and exports to specify that you assume an import or export to be a
pure function. Examples:

* By default, imported functions are assumed to have side-effects:

  **JavaScript:**
  ```javascript
  import {x} from "./some-file";
  x()
  ```
  
  **ESLint output:**
  ```
  1:9  error  Cannot determine side-effects of calling imported function
  ```

* You can mark a side-effect free import with a magic comment:
 
  **JavaScript:**
  ```javascript
  import {/* tree-shaking no-side-effects-when-called */ x} from "./some-file";
  x()
  ```
  
  **No ESLint errors**

* By default, exported functions are not checked for side-effects:
 
  **JavaScript:**
  ```javascript
  export const x = globalFunction
  ```
  
  **No ESLint errors**

* You can check exports for side-effects with a magic comment:

  **JavaScript:**
  ```javascript
  export const /* tree-shaking no-side-effects-when-called */ x = globalFunction
  ```
  
  **ESLint output:**
  ```
  1:65  error  Cannot determine side-effects of calling global function
  ```

## Background and Planned Development

This plugin is in development. If you want to contribute, please read
[CONTRIBUTING.md](./CONTRIBUTING.md).

This plugin implements a side-effect detection algorithm similar to what rollup uses to determine
if code can be removed safely. However, there is no one-to-one correspondence. If you find that you have code that
* is not removed by rollup (even though tree-shaking is enabled) but
* has no ESLint issues

please--if no-one else has done so yet--[check the guidelines](./CONTRIBUTING.md) and **file an issue!**
