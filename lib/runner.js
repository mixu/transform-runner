var fs = require('fs'),
    path = require('path'),
    parallel = require('miniq'),
    microee = require('microee'),
    Dedupe = require('file-dedupe');

var checkOptions = require('./check-options.js'),
    detectiveDependencies = require('./detective-dependencies.js'),
    Matcher = require('./match.js');

// this is the list that's built into npm itself
var npmBuiltIn = [
  new RegExp('/[.]git/'),
  new RegExp('[.]lock-wscript$'),
  /\/[.]wafpickle-[0-9]+$/,
  new RegExp('/CVS/'),
  new RegExp('/[.]svn/'),
  new RegExp('/[.]hg/'),
  /\/[.].*[.]swp$/,
  new RegExp('[.]DS_Store$'),
  /\/[.]_/,
  new RegExp('npm-debug[.]log$')
];

function Runner(opts) {
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
  var self = this;
  // options
  this.opts = opts;
  // cache
  var cachePath = (require('os').tmpDir ? require('os').tmpDir(): require('os').tmpdir()),
      cacheLookup = {};
  this.cache = (opts.cache ? opts.cache : {
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

  this.log = opts.log || console;
  // list of input files that have already been seen
  this._seenFiles = [];
  // shared execution queue
  this._queue = parallel(opts.jobs);
  // result tuple storage
  this._results = [];
  this.resolverOpts = opts['resolver-opts'] || { };

  // cache for detective-dependencies to avoid re-resolving known dependencies
  this.dependencyCache = {};

  // construct this.exclude()
  this.exclude = new Matcher(npmBuiltIn.concat(opts.exclude).filter(Boolean), { basepath: opts.basepath });

  // if there are ignores, create a cache file to act as the placeholder item
  // for ignored files
  this.ignore = (opts.ignore ? new Matcher(opts.ignore, { basepath: opts.basepath }) :
    function() { return false; });

  this.dedupe = new Dedupe();

  // allow users to set the detective mechanism
  this.detective = (opts['amd'] ? require('./amd-dependencies.js') : detectiveDependencies);
}

microee.mixin(Runner);

// check the cache, return a tuple from the cache if already processed
Runner.prototype.hasCached = function(filename, onDone) {
  var self = this;

  function lookup(dupname, filename) {
    var cacheFile, deps, renames;
    // cached stuff:
    // - an output file
    cacheFile = self.cache.get(dupname, 'cacheFile', true);
    // - a set of renamed deps
    deps = self.cache.get(dupname, 'deps');
    // - a set of unnormalized deps
    renames = self.cache.get(dupname, 'renames');

    // the dep targets must also exist: otherwise, removing a file
    // without updating the other files will cause a read error later on
    // In particular, this occurs where ./foo.js becomes ./foo/index.js
    // while the cache retains an entry for "./foo" => './foo.js'
    // Using cache.get() helps a bit since the fs.stats calls are cached
    var dependentFilesExist = deps && Object.keys(deps).every(function(key) {
      var target = deps[key];
      return !!self.cache.get(target, 'cacheFile', true);
    });

    if (!dependentFilesExist) {
      return false;
    }

    // all items must exist in the cache for this to match
    if (cacheFile && deps && renames) {
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
      self.addResult({
          filename: filename,
          content: cacheFile,
          deps: deps,
          renames: renames
      });
      return true;
    }
    return false;
  }

  // check the cache for an entry directly
  if (lookup(filename, filename)) {
    // add an entry for canonicalization
    this.dedupe.find(filename, function() {
      return onDone(null, true);
    });
    return;
  }

  // check dedupe
  this.dedupe.find(filename, function(err, result) {
    if (result) {
      return onDone(null, lookup(result, filename));
    }
    return onDone(null, false);
  });
};

Runner.prototype.add = function(filename) {
  var self = this,
      opts = this.opts;

  // input can be an array of paths
  if (Array.isArray(filename)) {
    filename.forEach(function(filename) {
      self.add(filename);
    });
    return;
  }

  // check that the file has not already been queued
  if (this._seenFiles.indexOf(filename) != -1) {
    return;
  }
  this._seenFiles.push(filename);
  // check that the file does not exist in cache
  self._queue.exec(function(done) {
    self.hasCached(filename, function(err, result) {
      var matchRegExp;
      if (result) {
        self.log.info('Add (reuse)', filename);
        return done();
      }
      // Apply exclusions
      matchRegExp = self.exclude(filename);
      if (matchRegExp) {
        self.log.info('File ' + filename + ' excluded by regexp', matchRegExp.toString(), filename);
        return done();
      }

      self.emit('file', filename);
      self.log.info('Add', filename);

      // Apply --ignore's
      matchRegExp = self.ignore(filename);
      if (matchRegExp) {
        self.log.info('File ' + filename + ' ignored by regexp', matchRegExp.toString(), filename);
        return done();
      }

      // add to queue (and run)
      self._queue.exec(
        function(done) {
          var hasTasks = false;

          if (opts.tasks) {
            hasTasks = opts.tasks(filename, function(err, cacheFile) {
              if (err) {
                return done(err);
              }
              // console.log('task done', tasks, filename, '=>', cacheFile);
              // console.log(cacheFile, fs.readFileSync(cacheFile).toString());

              // cache the output file name
              self.cache.set(filename, 'cacheFile', cacheFile, true);

              // at the end, the result file has to be parsed
              // 1) the real cache file must be piped in
              // 2) but the dependency resolution itself must be done using the
              // original location!
              self.parseAndUpdateDeps(filename, cacheFile, done);
            });
          }

          if (!hasTasks) {
            // cache the output file: in this case, it'll be a direct reference to
            // the file itself
            self.cache.set(filename, 'cacheFile', filename, true);

            // run the parse-and-update-deps task
            return self.parseAndUpdateDeps(filename, filename, done);
          }
        });
      done();
    });
  });
};

Runner.prototype.parseAndUpdateDeps = function(filename, cacheFile, done) {
  var self = this;
  this.detective(filename, cacheFile, this.opts.ignore, this.dependencyCache,
    this.resolverOpts, self.log, function(err, deps, renames) {
    // do not store result when an error occurs
    if (!err) {
      // self.log.info('Cache parse result:', filename);
      // store the dependencies
      self.cache.set(filename, 'deps', deps);
      // store the renamed dependencies
      self.cache.set(filename, 'renames', renames);
    } else {
      self.log.info('Skipping cache due to errors:', filename, err);
      (Array.isArray(err) ? err : [ err ]).forEach(function(err) {
        self.emit('parse-error', err);
      });
    }
    self.emit('miss', filename);
    self.addResult({
      filename: filename,
      content: cacheFile,
      deps: deps,
      renames: renames
    });
    // queue has been updated, finish this task
    done();
  });
};

Runner.prototype.addResult = function(result) {
  var self = this;
  this._results.push(result);

  // console.log(result.filename, result);

  self.emit('file-done', result.filename, result);
  // add deps to the queue -> this also queues further tasks
  Object.keys(result.deps).map(function(rawDep) {
    return result.deps[rawDep];
  }).filter(function(dep) {
    // since deps may contain references to external modules, ensure that the items start with
    // . or /
    return dep.charAt(0) == '/' || dep.charAt(0) == '.';
  }).sort().forEach(function(dep) {
    self.add(dep);
  });
};

Runner.prototype.exec = function(onDone) {
  var self = this;
  this._queue.once('empty', function() {
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
    self.dedupe.canonicalize(function(err, map) {
      var removed = {};

      self._results = self._results.filter(function(file) {
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
      self._results.forEach(function(file) {
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
      self._results.sort(function(a, b) {
        return a.filename.localeCompare(b.filename);
      });

      // console.log('Removed:', Object.keys(removed).length);
      /*
      var resultstr = '';

      self._results.forEach(function(file) {
        resultstr += (file.filename + ' ' + JSON.stringify(file.deps) + ' ' + JSON.stringify(file.renames) + '\n');
      });

      var hash = require('crypto').createHash('md5').update(resultstr).digest('base64');
      console.log('Total:', self._results.length);
      console.log('Hash:', hash);
      */

      self.emit('done', null, self._results);
      if (onDone) {
        onDone(null, self._results);
      }

    });
  });
};

module.exports = Runner;
