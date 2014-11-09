"use strict";

/* eslint no-process-exit:0 */

var parseDiff = require("diff-parse");
var _ = require("lodash");
var async = require("async");

var git = require("../git");
var todos = require("../todos");


// TODO make label and trigger configurable
var LABEL = {
  "TODO": "TODO",
  "FIXME": "FIXME"
};

// TODO make case sensitivity configurable
var CASE_SENSITIVE = false;


exports.config = function (opts) {
  return opts
    .boolean("r")
    .alias("r", "remote")
    .describe("r", "Remote to which the push is being done")
    .string("R")
    .alias("R", "range")
    .describe("R", "Commits range to analyze, will expect git-hook data from standard input otherwise");
};

exports.run = function (argv) {
  console.log("[Github-Todos] Remote = " + argv.remote);

  if (argv.range) {

    // Extract target SHA
    var targetCommit = _.last(argv.range.split(".."));
    git.run("rev-parse '" + targetCommit + "'", function (err, sha) {
      if (err) {
        throw err;
      }

      analyzeRange(argv.range, sha.trim());
    });

  } else {

    // Receive git-hook data from stdin
    process.stdin.on("data", function (chunk) {
      var info = chunk.toString("utf8").split(/\s+/);
      onCommitRange(info[0], info[1], info[2], info[3]);
    });

  }
};

// String, Sha, String, Sha → void
function onCommitRange (localRef, localSha, remoteRef, remoteSha) {
  var range = localSha; // all local commits until localSha
  if (localSha.match(/^0+$/)) {
    // Delete branch: skip
    return;
  } else if (!remoteSha.match(/^0+$/)) {
    // Remote branch exists: build range
    range = remoteSha + ".." + localSha;
  }

  analyzeRange(range, localSha);
}

// Sha..Sha, Sha → void
function analyzeRange (range, targetSha) {
  git.run("diff -u " + range, function (err, diff) {
    if (err) {
      throw err;
    }

    analyzeDiff(parseDiff(diff), targetSha);
  });
}

// String, Sha → void
function analyzeDiff (diff, sha) {
  async.map(_.flatten(_.map(diff, function (file) {
    var addedLines = _.filter(file.lines, "add");
    return _.filter(_.map(addedLines, lineToTodoMapper(file.to, sha)), "title");
  })), todos.createOrCommentIssue, function (err, results) {
    if (err) {
      throw err;
    }

    console.log("Results", results);

    console.log("SORRY, just a WIP: break git push so you can try again and debug harder");
    process.exit(1);
  });
}

// String, Sha → String → {file, sha, line, title, label}
function lineToTodoMapper (filename, sha) {
  return function lineToTodo (line) {
    return _.merge({
      "file":   filename,
      "sha":    sha,
      "line":   line.ln
    }, extractTodoTitle(line.content));
  };
}

// String → {title, label}
function extractTodoTitle (content) {
  var result = null;

  if (_.isString(content)) {
    _.find(Object.keys(LABEL), function (trigger) {
      var index;
      if (CASE_SENSITIVE) {
        index = content.indexOf(trigger);
      } else {
        index = content.toUpperCase().indexOf(trigger.toUpperCase());
      }

      if (index !== -1) {
        var title = content.substring(index + trigger.length).trim();
        if (title) {
          result = {
            "title":  title,
            "label":  LABEL[trigger]
          };
        }
        return true; // break
      }
    });
  }

  return result;
}
