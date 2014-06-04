var fs = require('fs'),
    path = require('path'),
    Runner = require('./lib/runner.js');

module.exports = function(opts, onDone) {
  // Initialize queue
  var runner = new Runner(opts);

  process.nextTick(function() {
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

    // input may be a directory - but only the initially included items
    (Array.isArray(opts.include) ? opts.include : [ opts.include ]).forEach(function(filepath) {
      // console.log('initial', filename);
      var stat = fs.statSync(filepath);
      if (stat.isDirectory()) {
        resolveDir(filepath);
      } else {
        runner.add(filepath);
      };
    });
    // start the queue
    runner.exec(onDone);
  });
  return runner;
};
