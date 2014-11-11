"use strict";

/* eslint no-process-exit:0 */

var parseDiff = require("../parse-diff");
var _ = require("lodash");
var async = require("async");
var fs = require("fs");

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
  if (process.env.DRY_RUN) {
    console.log("[Github-Todos] DRY_RUN set: no modifications to filesystem, no calls to Github API");
  }

  process.stdout.write("[Github-Todos] Checking Github Authentication… ");

  github.connect(conf, function (err) {
    if (err) {
      console.log("FAIL");
      console.error("Run 'github-todos auth' to re-authenticate to Github");
      console.error(err);
      process.exit(1);
      return;
    }

    console.log("OK");
    main(argv, conf);
  });
};

// Main process
// Object, Object → void
function main (argv, conf) {
  // FIXME detect repository or get from local config or get from CLI ?
  var repo = "naholyr/test-repos-for-github-todos";

  if (argv.range) {

    // Extract target SHA
    var targetCommit = _.last(argv.range.split(".."));
    git.run("rev-parse '" + targetCommit + "'", function (err, sha) {
      if (err) {
        throw err;
      }

      analyzeRange(repo, argv.range, sha.trim(), conf);
    });

  } else {

    // Receive git-hook data from stdin
    process.stdin.on("data", function (chunk) {
      var info = chunk.toString("utf8").split(/\s+/);
      onCommitRange(repo, info[1], info[3], conf);
    });

  }
}

// String, Sha, String, Sha → void
function onCommitRange (repo, localSha, remoteSha, conf) {
  var range = localSha; // all local commits until localSha
  if (localSha.match(/^0+$/)) {
    // Delete branch: skip
    return;
  } else if (!remoteSha.match(/^0+$/)) {
    // Remote branch exists: build range
    range = remoteSha + ".." + localSha;
  }

  analyzeRange(repo, range, localSha, conf);
}

// Sha..Sha, Sha → void
function analyzeRange (repo, range, targetSha, conf) {
  git.run("diff -u " + range, function (err, diff) {
    if (err) {
      throw err;
    }

    analyzeDiff(repo, parseDiff(diff), targetSha, conf);
  });
}

// String, Sha → void
function analyzeDiff (repo, diff, sha, conf) {
  todos.fromDiff(repo, diff, sha, _.merge({
    "onProgress": function onProgress (err, result, todo) {
      if (err) {
        console.error("[Github-Todos] Error", err);
      } else if (result && result.type === "comment") {
        console.log("[Github-Todos] Added comment to issue #%s (%s) - %s", result.issue, todo.title, result.url);
      } else if (result && result.type === "issue") {
        console.log("[Github-Todos] Created issue #%s (%s) - %s", result.number, todo.title, result.url);
      } else {
        console.error("[Github-Todos] Unknown result", result);
      }
    }
  }, conf), function (err, results, todos) {
    if (err) {
      throw err;
    }

    if (conf["inject-issue"]) {
      console.log("[Github-Todos] Injecting issue numbers to files…");

      git.dirty(function (err, dirty) {
        if (err) {
          console.error("[Github-Todos] Warning: could not check if repository is dirty");
        }

        var injects = generateInjects(todos, results);

        async.series([
          fail(err),
          stash(dirty),
          injectIssues(injects),
          add,
          commit,
          unstash(dirty)
        ], function (err) {
          if (err) {
            console.error("[Github-Todos] Warning: failed injecting issues, you may need to do it manually in following files:");
            console.errro("[Github-Todos] %s", err);
            _.each(injects, function (inject) {
              console.log("[Github-Todos]  * %s, line %s: Issue #%s", inject.file, inject.line, inject.issue);
            });
          }
        });
      });
    }
  });
}


function generateInjects (todos, results) {
  return _.map(todos, function (todo, i) {
    var result = results[i];
    var issue = (result.type === "issue") ? result.number : result.issue;

    return {
      "file":     todo.file,
      "line":     todo.line,
      "title":    todo.title,
      "issue":    issue
    };
  });
}

function fail (err) {
  return function (cb) {
    if (process.env.DRY_RUN) {
      return cb(new Error("Simulated execution (DRY_RUN set)"));
    }

    cb(err);
  };
}

function stash (dirty) {
  return function (cb) {
    if (dirty) {
      git.stash.save(cb);
    } else {
      cb();
    }
  };
}

function injectIssues (injects) {
  return function (cb) {
    async.map(injects, injectIssue, cb);
  };
}

function injectIssue (inject, cb) {
  fs.readFile(inject.file, {encoding: "utf8"}, function (err, content) {
    if (err) {
      return cb(err);
    }

    var lines = content.split("\n");
    var line = lines[inject.line - 1];
    var index = line.indexOf(inject.title);
    if (index === -1) {
      return cb();
    }

    var head = line.substring(0, index);
    var matchIssue = head.match(/#(\d+)(\s+)$/);
    if (matchIssue && String(inject.issue) === matchIssue[1]) {
      // Already added
      return cb();
    }

    var rest = line.substring(index);
    line = head + "#" + inject.issue + " " + rest;
    lines[inject.line - 1] = line;
    content = lines.join("\n");
    fs.writeFile(inject.file, content, cb);
  });
}

function add (cb) {
  git.run("add .", cb);
}

function commit (cb) {
  git.run("commit -m '[Github-Todos] Inject issue numbers'", cb);
}

function unstash (dirty) {
  return function (cb) {
    if (dirty) {
      git.stash.pop(cb);
    } else {
      cb();
    }
  };
}
