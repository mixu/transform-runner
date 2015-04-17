var pi = require('pipe-iterators');

// this is the list that's built into npm itself
var npmBuiltIn = [
  new RegExp('/[.]git/'),
  new RegExp('[.]lock-wscript$'),
  /\/[.]wafpickle-[0-9]+$/,
  new RegExp('/CVS/'),
  new RegExp('/[.]svn/'),
  new RegExp('/[.]hg/'),
  /\/[.].*[.]swp$/,
  new RegExp('[.]DS_Store$'),
  /\/[.]_/,
  new RegExp('npm-debug[.]log$')
];

module.exports = function(excluded, log, onComplete) {
  if (!excluded) {
    excluded = [];
  }

    // Apply exclusions
  return pi.filter(function(filename) {
    var isExcluded = false, i;
    // npm
    for (i = 0; i < npmBuiltIn.length; i++) {
      if (npmBuiltIn[i].test(filename)) {
        isExcluded = true;
        break;
      }
    }
    // globs
    if (!isExcluded) {
      for (i = 0; i < excluded.length; i++) {
        if (excluded[i](filename)) {
          isExcluded = true;
          break;
        }
      }
    }

    if (isExcluded && log) {
      // mark as completed
      onComplete(filename);
      log.info('File ' + filename + ' excluded due to exclusion rule.');
    }
    return !isExcluded;
  });
};
