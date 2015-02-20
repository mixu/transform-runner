var fs = require('fs'),
    path = require('path'),
    pi = require('pipe-iterators'),
    Dedupe = require('file-dedupe');

// v2 deps
var filters = require('./streams/filters.js'),
    canonicalize = require('./streams/canonicalize.js'),
    toBuildTask = require('./streams/to-build-task.js'),
    annotatePackage = require('./streams/annotate-package.js'),
    getPackageTransforms = require('./streams/get-package-transforms.js');
// end v2 deps


var checkOptions = require('./check-options.js'),
    detectiveDependencies = require('./detective-dependencies.js');

module.exports = function(opts) {
  checkOptions('Runner', opts, {
    required: {
      include: 'Array of files to process',
      jobs: 'Int, number of parallel jobs to run'
    },
    optional: {
      cache: 'Instance of minitask.cache',
      tasks: 'Function for getting tasks',
      log: 'logger instance',
      exclude: 'Array of strings to be matched against files (converted to file / dir regexps)',
      ignore: 'Array of strings to be matched against files (converted to file / dir regexps) ' +
              'Ignore opts are also passed directly to the resolver as strings and any matching ' +
              'dependency (user-facing) names are ignored when attempting to resolve dep targets.',
      'resolver-opts': 'Options passed to the resolver',
      'amd': 'Whether to use the AMD resolver rather than the CommonJS resolver'
    }
  });

  // cache
  var cachePath = (require('os').tmpDir ? require('os').tmpDir(): require('os').tmpdir()),
      cacheLookup = {};
  var cache = (opts.cache ? opts.cache : {
    get: function(filename, key, isPath) {
      return (cacheLookup[filename] ? cacheLookup[filename][key] : undefined);
    },
    set: function(filename, key, value, isPath) {
      if(!cacheLookup[filename]) {
        cacheLookup[filename] = {};
      }
      cacheLookup[filename][key] = value;
    },
    filepath: function() {
      var cacheName;
      // generate a new file name
      do {
        cacheName = cachePath + '/' + Math.random().toString(36).substring(2);
      } while(fs.existsSync(cacheName));
      return cacheName;
    }
  });

  var log = opts.log || console;
  var resolverOpts = opts['resolver-opts'] || { };

  // cache for detective-dependencies to avoid re-resolving known dependencies
  var dependencyCache = {};

  var dedupe = new Dedupe();

  // allow users to set the detective mechanism
  var detective = (opts['amd'] ? require('./amd-dependencies.js') : detectiveDependencies);

  // --- end init ---

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

  var pipeline = [ first ]
    .concat(filters({ exclude: opts.exclude, ignore: opts.ignore, basepath: opts.basepath, log: log }))
    .concat([
    pi.matchMerge(
      function(filename, index, done) {

        function lookup(dupname, filename) {
          // cached stuff:
          // - an output file
          var cacheFile = cache.get(dupname, 'cacheFile', true);
          // - a set of renamed deps
          var deps = cache.get(dupname, 'deps');
          // - a set of unnormalized deps
          var renames = cache.get(dupname, 'renames');

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
          return (cacheFile && deps && renames);
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
      },
      pi.map(function(filename) {
        // the file exists in the cache:
        return function(done) {
          var cacheFile = cache.get(dupname, 'cacheFile', true);
          var deps = cache.get(dupname, 'deps');
          var renames = cache.get(dupname, 'renames');

          /*
          self.emit('file', filename);
          // caching should have the exact same effect as full exec
          // push the result and add deps
          if (dupname == filename) {
            self.emit('hit', filename);
          } else {
            // consider deduplication hits as cache misses
            self.emit('miss', filename);
            self.emit('dedupe', filename);
          }
          */

          // - push the cache result out
          done(null, {
            filename: filename,
            content: cacheFile,
            deps: deps,
            renames: renames
          });
        };
      }),
      pi.pipeline([
        // the "browser" and "browserify.transform" fields
        // are applied at a package level - hence we need to annotate
        // files with their current package
        annotatePackage(),
        // this fetches the "browser" field information for dep processing
        getPackageTransforms({
          // the input to this transform is the set of main scoped commands, transforms etc.
          command: opts.command,
          'global-command': opts['global-command'],
          transform: opts.transform,
          'global-transform': opts['global-transform'],
          // try from process.cwd()
          // try from current directory (e.g. global modules)
          moduleLookupPaths: [ process.cwd(), __dirname ]
        }),
        // make tasks
        toBuildTask(taskFn, cache)
      ])
    ),
    // - run each task
    //    - xforms are fns that return thru streams
    //    - commands are child process invocations wrapped as streams

    pi.queue(opts.jobs, function(task, enc, done) {
      var stream = this;
      task.call(this, function(err, result) {

        // do not store result when an error occurs
        if (!err) {
          // self.log.info('Cache parse result:', filename);
          // store the dependencies
          self.cache.set(filename, 'deps', deps);
          // store the renamed dependencies
          self.cache.set(filename, 'renames', renames);

          cache.set(filename, 'cacheFile', content, true);

        } else {
          self.log.info('Skipping cache due to errors:', filename, err);
          (Array.isArray(err) ? err : [ err ]).forEach(function(err) {
            self.emit('parse-error', err);
          });
        }
        self.emit('miss', filename);

        if (result) {


          // - queue dependencies for processing
          stream.push(result);

//          self.emit('file-done', result.filename, result);
          // add deps to the queue -> this also queues further tasks
          Object.keys(result.deps).map(function(rawDep) {
            return result.deps[rawDep];
          }).filter(function(dep) {
            // since deps may contain references to external modules, ensure that the items start with
            // . or /
            return dep.charAt(0) == '/' || dep.charAt(0) == '.';
          }).sort().forEach(function(dep) {
            first.write(dep);
          });
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

    canonicalize(dedupe)
  ];

  return pi.combine(
    // write into a disposable stream to avoid prematurely closing the processing pipeline
    input,
    // read from the end of the pipeline
    pi.tail(pipeline)
  );
};

