var fs = require('fs'),
    path = require('path'),
    Runner = require('./lib/runner.js');

module.exports = function(opts) {
  // Initialize queue
  var runner = new Runner(opts);

  function resolveDir(dirname) {
    // if the input is a directory, add all files in it, but do not add further directories
    var basepath = dirname + (dirname[dirname.length - 1] !== path.sep ? path.sep : ''),
        paths = fs.readdirSync(basepath).map(function(f) {
          return basepath + f;
        });
    paths.map(function(filepath) {
      // console.log('rd', item);
      var stat = fs.statSync(filepath);
      if (stat.isDirectory()) {
        // Skip `node_modules` folders when they occur in the subdirectories of
        // the initial set of includes
        if (path.basename(filepath) != 'node_modules') {
          resolveDir(filepath);
        }
      } else {
        runner.add(filepath);
      }
    });
  }
  // user should call .exec when ready. This avoids race conditions wrt to starting the
  // runner vs. attaching event listeners.
  var oldExec = runner.exec;
  // refactor this API slightly
  // indirection needed here to prevent the queue from starting to execute before the return statement
  // which is before event handlers can be attached.
  runner.exec = function(onDone) {
    // input may be a directory - but only the initially included items
    (Array.isArray(opts.include) ? opts.include : [ opts.include ]).forEach(function(filepath) {
      // console.log('initial', filepath);
      var stat = fs.statSync(filepath);
      if (stat.isDirectory()) {
        resolveDir(filepath);
      } else {
        // Add triggers .queue.exec!!
        runner.add(filepath);
      };
    });
    oldExec.call(runner, onDone);
  };
  return runner;
};
