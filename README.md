# eslint-plugin-tree-shaking

Marks side-effects in module initialization that would interfere with tree-shaking

## Usage

This plugin is intended as a means for library developers to identify patterns that will
interfere with the tree-shaking algorithm of their module bundler (i.e.
[rollup or webpack](https://medium.com/webpack/webpack-and-rollup-the-same-but-different-a41ad427058c)).

**JavaScript:**
```javascript
myGlobal = 17
const x = {[globalFunction(1)]: 'myString'}

export default 42
```

**Rollup output:**
```javascript
myGlobal = 17;
const x = {[globalFunction(1)]: 'myString'};

var index = 42;

export default index;
```

**ESLint output:**
```
1:1   error  Assignment to a global variable is a side-effect
2:13  error  Could not determine side-effects of global function
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

### Rollup compatibility mode

If you are using [rollup.js](https://rollupjs.org/), you should activate the rollup compatibility
mode that will flag additional issues that prevent tree-shaking in rollup:
```json
{
    "rules": {
        "tree-shaking/no-side-effects-in-initialization": [
            2, {"compatibility": "rollup"}
        ]
    }
}
```

E.g. **JavaScript:**
```javascript
class x {}
new x()
```

**ESLint output:**
```
1:1   error  [Rollup specific] Calling a ClassDeclaration is a side-effect
```

## Background and Planned Development

This plugin is in early development. If you want to contribute, please read
[CONTRIBUTING.md](./CONTRIBUTING.md).

This plugin implements a side-effect detection algorithm similar to what rollup uses to determine
if code can be removed safely. However, there is no one-to-one correspondence as this is also meant
as an example implementation of what such an algorithm could do. For instance, this algorithm is
able to identify if the instantiation of a class has side-effects, something that rollup has not
implemented yet.

Therefore to make this plugin actually useful to library developers, it sports a rollup
compatibility mode. If you find that you have code that
* is not removed by rollup (even though tree-shaking is enabled) but
* has no ESLint issues even though you use rollup compatibility mode

please--if no-one else has done so yet--[check the guidelines](./CONTRIBUTING.md) and **file an issue!**

Planned improvements:
* ESLint only ever analyzes the current file. Therefore, this plugin assumes that all imported
  functions have side-effects. The current plan is to solved this at some point via special
  comments.
* There is no webpack compatibility mode yet. The plan is to add this eventually but if you want
  to speed things up, please contribute.
