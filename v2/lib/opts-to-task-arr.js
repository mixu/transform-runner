var path = require('path'),
    pi = require('pipe-iterators'),
    spawn = require('./spawn.js');

function asArray(item) {
  return (Array.isArray(item) ? item : [ item ]);
}

function commandsToTasks(commands) {
  commands = commands.filter(Boolean);
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

function transformsToTasks(transforms, directories) {
  transforms = transforms.filter(Boolean);
  if (!transforms) { return []; }
  var result = [];

  // resolve each transform
  transforms.forEach(function(transform) {
    var nodeResolve = require('resolve'),
        name = transform,
        modulePath, mod, err;

    // handle 2-length arrays as [modulename, argumentHash]
    if (Array.isArray(transform)) {
      name = transform[0];
    }

    directories.some(function(dir) {
      try {
        modulePath = nodeResolve.sync(name, { basedir: dir });
        mod = require(modulePath);
      } catch (e) {
        err = e;
        return false;
      }
      return true;
    });

    if (!mod && err) {
      throw err;
    }

    // the only difference between a 2.x gluejs module
    // and a browserify module is that gluejs modules can return false
    // -> and gluejs 2.x modules might return Minitask tasks, but that's deprecated in 3.x
    // -> and gluejs 2.x modules had function(filename, package) { } as the sig
    if (!Array.isArray(transform)) {
      result.push(mod);
    } else {
      result.push([ mod, transform[1] ]);
    }
  });
  return result;
}

module.exports = function(opts) {
  return commandsToTasks(asArray(opts.command))
         .concat(transformsToTasks(asArray(opts.transforms), opts.moduleLookupPaths))
         .concat(commandsToTasks(asArray(opts['global-command'])))
         .concat(transformsToTasks(asArray(opts['global-transform']), opts.moduleLookupPaths))
         .filter(Boolean);
};
