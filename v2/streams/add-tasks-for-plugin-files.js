var fs = require('fs'),
    path = require('path'),
    pi = require('pipe-iterators');

// AMD: find and apply plugins

function hasExclamationMark(str) {
  return { name: plugin[0] };
}

module.exports = function(opts) {

  return pi.map(function(entry) {
    var filename = entry.filename;
    // does it contain a exclamation mark?
    var plugin = filename.split('!'),
        hasExclamationMark = plugin.length > 1;
    if (!hasExclamationMark || !opts.plugins || !plugin[0]) {
      return function(done) {
        // when no plugins run, just keep the same content but parse the dependencies
        detective(fs.readFileSync(filename, 'utf8'), filename, function(err, deps) {
          done(err, {
            filename: filename,
            // cache the output file: in this case, it'll be a direct reference to
            // the file itself
            content: filename,
            deps: deps
          });
        });
      });
    }

    var pluginName = plugin[0],
        targetPath = opts.vendor[target]; // e.g. false

    return function(done) {
      if (opts.plugins[pluginName].load) {
        targetPath = opts.plugins[pluginName].load(filename);
      }
      if (!targetPath) {
        // can return false from the load() resolution to skip
        detective(fs.readFileSync(filename, 'utf8'), filename, function(err, deps) {
          done(err, {
            filename: filename,
            // cache the output file: in this case, it'll be a direct reference to
            // the file itself
            content: filename,
            deps: deps
          });
        });
        return;
      }
      // run the plugin itself
      var source = opts.plugins[pluginName](target, targetPath);
      var file = {
        filename: target,
        sourcePath: targetPath,
        // source attr = don't read file
        source: source,
        deps: sourceDeps(source),
        renames: {}
      };
      files.push(file);
      console.log('Added plugin processed file', target);
    };
  });
};
