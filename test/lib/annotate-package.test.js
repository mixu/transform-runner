var pi = require('pipe-iterators'),
    annotatePackage = require('../../v2/streams/annotate-package.js'),
    assert = require('assert'),
    fixture = require('file-fixture');

describe('package inference tests', function() {

  it('can infer a single-file package', function(done) {
    var base = fixture.dir({
      'simple.js': 'module.exports = true;'
    });
  });

  it('can infer a single file module', function(done) {
    var base = fixture.dir({
      'index.js': 'module.exports = true;',
      'node_modules/foo.js': 'module.exports = true;'
    });
  });

  it('can infer a folder module', function(done) {

      'index.js': 'module.exports = true;',
      'node_modules/foo/index.js': 'module.exports = true;',
      'node_modules/foo/lib/sub.js': 'module.exports = true;'

  });

  it('can pick up main file name from package.json', function(done) {

      'index.js': 'module.exports = true;',
      'node_modules/foo/main.js': 'module.exports = true;',
      'node_modules/foo/lib/sub.js': 'module.exports = true;',
      'node_modules/foo/package.json': '{ "main": "main.js" }'
  });

  it('can pick up node_modules inside node_modules', function(done) {
      'index.js': 'module.exports = true;',
      'node_modules/aa/index.js': 'module.exports = true;',
      'node_modules/aa/node_modules/bb.js': 'module.exports = true;',
      'node_modules/aa/node_modules/cc/differentfile.js': 'module.exports = true;',
      'node_modules/aa/node_modules/cc/package.json': '{ "main": "differentfile.js" }'

  });

  it('basic', function(done) {

    var base = fixture.dir({
      'main.js': 'require("./x");',
      'x.js': 'require("bar/main");',
      'node_modules/bar/main.js': 'module.exports = "bar/main";'
    });
  });

  it('works with a basepath containing node_modules', function() {
    var base = fixture.dir({
      'node_modules/foo/main.js': 'require("./x.js");',
      'node_modules/foo/x.js': 'require("bar");',
      'node_modules/foo/node_modules/bar/package.json': '{ "main": "main.js"}',
      'node_modules/foo/node_modules/bar/main.js': 'module.exports = "bar/main"'
    });
  });

  it('works with a single .json file module', function() {
      'a/index.js': 'module.exports = true;',
      'a/node_modules/b.json': '{}'

  });


  // packages are only detected at node_modules boundaries
  // even if package.json files exist in subfolders of modules,
  // they won't be considered to avoid having to
  // define what it means to have conflict between the node_modules
  // level package.json and a subfolder package.json (e.g. different names
  // different browser fields etc).

});
