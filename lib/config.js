var exec = require("child_process").exec;


module.exports = {
  "list":   list,
  "unset":  unset,
  "set":    set,
  "get":    get
};


var PREFIX = "github-todos";

function list (cb) {
  exec("git config --local --get-regexp " + PREFIX + ".*", function (err, stdout, stderr) {
    if (err) {
      return cb(err);
    }

    var result = {};
    stdout.trim().split("\n").forEach(function (line) {
      var key = line.substring(PREFIX.length + 1, line.indexOf(' '));
      var value = line.substring(PREFIX.length + 1 + key.length + 1).trim();
      result[key] = value;
    });

    cb(null, result);
  });
};

function unset (option, cb) {
  exec("git config --local --unset github-todos." + option, function (err, stdout, stderr) {
    if (err.code === 5) {
      // config option already didn't exist, just ignore this case
      err = null;
    }
    cb(err || null);
  });
};

function get (option, cb) {
  // `git config option` returns 1 if option is not set
  // it also returns 1 if we're out of a git repository :(
  // re-use exports.list to distinguish cases
  list(function (err, list) {
    if (err) {
      return cb(err);
    }

    cb(null, list[option] || null);
  });
};

function set (option, value, cb) {
  exec("git config --local github-todos." + option + " " + value, function (err, stdout, stderr) {
    cb(err || null);
  });
};
