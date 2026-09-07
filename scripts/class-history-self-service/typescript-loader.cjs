/* eslint-disable @typescript-eslint/no-require-imports -- Webpack loads its Node-only loader as CommonJS. */
module.exports = function(source) {
  return require('typescript').transpileModule(source, { compilerOptions: {
    jsx: require('typescript').JsxEmit.ReactJSX, module: require('typescript').ModuleKind.ESNext,
    target: require('typescript').ScriptTarget.ES2020,
  }}).outputText
}
