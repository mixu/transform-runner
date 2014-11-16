var fs = require('fs'),
    path = require('path'),
    pi = require('pipe-iterators');

module.exports = function(opts) {

  var getTasks = opts.getTasks,
      cache = opts.cache,
      detective = opts.detective,
      log = opts.log;

  // cache for detective-dependencies to avoid re-resolving known dependencies
  var dependencyCache = {};

  function parseAndUpdateDeps(content, filename, onDone) {
    detective(content, filename, opts.ignore, dependencyCache,
      opts['resolver-opts'] || { }, log, onDone);
  }

  return pi.map(function(filename) {
    // - get tasks
    var self = this;

    // called by the task execution engine to run all the tasks on this file
    // done(err, result) - if err is set then result is not cached
    return function(done) {
      // any non-json files
      if (path.extname(filename) === '.json') {
        return done(null, { filename: filename, content: filename, deps: {}, renames: []});
      }

      var tasks = ( null);
      if (getTasks) {
        tasks = getTasks(filename);
      }

      if (tasks && tasks.length > 0) {
        // generate new filename
        var cacheFile = cache.filepath();
        fs.createReadStream(filename)
          .pipe(tasks)
          // reduce to single string
          .pipe(pi.reduce(function(acc, chunk) { return acc += chunk; }, ''))
          .pipe(pi.forEach(function(content) {
            // at the end, the result file has to be parsed
            // 1) the real cache file must be piped in
            // 2) but the dependency resolution itself must be done using the
            // original location!
            parseAndUpdateDeps(content, filename, function(err, deps, renames) {
              // finish this task (don't wait for the cache write????)
              done(err, {
                filename: filename,
                content: cacheFile,
                deps: deps,
                renames: renames
              });
            });
          }))
          .pipe(fs.createWriteStream(cacheFile));
      } else {
        parseAndUpdateDeps(fs.readFileSync(filename), filename, function(err, deps, renames) {
          done(err, {
            filename: filename,
            // cache the output file: in this case, it'll be a direct reference to
            // the file itself
            content: filename,
            deps: deps,
            renames: renames
          });
        });
      }
    };
  });
};
