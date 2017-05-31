"use strict";

/**
 * Format of a todo:
 * * file:  String - Relative path
 * * sha:   String - Commit's sha
 * * line:  Number - File line number
 * * title: String - Issue's title
 * * label: String - Issue's label
 * * issue: Number - (optional) Issue's number
 **/

var path = require("path");
var _ = require("lodash");
var Promise = require("bluebird");

var ask = require("./ask");
var fs = require("./fs");
var config = require("./config");
var service = require("./issue-service");
var git = require("./git");


module.exports = {
  "fromDiff": fromDiff
};


var SKIP_FILE_NAME = ".github-todos-ignore";


function readIgnoreFile () {
  return git.dir(path.join("..", SKIP_FILE_NAME))
    .then(function (filename) {
      return fs.readFile(filename).then(function (content) {
        var ignored = _.filter(_.invoke((content || "").split("\n"), "trim"));
        return [ignored, filename];
      });
    });
}

function shouldSkip (title, caseSensitive) {
  title = String(title || "").trim();
  if (caseSensitive) {
    title = title.toLowerCase();
  }

  return readIgnoreFile().spread(function (ignores) {
    if (caseSensitive) {
      ignores = _.invoke(ignores, "toLowerCase");
    }

    return _.contains(ignores, title);
  });
}

function createOrCommentIssue (repo, todo, conf) {
  if (todo.issue) {
    return commentIssue(todo, conf);
  }

  // Create issue?
  return shouldSkip(todo.title, conf["case-sensitive"]).then(function (skip) {
    if (skip) {
      return null;
    }

    var Service = service(conf.service);

    return Service.findIssueByTitle(repo, todo.title).then(function (issue) {
      if (!issue) {
        return createIssue(repo, todo, conf);
      }

      // comment issue
      todo.issue = issue.number;

      var ops = [commentIssue(repo, todo, conf)];

      if (!_.contains(issue.labels, todo.label)) {
        ops.push(Service.tagIssue(repo, todo.issue, todo.label));
      }

      return Promise.all(ops).spread(function (comment /*, tagresult */) {
        return comment;
      });
    });
  });
}

// Add line to github-todos-ignore
function rememberSkip (title) {
  return readIgnoreFile().spread(function (ignores, skipFile) {
    if (!_.contains(ignores, title)) {
      return fs.writeFile(skipFile, ignores.concat([title]).join("\n"));
    }
  });
}

function createIssue (repo, todo, conf) {
  if (!conf["confirm-create"]) {
    return create();
  }

  return ask([{
    "type": "expand",
    "message": "Create new issue \"" + todo.title + "\" (" + todo.file + ":" + todo.line + ")",
    "name": "choice",
    "choices": [
      {"key": "y", "name": "Create issue", "value": "create"},
      {"key": "e", "name": "Edit title and create issue", "value": "edit"},
      {"key": "n", "name": "Do not create issue", "value": "skip"},
      {"key": "r", "name": "Do not create issue and remember for next times", "value": "skip_and_remember"},
      {"key": "q", "name": "Abort", "value": "abort"}
    ],
    "default": 0
  }]).choices("choice", {
    "create":             create,
    "edit":               edit,
    "skip_and_remember":  skipAndRemember,
    "abort":              abort,
    "skip":               null, // skip
    "default":            null  // skip
  });

  function abort () {
    var e = new Error("User aborted");
    e.code = "EINTERRUPT";
    throw e;
  }

  function skipAndRemember () {
    return rememberSkip(todo.title).then(null, function (err) {
      console.error("[Github-Todos] Failed adding info to '" + SKIP_FILE_NAME + "'");
      throw err;
    });
  }

  function create (forceTitle) {
    return getCommentText(repo, todo, conf).then(function (text) {
      var title = (typeof forceTitle === "string" && forceTitle) ? forceTitle : todo.title;
      return service(conf.service).createIssue(repo, title, text, [todo.label]).then(function (issue) {
        return issue;
      });
    });
  }

  function edit () {
    return ask([{
      "type": "input",
      "message": "Issue title",
      "name": "title",
      "default": todo.title
    }]).then(function (answers) {
      return create(answers.title);
    });
  }
}

function commentIssue (repo, todo, conf) {
  return getCommentText(repo, todo, conf).then(function (text) {
    return service(conf.service).commentIssue(repo, todo.issue, text);
  });
}

function getCommentText (repo, todo, conf) {
  var text = "";

  // Link to file
  text += "Ref. [" + todo.file + ":" + todo.line + "](" + service(conf.service).getFileUrl(repo, todo.file, todo.sha, todo.line) + ")";

  function generateCommentText (content) {
    var lines = content.split(/\r\n|\r|\n/);

    // Remove trailing new lines
    while (lines[lines.length - 1] === "") {
      lines.pop();
    }
    while (lines[0] === "") {
      lines.shift();
    }

    if (conf.context > 0) {
      // Extract: line to line + conf.context
      var extract = lines.slice(todo.line - 1, todo.line + conf.context).join("\n");
      if (todo.line + conf.context < lines.length) {
        extract += "\n…";
      }

      text += "\n\n```" + getLanguage(todo.file, content) + "\n" + extract + "\n```\n";
    }

    if (conf.signature) {
      text += "\n" + conf.signature;
    }

    return text;
  }

  // Add code information
  return git.dir(path.join("..", todo.file))
    .then(fs.readFileStrict)
    .then(generateCommentText);
}

// Language detection: very naive only based on filename for now
function getLanguage (filename /*, content */) {
  var index = filename.lastIndexOf(".");
  if (index === -1) {
    return "";
  }

  return filename.substring(index + 1);
}

function fromDiff (repo, diff, sha, conf) {
  return config.defaults().then(function (defaults) {
    conf = _.merge({ "onProgress": _.noop }, defaults, conf || {});

    var todos = _.flatten(_.map(diff, function (file) {
      var addedLines = _.filter(file.lines, "add");
      var lineTodos = _.map(addedLines, lineToTodoMapper(file.to, sha, conf));
      // keep only those with required field
      return _.filter(lineTodos, "title");
    }));

    return todos.reduce(function (previous, todo) {
      return previous.then(todoHandler(repo, todo, conf));
    }, Promise.resolve([])).then(function (results) {
      return [results, todos];
    });
  });
}

function todoHandler (repo, todo, conf) {
  return function (results) {
    return git.blame(todo.file, todo.line)
      .then(function(email) {
        // Map email to assignee
        var keys = Object.keys(conf).filter(function(key) {
          return key.indexOf('github.assignee.') === 0;
        });
        var assignees = {};
        for (var i = 0, len = keys.length; i < len; i++) {
          var emails = conf[keys[i]].split(',');
          emails.forEach(function(email) {
            assignees[email] = keys[i].substr('github.assignee.'.length);
          });
        }

        // Assign issue to engineer
        if (assignees.hasOwnProperty(email)) {
          todo.assignee = assignees[email];
        }

        return createOrCommentIssue(repo, todo, conf);
      })
      .then(function (result) {
        conf.onProgress(null, result, todo);
        return results.concat([result]);
      })
      .then(null, function (err) {
        conf.onProgress(err, null, todo);
        throw err;
      });
  };
}

// String, Sha → String → {file, sha, line, title, label}
function lineToTodoMapper (filename, sha, conf) {
  return function lineToTodo (line) {
    return _.merge({
      "file":   filename,
      "sha":    sha,
      "line":   line.ln
    }, extractTodoTitle(line.content, conf));
  };
}

// String → {title, label}
function extractTodoTitle (content, conf) {
  var result = null;

  var labels = {};
  _.each(conf, function (value, key) {
    if (value && key.match(/^label\./)) {
      var trigger = key.substring(6);
      if (conf["label-whitespace"]) {
        trigger += " ";
      }
      labels[trigger] = value;
    }
  });

  if (_.isString(content)) {
    _.find(Object.keys(labels), function (trigger) {
      var index;
      if (conf["case-sensitive"]) {
        index = content.indexOf(trigger);
      } else {
        index = content.toUpperCase().indexOf(trigger.toUpperCase());
      }

      if (index !== -1) {
        var title = content.substring(index + trigger.length).trim();
        var issue = null;
        if (title && !isCode(title)) {
          var match = title.match(/^\s+#(\d+)\s+/);
          if (match) {
            issue = match[1];
            title = title.substring(match[0].length);
          }
          result = {
            "title":  title,
            "label":  labels[trigger],
            "issue":  Number(issue)
          };
        }
        return true; // break
      }
    });
  }

  return result;
}

// TODO Better heuristic for code vs words detection

// Simple heuristic to detect if a title is really a title or some valid code
// String → Boolean
function isCode (string) {
  // If symbols are more than 20% of the code, it may be code more than human text
  var symbols = _.filter(string, isSymbol);

  return symbols.length / string.length > 0.20;
}

var RE_SYMBOL = /[^\sa-z0-9\u00E0-\u00FC]/i;
// Matches a symbol: non alphanumeric character
// Character → Boolean
function isSymbol (character) {
  return RE_SYMBOL.test(character);
}
