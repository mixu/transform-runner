var pi = require('pipe-iterators'),
    canonicalize = require('../../v2/streams/canonicalize.js'),
    Dedupe = require('file-dedupe'),
    assert = require('assert'),
    fixture = require('file-fixture');

describe('canonicalize tests', function() {

  function dedupePipe(dedupe) {
    return pi.pipeline(
      pi.thru.obj(function(filename, enc, done) {
        var self = this;
        dedupe.find(filename, function(err, result) {
          self.push(filename); // do nothing with the result
          done();
        });
      }),
      pi.map(function(filename) { return { filename: filename, deps: [] }; }),
      pi.reduce(function(acc, entry) { acc.push(entry); return acc; }, []),
//      pi.forEach(function(entry) { console.log(entry); }),
      canonicalize(dedupe)
    );
  }

  it('removes duplicate files from input', function(done) {
    var dedupe = new Dedupe();

    var basedir = fixture.dir({
      'aaaa.js': 'aaaa',
      'bbbb.js': 'aaaa',
      'cccc.js': 'aaaa'
    });

    pi.fromArray([
        basedir + '/aaaa.js',
        basedir + '/bbbb.js',
        basedir + '/cccc.js'
      ])
      .pipe(dedupePipe(dedupe))
      .pipe(pi.toArray(function(results) {
        var result = results[0];
        result.forEach(function(entry) { entry.filename = entry.filename.replace(basedir, ''); });
        assert.deepEqual(result, [ { filename: '/aaaa.js', deps: [] } ]);
        done();
      }));
  });

  it('prefers the shorter of the two paths, even when given the longer one first', function(done) {
    var dedupe = new Dedupe();

    var basedir = fixture.dir({
      'aaaa-aa.js': 'aaaa',
      'bbbb.js': 'aaaa',
      'cccc-c.js': 'aaaa'
    });

    pi.fromArray([
        basedir + '/aaaa-aa.js',
        basedir + '/bbbb.js',
        basedir + '/cccc-c.js'
      ])
      .pipe(dedupePipe(dedupe))
      .pipe(pi.toArray(function(results) {
        var result = results[0];
        result.forEach(function(entry) { entry.filename = entry.filename.replace(basedir, ''); });
        assert.deepEqual(result, [ { filename: '/bbbb.js', deps: [] } ]);
        done();
      }));
  });

});
