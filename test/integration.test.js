var fs = require('fs'),
    pi = require('pipe-iterators'),
    run = require('../v2/index'),
    assert = require('assert-diff'),
    fixture = require('file-fixture');

function assertContainsArr(actual, expected) {
  expected.forEach(function(item) {
    Object.keys(item).forEach(function(key) {
      assert.equal(actual[key], expected[key]);
    });
  });
}

describe('to-build-task wrapper tests', function() {

  function stripBase(base) {
    function strip(s) { return s.replace(base, ''); }
    return pi.pipeline(
      pi.thru.obj(function(task, enc, done) {
        var self = this;
        task(function(err, result) {
          if (err) { self.emit('error', err); }
          self.push(result);
          done();
        });
      }),
      pi.mapKey({
        filename: strip,
        content: strip,
        deps: function(ob) {
          Object.keys(ob).forEach(function(rawName) {
            ob[rawName] = strip(ob[rawName]);
          });
          return ob;
        }
      }));
  }


  it('it accepts a filename and returns a task that returns a result', function(done) {
    var base = fixture.dir({
      'aaaa.js': 'var a = require("b");',
      'node_modules/b.js': 'module.exports = "b"'
    });

    pi.fromArray([ base + '/aaaa.js' ])
      .pipe(run({
        include: base,
        jobs: 1,
        cache: false,
        log: console
      })).pipe(pi.toArray(function(results) {
        //console.log(require('util').inspect(results[0], null, 20, true));
        assert.deepEqual(results[0], [
          { filename: base + '/aaaa.js',
            content: base + '/aaaa.js',
            deps: { b: base + '/node_modules/b.js' },
            renames: [] },
          { filename: base + '/node_modules/b.js',
            content: base + '/node_modules/b.js',
            deps: {},
            renames: [] }
        ]);
        done();
      }));
  });

  // currently remap is implemented higher up
  xit('works with --remap module=code', function(done){
    // translate to { browser: { module: file-with-code } }
  });

  xit('works with --remap module=require("foo")', function(done) {

  });

  xit('works with --remap module=require("./path/to/file")', function(done) {

  });

  it('works with --ignore ./file', function(done) {
    var base = fixture.dir({
      'a.js': 'module.exports = "a";',
      'b.js': 'module.exports = "b";'
    });

    pi.fromArray([ base + '/a.js', base + '/b.js', ])
      .pipe(run({
        include: base,
        jobs: 1,
        cache: false,
        log: console,
        ignore: base + '/b.js'
      })).pipe(pi.toArray(function(results) {
        // console.log(require('util').inspect(results[0], null, 20, true));
        assert.deepEqual(results[0], [
           { filename: base + '/a.js',
             content: base + '/a.js',
             deps: {},
             renames: [] }
        ]);

        done();
      }));
  });

  it('works with --ignore module', function(done) {
    var base = fixture.dir({
      'a.js': 'module.exports = "a";',
      '/node_modules/b/index.js': 'module.exports = "b";'
    });

    pi.fromArray([ base + '/a.js', base + '/node_modules/b/index.js', ])
      .pipe(run({
        include: base,
        jobs: 1,
        cache: false,
        log: console,
        ignore: base + '/node_modules/b/'
      })).pipe(pi.toArray(function(results) {
        // console.log(require('util').inspect(results[0], null, 20, true));
        assert.deepEqual(results[0], [
           { filename: base + '/a.js',
             content: base + '/a.js',
             deps: {},
             renames: [] }
        ]);

        done();
      }));

  });


  it('can run --commands', function(done) {
    var base = fixture.dir({
      'a.js': 'module.exports = "a";'
    });
    pi.fromArray([ base + '/a.js' ])
      .pipe(run({
        include: base,
        jobs: 1,
        cache: false,
        log: console,
        command: 'bash -c "echo \'module.exports = \"BAR\";\'"'
      })).pipe(pi.toArray(function(results) {
        // console.log(require('util').inspect(results[0], null, 20, true));
        assert.equal(results[0][0].filename, base + '/a.js');
        assert.equal(fs.readFileSync(results[0][0].content, 'utf8') ,'module.exports = "BAR";\n');
        done();
      }));
  });

  it('parses the output from the --command', function(done) {
    var base = fixture.dir({
      'a.js': 'module.exports = "a";',
      'other.js': 'module.exports = "OTHER";'
    });
    pi.fromArray([ base + '/a.js' ])
      .pipe(run({
        include: base,
        jobs: 1,
        cache: false,
        log: console,
        command: 'bash -c "echo \'module.exports = require(\"./other\");\'"'
      })).pipe(pi.toArray(function(results) {
        // console.log(require('util').inspect(results[0], null, 20, true));
        assertContainsArr(results[0], [
          { filename: base + '/a.js',
            deps: { './other': '/tmp/rvlh27f1vyhqia4i/other.js' },
            renames: [] },
          { filename: base + '/other.js',
            deps: { './other': '/tmp/rvlh27f1vyhqia4i/other.js' },
            renames: [] }
        ]);

        done();
      }));


  });


  // ???
  // - should the files have an annotation with the package name?
  // - should the files have an annotation with the package.json file associated with that package?


  xit('--command only applies to the root package file');
  xit('can run --transforms');
  xit('--transform only applies to the root package file');

  // browser field support

  // browserify field support
  // - "transforms": 'foo'

  xit('applies the "transforms" field from package.json to that package');

  // - "transforms": [ 'foo', 'bar' ]

  xit('applies multiple transforms in the "transforms" field to that package');

  // - "transforms": [["fff",{"x":3}],["ggg",{"y":4}]]

  xit('passes arguments to constructors specified in the transforms field to that package');

});
