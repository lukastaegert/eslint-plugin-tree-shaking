# eslint-plugin-tree-shaking

Spots side-effects in module initialization that would interfere with tree-shaking

## Installation

You'll first need to install [ESLint](http://eslint.org):

```
$ npm i eslint --save-dev
```

Next, install `eslint-plugin-tree-shaking`:

```
$ npm install eslint-plugin-tree-shaking --save-dev
```

**Note:** If you installed ESLint globally (using the `-g` flag) then you must also install `eslint-plugin-tree-shaking` globally.

## Usage

Add `tree-shaking` to the plugins section of your `.eslintrc` configuration file. You can omit the `eslint-plugin-` prefix:

```json
{
    "plugins": [
        "tree-shaking"
    ]
}
```


Then configure the rules you want to use under the rules section.

```json
{
    "rules": {
        "tree-shaking/rule-name": 2
    }
}
```

## Supported Rules

* Fill in provided rules here





