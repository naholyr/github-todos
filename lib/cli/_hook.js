"use strict";

/* eslint no-process-exit:0 */

var parseDiff = require("../parse-diff");
var _ = require("lodash");

var git = require("../git");
var todos = require("../todos");
var github = require("../github");


exports.config = function (opts) {
  return opts
    .boolean("r")
    .alias("r", "remote")
    .describe("r", "Remote to which the push is being done")
    .string("R")
    .alias("R", "range")
    .describe("R", "Commits range to analyze, will expect git-hook data from standard input otherwise");
};

exports.run = function (argv, opts, conf) {
  process.stdout.write("[Github-Todos] Checking Github Authentication… ");

  github.connect(conf, function (err) {
    if (err) {
      console.error("Run 'github-todos auth' to re-authenticate to Github");
      console.error(err);
      process.exit(1);
      return;
    }

    main(argv, conf);
  });
};

// Main process
// Object, Object → void
function main (argv, conf) {
  // FIXME detect repository or get from local config or get from CLI ?
  var repo = "naholyr/github-todos";

  if (argv.range) {

    // Extract target SHA
    var targetCommit = _.last(argv.range.split(".."));
    git.run("rev-parse '" + targetCommit + "'", function (err, sha) {
      if (err) {
        throw err;
      }

      analyzeRange(argv.range, sha.trim(), conf);
    });

  } else {

    // Receive git-hook data from stdin
    process.stdin.on("data", function (chunk) {
      var info = chunk.toString("utf8").split(/\s+/);
      onCommitRange(info[1], info[3], conf);
    });

  }
};

// String, Sha, String, Sha → void
function onCommitRange (localSha, remoteSha, conf) {
  var range = localSha; // all local commits until localSha
  if (localSha.match(/^0+$/)) {
    // Delete branch: skip
    return;
  } else if (!remoteSha.match(/^0+$/)) {
    // Remote branch exists: build range
    range = remoteSha + ".." + localSha;
  }

  analyzeRange(range, localSha, conf);
}

// Sha..Sha, Sha → void
function analyzeRange (range, targetSha, conf) {
  git.run("diff -u " + range, function (err, diff) {
    if (err) {
      throw err;
    }

    analyzeDiff(parseDiff(diff), targetSha, conf);
  });
}

// String, Sha → void
function analyzeDiff (diff, sha, conf) {
  todos.fromDiff(diff, sha, conf, function (err, results) {
    if (err) {
      throw err;
    }

    console.log("Results", results);

    console.log("SORRY, just a WIP: break git push so you can try again and debug harder");
    process.exit(1);
  });
}
