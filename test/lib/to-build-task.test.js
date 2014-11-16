var pi = require('pipe-iterators'),
    toBuildTask = require('../../v2/streams/to-build-task.js'),
    assert = require('assert'),
    fixture = require('file-fixture');

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

  function noTasks() { return []; }

  function optsToTaskHash(opts) {

  }

  // taskHash is an array of function(filename) { return DuplexStream || null }
  function tasksFromHash(filename, taskMatchers) {
    return taskMatchers.map(function(matcher) { return matcher(filename); } ).filter(Boolean);
  }


  it('it accepts a filename and returns a task that returns a result', function(done) {
    var basedir = fixture.dir({
      'aaaa.js': 'var a = require("b");',
      'node_modules/b.js': 'module.exports = "b"'
    });

    pi.fromArray(basedir + '/aaaa.js')
      // return value from toBuildTask should be a task - which runs all the subtasks and then finally does the parse stuff)
      .pipe(toBuildTask({
        // return value should be an (empty) array of transforms. Called WHEN the parent
        // function is executed, e.g. does not cause anything to be instantiated before
        // the task starts running.
        getTasks: noTasks,
        cache: { filename: function() { return basedir + '/tempfile'; } },
        detective: require('../../lib/detective-dependencies.js'),
        log: console,
        ignore: [],
        'resolver-opts': {}
      }))
      .pipe(stripBase(basedir))
      .pipe(pi.toArray(function(results) {
        // console.log(results);
        assert.deepEqual(results[0], {
          filename: '/aaaa.js',
          content: '/aaaa.js',
          deps: { b: '/node_modules/b.js' },
          renames: []
        });
        done();
      }));
  });

  it('works with --remap module=code', function(done){
    // translate to { browser: { module: file-with-code } }
  });

  it('works with --remap module=require("foo")', function(done) {

  });

  it('works with --remap module=require("./path/to/file")', function(done) {

  });

  it('works with --ignore ./file', function(done) {

  });

  it('works with --ignore module', function(done) {

  });


  it('can run --commands', function(done) {

    // the end result should reflect the parsed result after applying the parse
    done();
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
