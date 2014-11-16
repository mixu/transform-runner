var fs = require('fs'),
    path = require('path'),
    pi = require('pipe-iterators');

var nodeModules = new RegExp(path.sep + 'node_modules' + path.sep);

// should return both:
// path to package.json if exists
// package name (root dir of package)
// isMain (use cmd line options for --transform / command / remap)

module.exports = function(mains) {

  // ensure that mainpaths end with / so substr splicing doesn't
  // just cut a filename prefix in half
  mainPaths = mains.map(function(str) {
    return (str.charAt(str.length - 1) === path.sep ? str : str + path.sep);
  });

  var packageJsonCache = {};
  function packageJsonExists(location) {
    if (typeof packageJsonCache[location] !== 'boolean') {
      packageJsonCache[location] = (fs.statSync(location) == true);
    }
    return packageJsonCache[location];
  }

  return pi.map(function(filename) {
    // check if this is a main path:
    var isMain = mainPaths.some(function(p) {
      // - does the beginning match one of the main paths?
      if (filename.substr(0, p.length) == p) {
        // - is there no node_modules between the main path and the
        // current path?
        return !filename.substr(p.length).test(nodeModules);
      }
      return false;
    });

    // -> isMain: true, package: root, pjson: root
    if (isMain) {
      return {
        filename: filename,
        isMain: true,
        'package': null,
        'package.json': null
      };
    }

    // strip off the filename, as every file in the same dir
    // will be in the same package
    var dirname = path.dirname(filename),
        segments = dirname.split(path.sep),
        i;
    // except if this is a file such as "node_modules/foo.js"
    if (segments[segments.length - 1] == 'node_modules') {
      return {
        filename: filename,
        isMain: false,
        'package': filename,
        'package.json': null
      };
    }

    // otherwise iterate the segments to find a node_modules entry
    for (i = segments.length - 1; i > 0; i--) {
      if (segments[i] == 'node_modules') {
        break;
      }
    }

    // found node_modules? find package.json at the node_modules level (only)
    if (segments[i] == 'node_modules') {
      var packageRoot = segments.slice(0, i + 1).join(path.sep),
          packageJson = packageRoot + path.sep + 'package.json';
      return {
        filename: filename,
        isMain: false,
        'package': packageRoot,
        'package.json': (packageJsonExists(packageJson) ? packageJson : null)
      };
    }

    // no node_modules and not a descendant of a main path?
    // orphan files are not main, are in their own package, and have no
    // package.json
    return {
      filename: filename,
      isMain: false,
      'package': null,
      'package.json': null
    };
  });
};
