var fs = require('fs'),
    glob = require('wildglob'),
    pi = require('pipe-iterators'),
    annotatePackage = require('../../v2/streams/annotate-package.js'),
    assert = require('assert'),
    fixture = require('file-fixture');

describe('package inference tests', function() {

  function run(dir, onDone) {
    glob.stream(dir + '/**')
        .pipe(pi.filter(function(filename) {
          var stat = fs.statSync(filename);
          return stat.isFile();
        }))
        .pipe(annotatePackage([dir]))
        .pipe(pi.toArray(onDone));
  }

  it('can infer a single-file package', function(done) {
    var base = fixture.dir({
      'simple.js': 'module.exports = true;'
    });

    run(base, function(files) {
      assert.deepEqual(files, [
        { filename: base + '/simple.js',
          isMain: true,
          package: null,
          'package.json': null }
      ]);
      done();
    });
  });

  it('can infer a single file module', function(done) {
    var base = fixture.dir({
      'index.js': 'module.exports = true;',
      'node_modules/foo.js': 'module.exports = true;'
    });

    run(base, function(files) {
      assert.deepEqual(files, [
        { filename: base + '/index.js',
          isMain: true,
          package: null,
          'package.json': null },
        { filename: base + '/node_modules/foo.js',
          isMain: false,
          package: base + '/node_modules/foo.js',
          'package.json': null }
      ]);
      done();
    });
  });

  it('can infer a folder module', function(done) {
    var base = fixture.dir({
      'index.js': 'module.exports = true;',
      'node_modules/foo/index.js': 'module.exports = true;',
      'node_modules/foo/lib/sub.js': 'module.exports = true;'
    });

    run(base, function(files) {
      assert.deepEqual(files, [
        { filename: base + '/index.js',
          isMain: true,
          package: null,
          'package.json': null },
        { filename: base + '/node_modules/foo/index.js',
          isMain: false,
          package: base + '/node_modules/foo',
          'package.json': null },
        { filename: base + '/node_modules/foo/lib/sub.js',
          isMain: false,
          package: base + '/node_modules/foo',
          'package.json': null }
      ]);
      done();
    });
  });

  it('can pick up main file name from package.json', function(done) {
    var base = fixture.dir({
      'index.js': 'module.exports = true;',
      'node_modules/foo/main.js': 'module.exports = true;',
      'node_modules/foo/lib/sub.js': 'module.exports = true;',
      'node_modules/foo/package.json': '{ "main": "main.js" }'
    });
    run(base, function(files) {
      assert.deepEqual(files, [
        { filename: base + '/index.js',
          isMain: true,
          package: null,
          'package.json': null },
        { filename: base + '/node_modules/foo/main.js',
          isMain: false,
          package: base + '/node_modules/foo',
          'package.json': base + '/node_modules/foo/package.json' },
        { filename: base + '/node_modules/foo/package.json',
          isMain: false,
          package: base + '/node_modules/foo',
          'package.json': base + '/node_modules/foo/package.json' },
        { filename: base + '/node_modules/foo/lib/sub.js',
          isMain: false,
          package: base + '/node_modules/foo',
          'package.json': base + '/node_modules/foo/package.json' }
      ]);
      done();
    });
  });

  it('can pick up node_modules inside node_modules', function(done) {
    var base = fixture.dir({
      'index.js': 'module.exports = true;',
      'node_modules/aa/index.js': 'module.exports = true;',
      'node_modules/aa/node_modules/bb.js': 'module.exports = true;',
      'node_modules/aa/node_modules/cc/differentfile.js': 'module.exports = true;',
      'node_modules/aa/node_modules/cc/package.json': '{ "main": "differentfile.js" }'
    });
    run(base, function(files) {
      assert.deepEqual(files, [
        { filename: base + '/index.js',
          isMain: true,
          package: null,
          'package.json': null },
        { filename: base + '/node_modules/aa/index.js',
          isMain: false,
          package: base + '/node_modules/aa',
          'package.json': null },
        { filename: base + '/node_modules/aa/node_modules/bb.js',
          isMain: false,
          package: base + '/node_modules/aa/node_modules/bb.js',
          'package.json': null },
        { filename: base + '/node_modules/aa/node_modules/cc/differentfile.js',
          isMain: false,
          package: base + '/node_modules/aa/node_modules/cc',
          'package.json': base + '/node_modules/aa/node_modules/cc/package.json' },
        { filename: base + '/node_modules/aa/node_modules/cc/package.json',
          isMain: false,
          package: base + '/node_modules/aa/node_modules/cc',
          'package.json': base + '/node_modules/aa/node_modules/cc/package.json' }
      ]);
      done();
    });
  });
/*
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
    var base = fixture.dir({
      'a/index.js': 'module.exports = true;',
      'a/node_modules/b.json': '{}'
    });

  });
*/

  // packages are only detected at node_modules boundaries
  // even if package.json files exist in subfolders of modules,
  // they won't be considered to avoid having to
  // define what it means to have conflict between the node_modules
  // level package.json and a subfolder package.json (e.g. different names
  // different browser fields etc).

});
