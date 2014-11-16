function asArray(item) {
  return (Array.isArray(item) ? item : [ item ]);
}

function commandsToTasks(commands) {
  if (!commands) { return []; }

  var result,
      isStringArray = commands.every(function(item) { return typeof item === 'string'; }),
      isFnArray = commands.every(function(item) { return typeof item === 'function'; });

  if (isStringArray) {
    // --command strings do not run on non-JS files,
    // this is because 1) of backwards compat and 2) the spawn task failing badly
    result = commands.map(function(command) {
      return function(filename) {
        if (path.extname(filename) == '.js') {
          var childProcess = spawn({
            name: filename, // full path
            task: command
          });
          return pi.combine(childProcess.stdin, childProcess.stdout);
        }
      };
    });
  } else if (isFnArray) {
    // commands is an array of function(filename) {}
    // functions must return a Duplex stream or null
    result = commands;
  } else {
    result = [];
  }
  return result;
}

function transformsToTasks(transforms) {
  if (!transforms) { return []; }
  var result = [];

  // resolve each transform
  transforms.forEach(function(transform) {
    var nodeResolve = require('resolve'),
        modulePath, mod;

    // try from process.cwd()
    try {
      modulePath = nodeResolve.sync(transform, { basedir: process.cwd() });
      mod = require(modulePath);
    } catch (e) {
      // try from current directory (e.g. global modules)
      try {
        modulePath = nodeResolve.sync(transform, { basedir: __dirname });
        mod = require(modulePath);
      } catch (e2) {
        throw e; // throw the friendlier error
      }
    }

    // the only difference between a 2.x gluejs module
    // and a browserify module is that gluejs modules can return false
    // -> and gluejs 2.x modules might return Minitask tasks, but that's deprecated in 3.x
    // -> and gluejs 2.x modules had function(filename, package) { } as the sig

    result.push(mod);
  });
  return result;
}

module.exports = function(opts) {
  return commandsToTasks(asArray(opts.commands))
         .concat(transformsToTasks(asArray(opts.transforms)))
         .concat(commandsToTasks(asArray(opts['global-command'])))
         .concat(transformsToTasks(asArray(opts['global-transform'])))
         .filter(Boolean);
};
