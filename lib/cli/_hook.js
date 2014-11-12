"use strict";

/* eslint no-process-exit:0 */

var parseDiff = require("../parse-diff");
var _ = require("lodash");
var async = require("async");
var fs = require("fs");
var minimatch = require("minimatch");
var debug = require("debug")("github-todos");

var git = require("../git");
var todos = require("../todos");
var config = require("../config");


exports.config = function (opts) {
  return opts
    .string("r")
    .default("r", "origin")
    .alias("r", "remote")
    .describe("r", "Remote to which the push is being done")
    .string("R")
    .alias("R", "range")
    .describe("R", "Commits range to analyze, will expect git-hook data from standard input otherwise");
};

exports.run = function (argv, opts, conf) {
  conf = _.merge({}, config.defaults, conf);

  if (process.env.DRY_RUN) {
    console.log("[Github-Todos] DRY_RUN set: no modifications to filesystem, no calls to Github API");
  }

  if (!checkRemote(conf.remotes, argv.remote)) {
    console.log("[Github-Todos] Hook disabled for remote '" + argv.remote + "' (you may check option 'remotes')");
    return;
  }

  checkBranch(conf.branches, function (err, enabled, branch) {
    if (err) {
      throw err;
    }

    if (enabled) {
      main(argv, conf);
    } else {
      console.log("[Github-Todos] Hook disabled for branch '" + branch + "' (you may check option 'branches')");
    }
  });
};

// Check if hook is enabled for requested remote
// String, String → Boolean
function checkRemote (remotes, remote) {
  if (remotes === "ALL") {
    return true;
  }

  if (!_.isArray(remotes)) {
    remotes = _.invoke(remotes.split(","), "trim");
  }

  return _.any(remotes, _.partial(minimatch, remote));
}

// Check if hook is enabled on current branch
// String ~→ Boolean
function checkBranch (branches, cb) {
  if (branches === "ALL") {
    return cb(null, true);
  }

  if (!_.isArray(branches)) {
    branches = _.invoke(branches.split(","), "trim");
  }

  git.currentBranch(function (err, branch) {
    if (err) {
      return cb(err);
    }

    cb(null, _.any(branches, _.partial(minimatch, branch)), branch);
  });
}

// Main process
// Object, Object → void
function main (argv, conf) {
  if (!conf.repo) {
    console.error("[Github-Todos] Mandatory option 'repo' not set, where am I supposed to create issues?");
    console.error("[Github-Todos] Run 'github-todos config repo \"<GITHUB USER OR ORG>/<REPOSITORY>\"' to enable hook");
    process.exit(1);
  }

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
}

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

    var allowedFiles = conf.files;
    if (!_.isArray(allowedFiles)) {
      allowedFiles = _.invoke(allowedFiles.split(","), "trim");
    }

    analyzeDiff(_.filter(parseDiff(diff), function (file) {
      var ignored = !_.any(allowedFiles, _.partial(minimatch, file.to));
      if (ignored) {
        debug("Ignore", file.to);
      }
      return !ignored;
    }), targetSha, conf);
  });
}

// String, Sha → void
function analyzeDiff (diff, sha, conf) {
  todos.fromDiff(conf.repo, diff, sha, _.merge({
    "onProgress": function onProgress (err, result, todo) {
      if (err) {
        console.error("[Github-Todos] Error", err);
      } else if (result && result.type === "comment") {
        console.log("[Github-Todos] Added comment to issue #%s (%s) - %s", result.issue, todo.title, result.url);
      } else if (result && result.type === "issue") {
        console.log("[Github-Todos] Created issue #%s (%s) - %s", result.number, todo.title, result.url);
      } else if (!result) {
        console.log("[Github-Todos] Aborted - %s", todo.title);
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

          done();
        });
      });
    } else {
      done();
    }
  });

  function done () {
    if (process.env.DRY_RUN) {
      console.error("[Github-Todos] Dry Run: Aborting git push");
      process.exit(123);
    }
  }
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
  git.run("commit -m '[Github-Todos] Inject issue numbers'", function (err) {
    if (err) {
      console.error("[Github-Todos] Failed to commit");
      cb(err);
    } else {
      console.log("[Github-Todos] Added a commit containing issue injections");
      cb();
    }
  });
}

function unstash (dirty) {
  return function (cb) {
    if (dirty) {
      git.stash.pop(function (err) {
        if (err) {
          console.error("[Github-Todos] Warning: could not run 'git stash pop'");
          console.error("[Github-Todos]          %s", err);
          console.error("[Github-Todos] You may want to remove commit (`git reset --soft HEAD~1`) and clean conflicts before running `git stash pop` manually");
        }
        cb();
      });
    } else {
      cb();
    }
  };
}
