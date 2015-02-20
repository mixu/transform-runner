var fs = require('fs'),
    path = require('path'),
    pi = require('pipe-iterators'),
    optsToTaskArr = require('../lib/opts-to-task-arr.js');

// return the appropriate set of matchers, given a path to a package.json file
// the path is preferable to the content of the package.json since most
// files will reuse the same package.json path

module.exports = function(opts) {

  var mainTasks = optsToTaskArr(opts),
      cache = {};

  return pi.map(function(entry) {
    if (entry.isMain) {
      entry.tasks = mainTasks;
      return entry;
    }

    if (!entry['package.json']) {
      return entry;
    }

    // load package.json, create function(filename) { return Duplex } from it.
    if (!cache[entry['package.json']]) {
      var json;
      try {
        json = JSON.parse(fs.readFileSync(entry['package.json']).toString());
      } catch(err) {
        // ignore enoent, avoids checking for existence
        if (err.code !== 'ENOENT') {
          self.emit('warn', err);
        }
      }
      if (json && json.browserify && json.browserify.transform) {
        cache[entry['package.json']] = optsToTaskArr({
          transforms: json.browserify.transform,
          moduleLookupPaths: [ path.dirname(entry.filename) ]
        });
      } else {
        cache[entry['package.json']] = [];
      }
    }
    entry.tasks = cache[entry['package.json']];
    return entry;
  });
};
