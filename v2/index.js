var fs = require('fs'),
    path = require('path'),
    pi = require('pipe-iterators'),
    Dedupe = require('file-dedupe'),
    xtend = require('xtend'),
    checkOptions = require('../lib/check-options.js');

// v2 deps
var filterExcluded = require('./streams/filter-excluded.js'),
    filterIgnored = require('./streams/filter-ignored.js'),
    filterSeen = require('./streams/filter-seen.js'),
    canonicalize = require('./streams/canonicalize.js'),
    toBuildTask = require('./streams/to-build-task.js'),
    annotatePackage = require('./streams/annotate-package.js'),
    getPackageTransforms = require('./streams/get-package-transforms.js'),
    InMemoryCache = require('./lib/in-memory-cache.js'),
    isInCache = require('./lib/is-in-cache.js');
// end v2 deps

// detectives

var Detective = require('./detective/commonjs.js'),
    AMDetective = require('./detective/amd.js');

module.exports = function(opts) {
  checkOptions('Runner', opts, {
    required: {

      // include == array of paths to process
      // main == array of paths considered to be main
      // --> note that main paths must be dirs in current impl

      include: 'Array of absolute globs to resolve. ' +
               'Relative to absolute conversion is relegated to the caller. ',

      ignore: 'Array of absolute globs. Any dependency matching an ignore expression will be ' +
              'instead retargeted at the empty ignore file.',
      remap: 'Array of absolute globs with targets. ' +
             'Targets must be paths to files on disk: the caller must either write the necessary files, ' +
             'or resolve the targets (dep => other file or dep => other module).',
      jobs: 'Int, number of parallel jobs to run'
    },
    optional: {
      command: 'Command str',
      cache: 'Instance of minitask.cache',
      log: 'logger instance',
      exclude: 'Array of absolute globs.',
      'resolver-opts': 'Options passed to the resolver',
      'amd': 'Whether to use the AMD resolver rather than the CommonJS resolver'
    }
  });

  // cache
  var cache = (opts.cache ? opts.cache : new InMemoryCache());
  var log = opts.log || console;
  var dedupe = new Dedupe();

  // resolve args

  // --include
  var initial = includeToPaths(opts.include);
  // --main
  var isMain = isMain(opts.include);

  // --exclude, --ignore, --remap: strings to globs
  opts.exclude = opts.exclude.map(function(str) {
    return minimatch.filter(str);
  });
  opts.ignore = opts.ignore.map(function(str) {
    return minimatch.filter(str);
  });
  opts.remap.forEach(function(pair, i) {
    opts.remap[i][0] = minimatch.filter(pair[0]);
  });


  // construct remap from --ignore and --remap: array of functions,
  // each returns the canonical target
  var remapExpressions = makeRemaps(opts.ignore, opts.remap);

  // allow users to set the detective mechanism
  var detectiveOpts = xtend(
        {
          remap: remapExpressions,
          log: opts.log
        },
        opts['resolver-opts'] || { }
      ),
      detective = (opts['amd'] ? new AMDetective(detectiveOpts) : new Detective(detectiveOpts));

  // --- end init ---

  // How it works:
  // - initial arguments are all processed
  // - input path completion is tracked by notifying that an item is completed
  // - completion:
  //  - getting filtered out
  //  - reaching the end of the pipeline
  // - the pipeline is kept open until there are no pending tasks

  var pending = 0,
      complete = 0;

  function completed(filename) {
    pending--;
    complete++;
    if (pending === 0) {
      input.end();
    }
  }


  var input = pi.pipeline([

    // filter out seen files to avoid reprocessing
    filterSeen(completed),
    // filter out excluded files (+ npm exclusions)
    filterExcluded(opts.exclude, log, completed),
    // filter out ignored files
    filterIgnored(opts.ignore, log, completed),

    pi.matchMerge(
      isInCache(cache, dedupe),
      pi.map(function(filename) {
        // the file exists in the cache:
        return function(done) {
          var cacheFile = cache.get(filename, 'cacheFile', true);
          var deps = cache.get(filename, 'deps');

          /*

          TODO:
          - consider making these properties of the entry and doing all the emitting
            from just one place
          - also, make the emitting occur at the last stream so that one can
            listen at the end of the pipeline for events relevant to reporting


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
            deps: deps
          });
        };
      }),

      // two different processing pipelines:
      pi.pipeline((!opts['amd'] ?
        // - commonjs
        [
          // Locate the package.json file for this file in order to read the
          // the "browser" and "browserify.transform" fields.
          annotatePackage(isMain),
          // If the file is annotated as isMain, attach the main tasks to entry.tasks
          // If the file is from another package and has a "browserify" field, apply the
          // transforms in that field.
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
          // make tasks - which includes resolving deps and dealing with --ignore, --remap etc
          toBuildTask({
            cache: cache,
            detective: function(content, filepath, onDone) {
              detective.resolveDeps(content, filepath, onDone);
            }
          })
        ] :
        // - amd
        [
          // execute plugins on files that contain an exclamation mark
          addTasksForPluginFiles(opts.plugins)
        ])
      )
    ),
    // - run each task
    //    - xforms are fns that return thru streams
    //    - commands are child process invocations wrapped as streams

    pi.parallel(opts.jobs, function(task, enc, done) {
      var stream = this;
      task.call(this, function(err, result) {
        // do not store result when an error occurs
        if (!err) {
          // self.log.info('Cache parse result:', result.filename);
          // store the dependencies
          cache.set(result.filename, 'deps', result.deps);
          cache.set(result.filename, 'cacheFile', result.content, true);

        } else {
          log.info('Skipping cache due to errors:', result.filename, err);
          (Array.isArray(err) ? err : [ err ]).forEach(function(err) {
            stream.emit('parse-error', err);
          });
        }
        stream.emit('miss', result.filename);

        if (result) {


//          self.emit('file-done', result.filename, result);
          // CommonJS: only process file paths; for non-file paths, simply keep the
          // dep with no processing (e.g. when resolution fails)
          if (!opts.amd) {

            // TODO:
            // move the filters to the top - no files in the pipeline should
            // be anything other than abspaths
            //
            // Same goes for AMD, no vendor files are allowed.


            // add deps to the queue -> this also queues further tasks
            Object.keys(result.deps).map(function(rawDep) {
              return result.deps[rawDep];
            }).filter(function(dep) {
              // since deps may contain references to external modules, ensure that the items start with
              // . or /
              return dep.charAt(0) == '/' || dep.charAt(0) == '.';
            }).sort().forEach(function(dep) {
              pending++;
              input.write(dep);
            });
          } else {
            // AMD: do not process vendor files
            Object.keys(result.deps).filter(function(dep) {
              return !opts.vendor[dep];
            }).map(function(rawDep) {
              return result.deps[rawDep];
            }).sort().forEach(function(dep) {
              pending++;
              input.write(dep);
            });
          }

          // - queue dependencies for processing
          // MUST occur after pending tasks are written
          stream.push(result);

        }
        done(err);
      });
    }),
    // end queue:
    pi.reduce(function(acc, entry) {
      acc.push(entry);
      completed(entry.filename);
      return acc;
    }, []),

    canonicalize(dedupe)

  ]);

  // write initial
  initial.forEach(function(filepath) {
    pending++;
    input.write(filepath);
  });

  // TODO is the last thru necessary?

  return input.pipe(pi.thru.obj());
};
