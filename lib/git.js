"use strict";

var path = require("path");
var debug = require("debug")("github-todos");
var exec = require("child_process").exec;
var Promise = require("bluebird");


module.exports = {
  "run":    run,
  "dir":    dir,
  "dirty":  dirty,
  "stash": {
    "save": stashSave,
    "pop":  stashPop
  },
  "currentBranch": currentBranch,
  "blame": blame
};


function run (args) {
  if (Array.isArray(args)) {
    args = args.join(" ");
  }

  debug("Shell: git " + args);

  return new Promise(function (resolve, reject) {
    exec("git " + args, function (err, stdout /*, stderr */) {
      if (!err) {
        resolve((stdout || "").trim());
      } else {
        if (stdout) {
          err.message += "\n" + stdout;
        }
        reject(err);
      }
    });
  });
}

function dir (subdir) {
  return run("rev-parse --git-dir").then(function (result) {
    return result ? path.join(result, subdir) : null;
  });
}

function dirty () {
  return run("status --porcelain").then(function (stdout) {
    return stdout !== "";
  });
}

function stashSave () {
  return run("stash save --include-untracked");
}

function stashPop () {
  return run("stash pop --index");
}

function currentBranch () {
  return run("rev-parse --abbrev-ref HEAD");
}

function blame (filename, lineNumber) {
  return run(`blame --line-porcelain -L ${lineNumber},${lineNumber} -e ${filename}`).then(function (stdout) {
    let email = stdout.split('\n').map(function(line) {
      return line.split(' ', 2);
    }).filter(function(entry) {
      return entry[0] === 'author-mail';
    });
    email = email[0][1];
    return email.substr(1, email.length - 2);
  });
}
