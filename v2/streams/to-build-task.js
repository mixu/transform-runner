var fs = require('fs'),
    path = require('path'),
    pi = require('pipe-iterators');

module.exports = function(opts) {
  var cache = opts.cache,
      // detective is a function(content, filename, onDone) -> (err, deps)
      detective = opts.detective;

  return pi.map(function(item) {
    var filename = item.filename;
    // - get tasks
    var self = this;

    // called by the task execution engine to run all the tasks on this file
    // done(err, result) - if err is set then result is not cached
    return function(done) {
      if (path.extname(filename) === '.json') {
        // json files: read and wrap

        // generate new filename
        var cacheFile = cache.filepath();
        // write wrapped version
        fs.writeFileSync(cacheFile, 'module.exports = ' +
          fs.readFileSync(file.content, 'utf8'));

        return done(null, {
            filename: filename,
            content: cacheFile,
            deps: {}
          });
      }

      var tasks = item.tasks;

      if (tasks && tasks.length > 0) {
        // generate new filename
        var cacheFile = cache.filepath();

        // initialize tasks (function(filename) { } -> stream
        var streams = tasks.map(function(task) {
          return task(filename);
        }).filter(Boolean);

        fs.createReadStream(filename)
          .pipe(pi.pipeline(streams))
          // reduce to single string
          .pipe(pi.reduce(function(acc, chunk) { return acc += chunk; }, ''))
          .pipe(pi.forEach(function(content) {
            // at the end, the result file has to be parsed
            // 1) the real cache file must be piped in
            // 2) but the dependency resolution itself must be done using the
            // original location!
            detective(content, filename, function(err, deps) {
              // finish this task (don't wait for the cache write????)
              done(err, {
                filename: filename,
                content: cacheFile,
                deps: deps
              });
            });
          }))
          .pipe(fs.createWriteStream(cacheFile));
      } else {
        detective(fs.readFileSync(filename, 'utf8'), filename, function(err, deps) {
          done(err, {
            filename: filename,
            // cache the output file: in this case, it'll be a direct reference to
            // the file itself
            content: filename,
            deps: deps
          });
        });
      }
    };
  });
};
