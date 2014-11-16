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

module.exports = function(content, filepath, ignoreDeps, cacheHash, opts, log, onDone) {

  try {
    rawDeps = amdetective(content.toString());
  } catch (e) {
    // augment with the path property
    if (e.lineNumber) {
      e.path = filepath;
    }
    log.error('Parse error (amd): ', filepath, e);
    return onDone(e, deps, renames);
  }


  if (rawDeps && ignoreDeps) {
    var normalizedNames = rawDeps.map(function(name) {
      // absolute deps can be of the ugly form "foo/bar.js",
      // which should be interpreted as "foo"
      return name.split('/')[0];
    });
    rawDeps = rawDeps.filter(function(name, index) {
      // unlike in CJS where remaps handle ignores, her we still want
      // the dependency entry to exist so that the r.js loader takes
      // it into account when initializing modules
      deps[name] = name;
      return (ignoreDeps.indexOf(normalizedNames[index]) === -1);
    });
  }

  // check after ignoring any unnecessary deps
  if (!rawDeps || rawDeps.length === 0) {
    return onDone(null, deps, renames);
  }

  var errors = [];
  parallel(12, rawDeps.map(function(dep) {
    return function(done) {
      // skip special, skip plugins
      if (amdresolve.isSpecial(dep) || isPlugin(dep)) {
        deps[dep] = dep;
        return done();
      }

      var basedir = path.dirname(filepath);

      if(!cacheHash[basedir]) {
        cacheHash[basedir] = {};
      }
      if (cacheHash[basedir][dep]) {
        var item = cacheHash[basedir][dep]
        deps[dep] = item.dep;
        return done();
      }

      var currOpts = opts.amdconfig || {};

      // override relDir for each file
      currOpts.relDir = path.dirname(filepath);

      cacheHash[basedir][dep] = {};

      try {
        normalized = amdresolve.sync(dep, currOpts);
      } catch (err) {
        log.error('Resolve error (amd):', err, dep, filepath);
        deps[dep] = dep;
        cacheHash[basedir][dep].dep = dep;
        errors.push({ err: err, dep: dep, filepath: filepath });
        return done();
      }

      cacheHash[basedir][dep].dep = path.normalize(normalized);
      deps[dep] = path.normalize(normalized);
      done();
    };
  }), function() {
    return onDone(errors.length > 0 ? errors : null, deps, renames);
  });
};
