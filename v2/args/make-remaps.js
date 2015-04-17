
module.exports = function(ignores, remaps) {

  var remapExpressions = [];

  opts.ignore.forEach(function(glob) {
    remapExpressions.push(function(path) {
      return glob(path) ? __dirname + '/builtin/empty.js' : false;
    });
  });

  opts.remap.forEach(function(pair) {
    var glob = pair[0],
        target = pair[1];
    remapExpressions.push(function(path) {
      return glob(path) ? target : false;
    });
  });

  return remapExpressions;
};
