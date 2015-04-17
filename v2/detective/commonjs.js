var fs = require('fs'),
    path = require('path'),
    detective = require('detective'),
    resolve = require('browser-resolve'),
    nodeResolve = require('resolve'),
    parallel = require('miniq');

// --remap, --ignore and browser field replacements are handled by the detective code,
// because they act by switching the target from the regular value to a different value
// (before determining transforms or even parsing the file itself).
// Internally there is only one option, remap, which implements both ignore and remap.

function Detective(opts) {
  // cache for detective-dependencies to avoid re-resolving known dependencies
  this.cache = {};
  this.remap = opts.remap;
  this.log = opts.log;
}

Detective.prototype.getCached = function(basedir, dep) {
  if (this.cache[basedir] && this.cache[basedir][dep]) {
    return this.cache[basedir][dep];
  }
  return false;
};

Detective.prototype.setCached = function(basedir, dep, target) {
  if (!self.cache[basedir]) {
    self.cache[basedir] = {};
  }
  self.cache[basedir][dep].dep = target;
};

Detective.prototype.resolveDeps = function(content, filepath, onDone) {
  var self = this,
      log = this.log,
      rawDeps,
      deps = {};

  // log.info('Parsing:', filepath, contentPath);
  try {
    rawDeps = detective(content);
  } catch (e) {
    // augment with the path property
    if (e.lineNumber) {
      e.path = filepath;
    }
    log.error('Parse error: ', filepath, e);
    return onDone(e, {});
  }

  // skip cached deps as all files in a particular folder will resolve to the same target
  var basedir = path.dirname(filepath);
  rawDeps = rawDeps.filter(function(dep) {
    var cached = self.getCached(basedir, dep);
    if (cached) {
      deps[dep] = cached;
    }
    return !cached;
  });

  // Early exit when no deps
  if (!rawDeps || rawDeps.length === 0) {
    return onDone(null, deps);
  }

  var errors = [];
  // resolve targets before applying --ignore or --remap
  parallel(12, rawDeps.map(function(dep) {
    return function(done) {
      resolve(dep, { filename: filepath }, function(err, target) {
        if (err) {
          log.error('Resolve error:', err, dep, filepath, deps);
          errors.push({ err: err, dep: dep, filepath: filepath });
          return done();
        }
        target = path.normalize(target);
        // handle --ignore and --remap expressions
        for (var i = 0; i < self.remap.length; i++) {
          var remappedTarget = self.remap[i](target);
          if (remappedTarget) {
            target = remappedTarget;
          }
        }
        self.setCached(basedir, dep, target);
        deps[dep] = target;
        done();
      });
    };
  }), function() {
    // sort the deps for consistency
    var sortedDeps = {};
    Object.keys(deps).sort().forEach(function(key) {
      sortedDeps[key] = deps[key];
    });
    return onDone(errors.length > 0 ? errors : null, sortedDeps);
  });
};

module.exports = Detective;
