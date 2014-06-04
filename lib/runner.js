var fs = require('fs'),
    path = require('path'),
    parallel = require('miniq'),
    microee = require('microee');

var checkOptions = require('./check-options.js'),
    filterNpm = require('./filter-npm.js'),
    detectiveDependencies = require('./detective-dependencies.js');

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
      exclude: 'Array of regexps',
      ignore: 'Array of strings',
      'gluejs-version': 'Version key, used for cache invalidation',
      'resolver-opts': 'Options passed to the resolver'
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

  // Exclude files using the npmjs defaults for file and path exclusions
  this.excludeChecks = [
    function(filename) {
      if (!filterNpm(filename)) {
        self.log.info('Excluded by npm\'s built-in ignore list:', filename);
        return false;
      }
      return true;
    }
  ];

  // If there are any default or user-defined excludes, apply them
  if (opts.exclude) {
    // convert strings to regexp
    opts.exclude = opts.exclude.map(function(str) {
      if (typeof str === 'string') {
        return new RegExp(str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&"));
      }
      return str;
    });
    this.excludeChecks.push(function(filename) {
      return !opts.exclude.some(function(expr) {
        if (filename.match(expr)) {
          self.log.info('Excluded by regexp', expr, ':', filename);
          return true;
        }
      });
    });
  }

  this.ignoreChecks = [];
  // if there are ignores, create a cache file to act as the placeholder item
  // for ignored files
  this.ignoreFile = '';
  this.ignore = false;
  if (opts.ignore) {
    this.ignore = opts.ignore;
    this.ignoreChecks.push(function(filename) {
      return opts.ignore.indexOf(filename) === -1;
    });
    this.ignoreFile = this.cache.filepath() + '.js';
    fs.writeFileSync(this.ignoreFile, 'module.exports = {};');
  }
}

microee.mixin(Runner);

// check the cache, return a tuple from the cache if already processed
Runner.prototype.hasCached = function(filename) {
  var cacheFile, deps, renames;
  // cached stuff:
  // - an output file
  cacheFile = this.cache.get(filename, 'cacheFile', true);
  // - a set of renamed deps
  deps = this.cache.get(filename, 'deps');
  // - a set of unnormalized deps
  renames = this.cache.get(filename, 'renames');

  // all items must exist in the cache for this to match
  if (cacheFile && deps && renames) {
    // caching should have the exact same effect as full exec
    // push the result and add deps
    this.emit('hit', filename);
    this.addResult({
        filename: filename,
        content: cacheFile,
        deps: deps,
        renames: renames
    });
    return true;
  }
  return false;
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
  if (self.hasCached(filename)) {
    this.emit('file', filename);
    return;
  }

  // Apply exclusions
  var isExcluded = this.excludeChecks.some(function(fn) {
    return !fn(filename);
  });
  if (isExcluded) {
    this.log.info('File excluded', filename);
    return;
  }

  this.emit('file', filename);
  this.log.info('Add', filename);

  // Apply --ignore's
  if (this.ignore) {
    var isIgnored = this.ignoreChecks.some(function(fn) {
      return !fn(filename);
    });
    if (isIgnored){
      this.log.info('File ignored', filename);
      // no need to parse the file since it's always an empty file
      this.emit('miss', filename);
      this.addResult({
        filename: filename,
        content: self.ignoreFile,
        deps: {},
        renames: []
      });
      // queue has been updated, finish this task
      return;
    }
  }

  // add to queue (and run)
  this._queue.exec([
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
    }]);
};

Runner.prototype.parseAndUpdateDeps = function(filename, cacheFile, done) {
  var self = this;
  detectiveDependencies(filename, cacheFile, this.opts.ignore, this.dependencyCache,
    this.resolverOpts, function(err, deps, renames) {
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
  self.emit('file-done', result.filename, result);
  // add deps to the queue -> this also queues further tasks
  Object.keys(result.deps).map(function(rawDep) {
    return result.deps[rawDep];
  }).filter(function(dep) {
    // since deps may contain references to external modules, ensure that the items start with
    // . or /
    return dep.charAt(0) == '/' || dep.charAt(0) == '.';
  }).forEach(function(dep) {
    self.add(dep);
  });
};

Runner.prototype.exec = function(onDone) {
  var self = this;
  if (onDone) {
    this._queue.once('empty', function() {
      // always sort results for consistency and easy testing
      self._results.sort(function(a, b) {
        return a.filename.localeCompare(b.filename);
      });
      self.emit('done');
      onDone(null, self._results);
    });
  }
};

module.exports = Runner;
