var pi = require('pipe-iterators'),
    Matcher = require('../../lib/match.js');

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

module.exports = function filters(opts) {
  if (!opts) {
    opts = { exclude: [] };
  }
  // list of input files that have already been seen
  var seenFiles = [];

  // construct this.exclude()
  var exclude = new Matcher(npmBuiltIn.concat(opts.exclude).filter(Boolean), { basepath: opts.basepath });

  // if there are ignores, create a cache file to act as the placeholder item
  // for ignored files
  var ignore = (opts.ignore ? new Matcher(opts.ignore, { basepath: opts.basepath }) : function() { return false; });

  var log = opts.log;

  // check that the file has not already been queued
  return [
    pi.filter(function(filename) {
      var isSeen = seenFiles.indexOf(filename) != -1;
      if (!isSeen) {
        seenFiles.push(filename);
      }
      return !isSeen;
    }),
    // Apply exclusions
    pi.filter(function(filename) {
      var isExcluded = exclude(filename);
      if (isExcluded && log) {
        log.info('File ' + filename + ' excluded by regexp', isExcluded.toString());
      }
      return !isExcluded;
    }),

    // Apply --ignore's
    pi.filter(function(filename) {
      var isIgnored = ignore(filename);
      if (isIgnored && log) {
        log.info('File ' + filename + ' ignored by regexp', isIgnored.toString());
      }
      return !isIgnored;
    })];
}
