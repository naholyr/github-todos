"use strict";

/* eslint no-process-exit:0 */

var parseDiff = require("../parse-diff");
var _ = require("lodash");
var minimatch = require("minimatch");
var debug = require("debug")("github-todos");
var open = require("open");
var Promise = require("bluebird");

var fs = require("../fs");
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
    return Promise.resolve();
  }

  return checkBranch(conf.branches).spread(function (enabled, branch) {
    if (enabled) {
      return main(argv, conf);
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

  return git.currentBranch().then(function (branch) {
    return [_.any(branches, _.partial(minimatch, branch)), branch];
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
    return git.run("rev-parse '" + targetCommit + "'").then(function (sha) {
      return analyzeRange(argv.range, sha.trim(), conf);
    });

  } else {

    // Receive git-hook data from stdin
    return new Promise(function (resolve, reject) {
      var analyzing = [];

      process.stdin.on("data", function (chunk) {
        var info = chunk.toString("utf8").split(/\s+/);
        var promise = onCommitRange(info[1], info[3], conf);
        analyzing.push(promise);
      });

      process.stdin.on("close", function () {
        Promise.all(analyzing).then(resolve, reject);
      });
    });

  }
}

// String, Sha, String, Sha → void
function onCommitRange (localSha, remoteSha, conf) {
  var range = localSha; // all local commits until localSha

  if (localSha.match(/^0+$/)) {
    // Delete branch: skip
    return Promise.resolve();
  }

  if (!remoteSha.match(/^0+$/)) {
    // Remote branch exists: build range
    range = remoteSha + ".." + localSha;
  }

  return analyzeRange(range, localSha, conf);
}

// Sha..Sha, Sha → void
function analyzeRange (range, targetSha, conf) {
  return git.run("diff -u " + range).then(function (diff) {
    var allowedFiles = conf.files;
    if (!_.isArray(allowedFiles)) {
      allowedFiles = _.invoke(allowedFiles.split(","), "trim");
    }

    return analyzeDiff(_.filter(parseDiff(diff), function (file) {
      if (!file.to) {
        debug("Ignore deletion", file.from);
        return false;
      }
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
  var options = _.merge({
    "onProgress": function onProgress (err, result, todo) {
      if (err) {
        console.error("[Github-Todos] Error", err);
      } else if (result && result.type === "comment") {
        console.log("[Github-Todos] Added comment to issue #%s (%s) - %s", result.issue, todo.title, result.url);
      } else if (result && result.type === "issue") {
        console.log("[Github-Todos] Created issue #%s (%s) - %s", result.number, todo.title, result.url);
      } else if (!result) {
        console.log("[Github-Todos] Skipped - \"%s\"", todo.title);
      } else {
        console.error("[Github-Todos] Unknown result", result);
      }
      if (result && result.url && conf["open-url"]) {
        open(result.url);
      }
    }
  }, conf);

  function done (/* injectedIssues */) {
    if (process.env.DRY_RUN) {
      console.error("[Github-Todos] Dry Run: Aborting git push");
      process.exit(123);
    } else {
      console.log("[Github-Todos] OK.");
    }
  }

  return todos.fromDiff(conf.repo, diff, sha, options).spread(function (results, todos) {
    if (!conf["inject-issue"]) {
      return false;
    }

    console.log("[Github-Todos] Injecting issue numbers to files…");

    return git.dirty().then(null, function (err) {
      // Ignore error but warn user
      if (process.env.DEBUG) {
        console.error(err.stack || err);
      }
      console.error("[Github-Todos] Warning: could not check if repository is dirty");
      return false;
    }).then(function (dirty) {
      var injects = generateInjects(todos, results);

      if (process.env.DRY_RUN) {
        throw new Error("Simulated execution (DRY_RUN set)");
      }

      return stash(dirty)()
        .then(injectIssues(injects))
        .then(add)
        .then(commit)
        .then(unstash(dirty))
        .then(null, function (err) {
          console.error("[Github-Todos] Warning: failed injecting issues, you may need to do it manually in following files:");
          console.error("[Github-Todos] %s", err);
          _.each(injects, function (inject) {
            console.log("[Github-Todos]  * %s, line %s: Issue #%s", inject.file, inject.line, inject.issue);
          });
        });
    });
  }).then(done);
}

function stash (dirty) {
  return function () {
    return dirty ? git.stash.save() : Promise.resolve();
  };
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

function injectIssues (injects) {
  return function () {
    return Promise.all(injects.map(injectIssue));
  };
}

function injectIssue (inject) {
  return fs.readFile(inject.file).then(function (content) {
    var lines = content.split("\n");
    var line = lines[inject.line - 1];
    var index = line.indexOf(inject.title);
    if (index === -1) {
      return Promise.resolve();
    }

    var head = line.substring(0, index);
    var matchIssue = head.match(/#(\d+)(\s+)$/);
    if (matchIssue && String(inject.issue) === matchIssue[1]) {
      // Already added
      return Promise.resolve();
    }

    var rest = line.substring(index);
    line = head + "#" + inject.issue + " " + rest;
    lines[inject.line - 1] = line;
    content = lines.join("\n");

    return fs.writeFile(inject.file, content);
  });
}

function add () {
  return git.run("add .");
}

function commit () {
  return git.run("commit -m '[Github-Todos] Inject issue numbers'")
    .then(function () {
      console.log("[Github-Todos] Added a commit containing issue injections");
    })
    .then(null, function (err) {
      console.error("[Github-Todos] Failed to commit");
      throw err;
    });
}

function unstash (dirty) {
  return function () {
    return (dirty ? git.stash.pop() : Promise.resolve())
      .then(null, function (err) {
        console.error("[Github-Todos] Warning: could not run 'git stash pop'");
        console.error("[Github-Todos]          %s", err);
        console.error("[Github-Todos] You may want to remove commit (`git reset --soft HEAD~1`) and clean conflicts before running `git stash pop` manually");
        throw err;
      });
  };
}
