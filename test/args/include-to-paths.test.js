var assert = require('assert-diff'),
    fixture = require('file-fixture');

describe('include to paths', function() {

  it('works with a single file', function() {
    var base = fixture.dir({
      'index.js': 'require("a");',
    });

    assert.deepEqual(includeToPaths(base),
      [ base + '/index.js' ]);
  });

  it('works with a wildcard', function() {
    var base = fixture.dir({
      'index.js': 'require("a");',
    });

    assert.deepEqual(includeToPaths(base + '/**'),
      [ base + '/index.js' ]);
  });

  it('works with two folders', function() {
    var base = fixture.dir({
      'a/index.js': 'require("a");',
      'b/index.js': 'require("a");',
    });

    assert.deepEqual(includeToPaths([base + 'a/**', base + 'b/**']),
      [ base + '/a/index.js', base + '/b/index.js' ]);
  });

});
