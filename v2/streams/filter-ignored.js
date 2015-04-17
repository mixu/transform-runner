var pi = require('pipe-iterators');

module.exports = function(ignored, log, onComplete) {
  if (!ignored) {
    ignored = [];
  }
  // Apply --ignore's
  pi.filter(function(filename) {
    var isIgnored = false;
    // globs
    for (i = 0; i < ignored.length; i++) {
      if (ignored[i](filename)) {
        isIgnored = true;
        break;
      }
    }
    if (isIgnored && log) {
      // mark as completed
      opts.complete(filename);
      log.info('File ' + filename + ' ignored.');
    }
    return !isIgnored;
  });
};
