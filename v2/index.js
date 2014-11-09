var pi = require('pipe-iterators');

module.exports = function(opts) {
  var seenFiles = [];

  // construct this.exclude()
  var exclude = new Matcher(npmBuiltIn.concat(opts.exclude).filter(Boolean), { basepath: opts.basepath });

  // if there are ignores, create a cache file to act as the placeholder item
  // for ignored files
  var ignore = (opts.ignore ? new Matcher(opts.ignore, { basepath: opts.basepath }) :
    function() { return false; });

  var inputEnded = false,
      input = pi.writable.obj(function(filename, enc, done) {
        // every initial entry into the head
        function write() {
          if (!firstWritable) {
            first.once('drain', write);
          } else {
            firstWritable = first.write(filename);
            done();
          }
        }
        write();
        // the first stream is only ended when the queue becomes empty (so you can just pipe here,
        // but the pipe won't kill the pipeline's head before the queue is also empty)
      }).once('finish', function() { inputEnded = true; }),
      firstWritable = true,
      first = pi.thru.obj().on('drain', function() {
        firstWritable = true;
      });

  var pipeline = [
    first,

    // check that the file has not already been queued
    pi.filter(function(filename) {
      var isSeen = seenFiles.indexOf(filename) != -1;
      if (!isSeen) {
        seenFiles.push(filename);
      }
      return isSeen;
    }),
    // Apply exclusions
    pi.filter(function(filename) {
      var isExcluded = exclude(filename);
      if (isExcluded) {
        log.info('File ' + filename + ' excluded by regexp', isExcluded.toString(), filename);
      }
      return isExcluded;
    }),

    // Apply --ignore's
    pi.filter(function(filename) {
      var isIgnored = ignore(filename);
      if (isIgnored) {
        log.info('File ' + filename + ' ignored by regexp', isIgnored.toString(), filename);
      }
      return isIgnored;
    }),

    pi.matchMerge(
      function(filename, index, done) {
        // check the cache (sync)
        // check dedupe (async), and then check the cache (sync)
      },
      pi.map(function(filename) {
        // the file exists in the cache:
        return function(done) {
          // - push the cache result out
          done(null, {
            filename: filename,
            content: cacheFile,
            deps: deps,
            renames: renames
          });
        };
      }),
      pi.map(function() {
        // - get tasks
        // - add the parse-and-update-deps task
        //  - run detective
        //  - update the cache entry with the detective result
      })
    ),
    // - run each task
    //    - xforms are fns that return thru streams
    //    - commands are child process invocations wrapped as streams
    pi.queue(opts.jobs, function(task, done) {
      var stream = this;
      task(function(err, result) {
        if (result) {
          // - queue dependencies for processing
          stream.push(result);
        }
        done(err);
      });
    }).on('empty', function() {
      // the queue is empty. This can only happen if 1) every task has run and 2)
      // no task queued any further dependencies after being run - that is,
      // we processed the last items in the tree.
      if (inputEnded) {
        // if the user still wants to write to the stream, do not end the pipeline yet
        first.end();
      }
    }),
    // end queue:
    pi.reduce(function(acc, entry) { acc.push(entry); return acc; }, []),
    pi.thru.obj(function(entries, enc, done) {
      // - apply dedupe canonicalization

      // - sort by name
    })
  ];

  return pi.combine(
    // write into a disposable stream to avoid prematurely closing the processing pipeline
    input,
    // read from the end of the pipeline
    pi.tail(pipeline)
  );
};
