var fs = require('fs'),
    path = require('path'),
    detective = require('detective'),
    resolve = require('browser-resolve'),
    nodeResolve = require('resolve'),
    parallel = require('miniq');

module.exports = function(filepath, contentPath, ignoreDeps, cacheHash, opts, log, onDone) {
  // outputs:
  var rawDeps,
      deps = {},
      renames = [];

  // any non-json files
  if (path.extname(filepath) === '.json') {
    return onDone(null, deps, renames);
  }

  // log.info('Parsing:', filepath, contentPath);
  var start = new Date().getTime();
  fs.readFile(contentPath, function(err, data) {
    if (err) {
      throw err;
    }

    try {
      rawDeps = detective(data.toString());
    } catch (e) {
      // augment with the path property
      if (e.lineNumber) {
        e.path = filepath;
      }
      log.error('Parse error: ', contentPath, e);
      return onDone(e, deps, renames);
    }

    if (rawDeps && ignoreDeps) {
      var normalizedNames = rawDeps.map(function(name) {
        // absolute deps can be of the ugly form "foo/bar.js",
        // which should be interpreted as "foo"
        return name.split('/')[0];
      });
      rawDeps = rawDeps.filter(function(unused, index) {
        return (ignoreDeps.indexOf(normalizedNames[index]) === -1);
      });
    }

    if (!rawDeps || rawDeps.length === 0) {
      log.info('Result:', filepath, []);
      return onDone(null, deps, renames);
    }

    var errors = [];
    parallel(12, rawDeps.map(function(dep) {
      return function(done) {
        var basedir = path.dirname(filepath);

        if(!cacheHash[basedir]) {
          cacheHash[basedir] = {};
        }
        if (cacheHash[basedir][dep]) {
          var item = cacheHash[basedir][dep]
          if (item.canonical && item.normalized) {
            renames.push(item.canonical, item.normalized);
          }
          deps[dep] = item.dep;
          return done();
        }

        resolve(dep, { filename: filepath }, function(err, normalized) {
        // nodeResolve(dep, { basedir: path.dirname(filepath) }, function(err, normalized) {

          if (err) {
            log.error('Resolve error:', err, dep, filepath, deps);
            errors.push({ err: err, dep: dep, filepath: filepath });
            return done();
          }
          // browser-resolve may replace specific files with different names
          var canonical = nodeResolve.sync(dep, { basedir: basedir });

          cacheHash[basedir][dep] = {};
          if (canonical != normalized) {
            renames.push(canonical, normalized);
            cacheHash[basedir][dep].renames = [ canonical, normalized];
          }
          cacheHash[basedir][dep].dep = path.normalize(normalized);
          deps[dep] = path.normalize(normalized);
          done();
        });
      };
    }), function() {
      log.info('Result:', filepath, deps);
      return onDone(errors.length > 0 ? errors : null, deps, renames);
    });
  });
};
