"use strict";

var path = require("path");
var debug = require("debug")("github-todos");
var exec = require("child_process").exec;


module.exports = {
  "run": run,
  "dir": dir
};


function run (args, cb) {
  if (Array.isArray(args)) {
    args = args.join(" ");
  }

  debug("Shell: git " + args);

  exec("git " + args, function (err, stdout /*, stderr */) {
    if (err) {
      if (stdout) {
        err.message += "\n" + stdout;
      }
      return cb(err);
    }

    cb(null, stdout);
  });
}

function dir (subdir, cb) {
  if (typeof subdir === "function") {
    cb = subdir;
    subdir = "";
  }

  run("rev-parse --git-dir", function (err, result) {
    cb(err, result ? path.join(result.trim(), subdir) : null);
  });
}
