var fs = require('fs'),
    os = require('os');

var cachePath = (os.tmpDir ? os.tmpDir(): os.tmpdir());

function InMemoryCache() {
  this.cacheLookup = {}
}

InMemoryCache.prototype.get = function(filename, key, isPath) {
  return (this.cacheLookup[filename] ? this.cacheLookup[filename][key] : undefined);
};

InMemoryCache.prototype.set = function(filename, key, value, isPath) {
  if(!this.cacheLookup[filename]) {
    this.cacheLookup[filename] = {};
  }
  this.cacheLookup[filename][key] = value;
};

InMemoryCache.prototype.filepath = function() {
  var cacheName;
  // generate a new file name
  do {
    cacheName = cachePath + '/' + Math.random().toString(36).substring(2);
  } while(fs.existsSync(cacheName));
  return cacheName;
};

module.exports = InMemoryCache;
