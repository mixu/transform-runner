var pi = require('pipe-iterators'),
    glob = require('wildglob'),
    fs = require('fs'),
    annotatePackage = require('../../v2/streams/annotate-package.js'),
    getPackageTransforms = require('../../v2/streams/get-package-transforms.js'),
    toBuildTask = require('../../v2/streams/to-build-task.js'),
    assert = require('assert'),
    fixture = require('file-fixture');

describe('get-package-transforms tests', function() {

  // browserify field support
  // - "transform": 'foo'

  function run(dir, onDone) {
    glob.stream(dir + '/**')
        .pipe(pi.filter(function(filename) {
          var stat = fs.statSync(filename);
          return stat.isFile();
        }))
        .pipe(annotatePackage([dir]))
        .pipe(getPackageTransforms({}))
        .pipe(pi.toArray(onDone));
  }

  it('works when transforms is a string', function(done) {

    var base = fixture.dir({
      'index.js': 'require("a");',
      'node_modules/a/index.js': 'module.exports = "a"',
      'node_modules/a/package.json': '{ "browserify": { "transform": "foo" } }',
      'node_modules/foo.js': 'module.exports = "foo";'
    });

    run(base, function(results) {
      console.log(results);
      done();
    });

  });

  // - "transform": [ 'foo', 'bar' ]

  it('works when transforms is an array of strings', function() {

    var base = fixture.dir({
      'index.js': 'require("a");',
      'node_modules/a/index.js': 'module.exports = "a"',
      'node_modules/a/package.json': '{ "browserify": { "transforms": ["foo", "bar"] } }',
      'node_modules/foo.js': 'module.exports = "foo";',
      'node_modules/bar.js': 'module.exports = "bar";'
    });

  });

  // - "transform": [["fff",{"x":3}],["ggg",{"y":4}]]

  it('works when some of the transforms are arrays with arguments', function() {
    var base = fixture.dir({
      'index.js': 'require("a");',
      'node_modules/a/index.js': 'module.exports = "a"',
      'node_modules/a/package.json': '{ "browserify": { "transform": [ ["foo", { "x": 3 } ], "bar"] } }',
      'node_modules/a/node_modules/foo.js': 'module.exports = "foo";',
      'node_modules/bar.js': 'module.exports = "bar";'
    });

  });

  xit('can apply different transforms to the main module vs. dependencies', function() {


  });

  xit('global transforms are applied on all files');

  xit('global commands are applied on all files');

});
