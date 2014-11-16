var pi = require('pipe-iterators');

module.exports = function(dedupe) {

  return pi.thru.obj(function(results, enc, done) {
    var self = this;
    // Dedupe returns matches based on what it has seen thus far, but
    // we have no efficient way to force the async I/O to return targets
    // in a deterministic order (running everything serially would work but
    // would be too slow). Rather than trying to limit parallelism to ensure
    // consistent iteration order, apply canonicalization after the fact since issues
    // only really happen when race conditions occur between duplicate files, resulting
    // in a small amount of additional (duplicated) work.
    //
    // Here, we will undo the additional work at the end to force consistent results in
    // spite of the iteration order/dedupe results different across runs by discarding any
    // additional work. This gets us the benefits of deduplication and maximum parallelism
    // with a bit of cleanup work.
    dedupe.canonicalize(function(err, map) {
      var removed = {};

      results = results.filter(function(file) {
        if (!map[file.filename]) {
          return true;
        }
        // find files which are duplicates

        // find out which files have a different dedupe result from the initial one
        var hasCanonicalName = (file.filename == map[file.filename]);
        if (!hasCanonicalName) {
          // console.log(file.filename, 'canonical', map[file.filename]);
          // remove those files
          removed[file.filename] = map[file.filename];
          // store the dependencies of replaced files: these can be duplicates themselves (most cases)
          // or they can be non-duplicates that are not supposed to be included
          return false;
        }
        return true;
      });

      // fix deps
      results.forEach(function(file) {
        Object.keys(file.deps).forEach(function(dep) {
          var target = file.deps[dep];
          if (removed[target]) {
            file.deps[dep] = removed[target];
          }
        });
      });

      // scan the dependencies of replaced files and ref count them
      // if the ref count is 0 after canonicalization, exclude the referred files
      // ideally, this should actually be a trace from the include roots to all connected components

      // always sort results for consistency and easy testing
      results.sort(function(a, b) {
        return a.filename.localeCompare(b.filename);
      });

      self.push(results);
      done();
    });
  });
};
