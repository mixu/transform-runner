var fs = require('fs'),
    path = require('path'),
    amdresolve = require('amd-resolve'),
    amdetective = require('amdetective'),
    nodeResolve = require('resolve'),
    parallel = require('miniq');

function isPlugin(dep) {
  var plugin = dep.split('!'),
      hasExclamationMark = plugin.length > 1;
  return hasExclamationMark;
}

function Detective(opts) {
  // not implemented
  this.remap = opts.remap;
  // map from target name to target file; target is not parsed
  // (no parse is implemented in the task runner)
  this.vendor = opts.vendor;
  this.log = opts.log;
  this.amdconfig = opts.amdconfig;
}

Detective.prototype.resolveDeps = function(content, filepath, onDone) {
  var self = this,
      log = this.log,
      rawDeps,
      deps = {};

  try {
    rawDeps = amdetective(content);
  } catch (e) {
    // augment with the path property
    if (e.lineNumber) {
      e.path = filepath;
    }
    log.error('Parse error (amd): ', filepath, e);
    return onDone(e, deps);
  }

  // skip plugins, as they are executed when the specific target name
  // is processed. skip special names like "define".
  rawDeps = rawDeps.filter(function(dep) {
    if (amdresolve.isSpecial(dep)) {
      return false; // skip
    }
    if (isPlugin(dep)) {
      deps[dep] = dep; // passthrough, no resolution takes place
      return false;
    }
    // vendor paths w/ config.shim feature: if an entry exists, skip resolution, else parse file
    if (self.vendor[dep]) {
      if (self.amdconfig.shim[dep]) {
        // config.shim can be an array, or an object with a .deps
        var shim = self.amdconfig.shim[dep],
            arr = (Array.isArray(shim) ? shim : shim.deps);
        deps[dep] = shim.reduce(function(prev, curr) {
          prev[curr] = curr;
          return prev;
        }, {});

        return false;
      }

      // TODO - in either case
      // isVendor: true // toggles the AMD wrapper mode from "individual file" to "named export"
    }
    return true; // include in resolve targets
  });


  // Early exit when no deps
  if (!rawDeps || rawDeps.length === 0) {
    return onDone(null, deps);
  }

  var errors = [],
      currOpts = self.amdconfig || {};
  parallel(12, rawDeps.map(function(dep) {
    return function(done) {
      var target;
      // override relDir for each file
      currOpts.relDir = path.dirname(filepath);

      try {
        target = amdresolve.sync(dep, currOpts);
      } catch (err) {
        log.error('Resolve error (amd):', err, dep, filepath);
        deps[dep] = dep;
        self.cache[basedir][dep].dep = dep;
        errors.push({ err: err, dep: dep, filepath: filepath });
        return done();
      }
      target = path.normalize(target);
      deps[dep] = target;
      done();
    };
  }), function() {
    return onDone(errors.length > 0 ? errors : null, deps);
  });
};

module.exports = Detective;
