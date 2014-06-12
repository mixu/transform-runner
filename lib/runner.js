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

  // construct this.exclude()
  this.exclude = new Matcher(npmBuiltIn.concat(opts.exclude), { basepath: opts.basepath });

  // if there are ignores, create a cache file to act as the placeholder item
  // for ignored files
  this.ignore = (opts.ignore ? new Matcher(opts.ignore, { basepath: opts.basepath }) :
    function() { return false; });

  this.dedupe = new Dedupe();
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

    // all items must exist in the cache for this to match
    if (cacheFile && deps && renames) {
      // caching should have the exact same effect as full exec
      // push the result and add deps
      self.emit('hit', dupname);
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
    return onDone(null, true);
  }

  // check the cache for a dedupe entry
  var result = self.cache.get(filename, 'dedupe');
  if (typeof result !== 'undefined') {
    // only lookup when there is a path set rather than false
    if (result) {
      return onDone(null, lookup(result, filename));
    }
    return onDone(null, false);
  }

  // check dedupe
  this.dedupe.find(filename, function(err, result) {
    self.cache.set(filename, 'dedupe', result);
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
        self.emit('file', filename);
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
  detectiveDependencies(filename, cacheFile, this.opts.ignore, this.dependencyCache,
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
  }).forEach(function(dep) {
    self.add(dep);
  });
};

Runner.prototype.exec = function(onDone) {
  var self = this;
  this._queue.once('empty', function() {
    // always sort results for consistency and easy testing
    self._results.sort(function(a, b) {
      return a.filename.localeCompare(b.filename);
    });
    self.emit('done', null, self._results);
    if (onDone) {
      onDone(null, self._results);
    }
  });
};

module.exports = Runner;
