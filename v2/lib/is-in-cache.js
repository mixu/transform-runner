module.exports = function(cache, dedupe) {

  return function(filename, index, done) {
    function lookup(dupname, filename) {
      // cached stuff:
      // - an output file
      var cacheFile = cache.get(dupname, 'cacheFile', true);
      // - a set of unnormalized deps
      var deps = cache.get(dupname, 'deps');

      // the dep targets must also exist: otherwise, removing a file
      // without updating the other files will cause a read error later on
      // In particular, this occurs where ./foo.js becomes ./foo/index.js
      // while the cache retains an entry for "./foo" => './foo.js'
      // Using cache.get() helps a bit since the fs.stats calls are cached
      var dependentFilesExist = deps && Object.keys(deps).every(function(key) {
        var target = deps[key];
        return !!cache.get(target, 'cacheFile', true);
      });

      if (!dependentFilesExist) {
        return false;
      }

      // all items must exist in the cache for this to match
      return (cacheFile && deps);
    }

    // check the cache (sync)
    if (lookup(filename, filename)) {
      dedupe.find(filename, function() { done(null, true); });
      return;
    }
    // check dedupe (async), and then check the cache (sync)
    dedupe.find(filename, function(err, result) {
      return done(null, (result ? lookup(result, filename) : false));
    });
  };
};
