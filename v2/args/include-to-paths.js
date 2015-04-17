
// given absolute globs containing the files to include,
// return the set of file paths that match
module.exports = function(includes) {
  var result = [];
  (Array.isArray(includes) ? includes : [includes]).forEach(function() {
    result = result.concat(glob.sync(includes));
  });
  return result.sort();
};
