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
var fs = require("fs");
var async = require("async");
var _ = require("lodash");

var config = require("./config");
var github = require("./github");


module.exports = {
  "fromDiff": fromDiff
};


function createOrCommentIssue (repo, todo, conf, cb) {
  if (todo.issue) {
    commentIssue(todo, conf, cb);
  } else {
    github.findIssueByTitle(repo, todo.title, function (err, issue) {
      if (err) {
        cb(err);
      } else if (issue) {

        todo.issue = issue.number;

        var ops = {
          "comment": _.partial(commentIssue, repo, todo, conf)
        };
        if (!_.contains(issue.labels, todo.label)) {
          ops.tag = _.partial(github.tagIssue, repo, todo.issue, todo.label);
        }

        async.parallel(ops, function (err, res) {
          if (err) {
            return cb(err);
          }

          cb(null, res.comment);
        });

      } else {
        createIssue(repo, todo, conf, cb);
      }
    });
  }
}

function createIssue (repo, todo, conf, cb) {
  getCommentText(repo, todo, conf, function (err, text) {
    if (err) {
      return cb(err);
    }

    github.createIssue(repo, todo.title, text, [todo.label], cb);
  });
}

function commentIssue (repo, todo, conf, cb) {
  getCommentText(repo, todo, conf, function (err, text) {
    if (err) {
      return cb(err);
    }

    github.commentIssue(repo, todo.issue, text, cb);
  });
}

function getCommentText (repo, todo, conf, cb) {
  var text = "";

  // Link to file
  text += "Ref. [" + todo.file + ":" + todo.line + "](" + github.getFileUrl(repo, todo.file, todo.sha, todo.line) + ")";

  // Add code information
  fs.readFile(path.resolve(todo.file), {encoding: "utf8"}, function (err, content) {
    if (err) {
      return cb(err);
    }

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

      // TODO syntax highlighting?
      text += "\n\n```\n" + extract + "\n```\n";
    }

    if (conf.signature) {
      text += "\n" + conf.signature;
    }

    cb(null, text);
  });
}

function fromDiff (repo, diff, sha, conf, cb) {
  if (_.isFunction(conf)) {
    cb = conf;
    conf = null;
  }
  conf = _.merge({
    "onProgress": _.noop
  }, conf || {}, config.defaults);

  var todos = _.flatten(_.map(diff, function (file) {
    var addedLines = _.filter(file.lines, "add");
    var lineTodos = _.map(addedLines, lineToTodoMapper(file.to, sha, conf));
    // keep only those with required field
    return _.filter(lineTodos, "title");
  }));

  async.mapSeries(todos, function (todo, cb) {
    createOrCommentIssue(repo, todo, conf, function (err, result) {
      conf.onProgress(err, result, todo);
      cb(err, result);
    });
  }, function (err, results) {
    cb(err, results, todos);
  });
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
