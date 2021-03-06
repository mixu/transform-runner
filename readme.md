# transform-runner

Accepts a set of files, applies transformations to them and returns JSON output which can be converted into a package.

## Usage

    var runner = require('transform-runner');

    var runner = runTasks({
      // new API
      tasks: function(filename, done) {
        return false; // return true if you queue'd tasks
      },

      log: Minilog('runner'),
      include: [ '/home/foo/index.js' ],
      exclude: [
        // /^.+(?!\.js).{3}$/i,
        '/home/foo/node_modules',
      ],
      jobs: require('os').cpus().length * 2,
      log: {
        info: function() {},
        log: console.log.bind(console),
        error: console.error.bind(console)
      }
    }, function(err, files) {
      if (onDone) {
        onDone(err, files, runner);
      }
    });
    runner.on('parse-error', function(err) {
      console.log('error', err);
    });
    runner.on('file', function(filename) {
      console.log('file', filename);
    });
    runner.on('hit', function(filename) {
      console.log('hit', filename);
    });
    runner.on('miss', function(filename) {
      console.log('miss', filename);
    });
    runner.on('file-done', function(filename, item) {
      console.log('file-done', filename, item);
    });

## API

### runner(files, opts = {})

`opts`:

- `exclude`: a function which takes a single parameter (the full file path) and returns true if the file should be excluded
- `ignore`: a function which takes a single parameter (the full file path) and returns true if the file should be ignored
- `tasks(file, done)`: a function; the done function should be called with `err` and the full path to the result of the task execution when done
- `cache`: an object with the following methods:
  - `get(file)`: takes a single parameter (the full file path) and returns either an object containing the cached metadata, or false if there is no cached value
  - `set(file, key, value)`
- `log`: an object that looks like the `console` API, with the following methods:
  - `.info()`: log a debug message (works both in the browser and in Node, unlike .debug)
  - `.log()`: log a informational message
  - `.error()`: log a error message

## Include, exclude etc.

Unlike most build systems, `transform-runner` does not use `node-glob` because it is slow on moderately-sized trees.

All path specifications are resolved as follows:

- paths beginning with `.` or `/` are resolved against the file system. Relative paths are resolved based on the base path.
- `--include-regexp`, `--exclude-regexp` and `--ignore-regexp` values are parsed as regular expressions using `new RegExp`. They should be quoted if passed in through the command line to avoid the shell from expanding special characters.
- There are three kinds of specifications:
  - includes are resolved first to produce a set of initial files
  - excludes are applied against any matching files, matched files are excluded
  - actions are resolved against the result from the includes after applying exclusions.
