var pi = require('pipe-iterators');

module.exports = function(onComplete) {
  // list of input files that have already been seen
  var seenFiles = {};

  return pi.filter(function(filename) {
    var isSeen = seenFiles[filename];
    if (!isSeen) {
      seenFiles[filename] = true;
    } else {
      // mark as completed
      onComplete(filename);
    }
    return !isSeen;
  });
};
