var pi = require('pipe-iterators'),
    toBuildTask = require('../../v2/streams/get-package-transforms.js'),
    assert = require('assert'),
    fixture = require('file-fixture');

describe('get-package-transforms tests', function() {

  // browserify field support
  // - "transforms": 'foo'

  it('works when transforms is a string', function() {

    var base = fixture.dir({
      'index.js': 'require("a");',
      'node_modules/a/index.js': 'module.exports = "a"',
      'node_modules/a/package.json': '{ "browserify": { "transforms": "foo" } }',
      'node_modules/foo.js': 'module.exports = "foo";'
    });

  });

  // - "transforms": [ 'foo', 'bar' ]

  it('works when transforms is an array of strings', function() {

    var base = fixture.dir({
      'index.js': 'require("a");',
      'node_modules/a/index.js': 'module.exports = "a"',
      'node_modules/a/package.json': '{ "browserify": { "transforms": ["foo", "bar"] } }',
      'node_modules/foo.js': 'module.exports = "foo";',
      'node_modules/bar.js': 'module.exports = "bar";'
    });

  });

  // - "transforms": [["fff",{"x":3}],["ggg",{"y":4}]]

  it('works when some of the transforms are arrays with arguments', function() {
    var base = fixture.dir({
      'index.js': 'require("a");',
      'node_modules/a/index.js': 'module.exports = "a"',
      'node_modules/a/package.json': '{ "browserify": { "transforms": [ ["foo", { "x": 3 } ], "bar"] } }',
      'node_modules/a/node_modules/foo.js': 'module.exports = "foo";',
      'node_modules/bar.js': 'module.exports = "bar";'
    });

  });

  xit('can apply different transforms to the main module vs. dependencies', function() {


  });

  xit('global transforms are applied on all files');

  xit('global commands are applied on all files');

});
