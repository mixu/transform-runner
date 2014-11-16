var pi = require('pipe-iterators'),
    filters = require('../../v2/streams/filters.js'),
    assert = require('assert');

describe('test filters', function() {

  it('filters using the npm built-in ignore list', function(done) {
    pi.fromArray([
      '/a/.git/config',
      '/a/.git/foo/bar',
      '/a/.lock-wscript',
      '/a/.lock-wscript-keepme',
      '/a/.wafpickle-1',
      '/a/.wafpickle-2-keepme',
      '/a/CVS/foo',
      '/a/.svn/foo',
      '/a/.hg/foo',
      '/a/.foobar.swp',
      '/a/keepme.swp',
      '/a/.DS_Store',
      '/a/.DS_Store/keepme',
      '/a/.DS_Store-keepme',
      '/a/._',
      '/a/npm-debug.log',
      '/a/npm-debug.log/keepme',
      '/a/npm-debug.log-keepme'
    ])
    .pipe(pi.pipeline(filters()))
    .pipe(pi.toArray(function(results) {
      assert.deepEqual(results, [
        '/a/.lock-wscript-keepme',
        '/a/.wafpickle-2-keepme',
        '/a/keepme.swp',
        '/a/.DS_Store/keepme',
        '/a/.DS_Store-keepme',
        '/a/npm-debug.log/keepme',
        '/a/npm-debug.log-keepme'
      ]);
      done();
    }));
  });

});
