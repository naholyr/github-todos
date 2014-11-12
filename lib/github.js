"use strict";

var Github = require("github");
var _ = require("lodash");
var inquirer = require("inquirer");
var ttys = require("ttys");
var debug = require("debug")("github-todos:github");

var config = require("./config");

/**
 * Format of an issue:
 * * type:   String - "issue"
 * * number: Number
 * * url:    String
 * * title:  String
 * * labels: [String]
 *
 * Format of a comment:
 * * type:  String - "comment"
 * * issue: Number
 * * url:   String
 **/


module.exports = {
  "connect":          connect,
  "findIssueByTitle": requireClient(findIssueByTitle),
  "allIssues":        requireClient(allIssues),
  "getFileUrl":       getFileUrl,
  "createIssue":      requireClient(createIssue),
  "commentIssue":     requireClient(commentIssue),
  "tagIssue":         requireClient(tagIssue)
};


var CLIENT = null;

var FAKE_ISSUE = {
  "type":   "issue",
  "number": -1,
  "url":    "http://nope",
  "title":  "FAKE",
  "labels": []
};

var FAKE_COMMENT = {
  "type":   "comment",
  "issue":  -1,
  "url":    "http://nope"
};

// "work" is called only if github client is connected, otherwise try to authenticate and call work
// Function(…, cb) → Function(…, cb)
function requireClient (work) {
  return function () {
    var self = this;
    var args = Array.prototype.slice.call(arguments);
    var cb = args[args.length - 1];
    if (!cb || !_.isFunction(cb)) {
      cb = function (err) {
        if (err) {
          throw err;
        }
      };
    }

    if (!CLIENT) {
      // Grab config…
      debug("config.list");
      config.list(function (err, conf) {
        if (err) {
          return cb(err);
        }

        // …then connect…
        connect(conf, function (err) {
          if (err) {
            return cb(err);
          }

          // …then work!
          work.apply(self, args);
        });
      });
    } else {
      // Already connected: work!
      work.apply(self, args);
    }
  };
}

// String → {user, repo}
function extractRepo (repo) {
  var parts = repo.split("/");

  return {
    "user": parts[0],
    "repo": parts[1]
  };
}

// Grab first issue with given title
// String, String ~→ Issue
function findIssueByTitle (repo, title, cb) {
  debug("findIssueByTitle", repo, title);
  title = title.toLowerCase();
  allIssues(repo, function (err, issues) {
    if (err) {
      return cb(err);
    }

    cb(null, _.find(issues, function (issue) {
      return issue.title.toLowerCase() === title;
    }));
  });
}

// Convert a Github issue into a lighter object
// Object → Issue
function fromGithubIssue (issue) {
  return {
    "type":   "issue",
    "number": issue.number,
    "url":    issue.html_url,
    "title":  issue.title,
    "labels": _.pluck(issue.labels, "name")
  };
}

// String ~→ [Issue]
function allIssues (repo, cb) {
  debug("allIssues");

  if (process.env.DRY_RUN) {
    return cb(null, []);
  }

  CLIENT.issues.repoIssues(extractRepo(repo), function (err, issues) {
    if (err) {
      return cb(err);
    }

    cb(null, issues.map(fromGithubIssue));
  });
}

// Generate Github URL to blob
// String, String, Sha, Number → String
function getFileUrl (repo, path, sha, line) {
  var url = "https://github.com/" + repo + "/blob/";

  if (sha) {
    url += sha + "/";
  }

  url += path;

  if (line) {
    url += "#L" + line;
  }

  return url;
}

// String, String, String, [String] ~→ Issue
function createIssue (repo, title, body, labels, cb) {
  debug("createIssue", repo, title, body);

  if (process.env.DRY_RUN) {
    return cb(null, FAKE_ISSUE);
  }

  CLIENT.issues.create(_.merge(extractRepo(repo), {
    "title":  title,
    "body":   body,
    "labels": labels
  }), function (err, issue) {
    cb(err, issue && fromGithubIssue(issue));
  });
}

// String, Number, String ~→ Comment
function commentIssue (repo, number, comment, cb) {
  debug("commentIssue", repo, number, comment);

  if (process.env.DRY_RUN) {
    return cb(null, FAKE_COMMENT);
  }

  CLIENT.issues.createComment(_.merge(extractRepo(repo), {
    "number": number,
    "body":   comment
  }), function (err, comment) {
    cb(err, comment && {
      "type":   "comment",
      "issue":  number,
      "url":    comment.html_url
    });
  });
}

// Add a label (append, not replace)
// String, Number, String ~→ Issue
function tagIssue (repo, number, label, cb) {
  debug("tagIssue", repo, number, label);

  if (process.env.DRY_RUN) {
    return cb(null, FAKE_ISSUE);
  }

  CLIENT.issues.getRepoIssue(_.merge(extractRepo(repo), {
    "number": number
  }), function (err, issue) {
    if (err) {
      return cb(err);
    }

    var labels = _.pluck(issue.labels, "name");
    if (!_.contains(labels, label)) {
      CLIENT.issues.edit(_.merge(extractRepo(repo), {
        "number": number,
        "labels": labels.concat([label])
      }), function (err, issue) {
        cb(err, issue && fromGithubIssue(issue));
      });
    } else {
      cb(null, fromGithubIssue(issue));
    }
  });
}

// Object, String → Mixed
function githubOption (conf, option) {
  var key = "github." + option;

  return (typeof conf[key] === "undefined") ? config.defaults[key] : conf[key];
}

// Authenticate to Github (will enable all other APIs)
// Object ~→ void
function connect (conf, cb) {
  if (process.env.DRY_RUN) {
    CLIENT = {};
    return cb();
  }

  debug("connect", conf);
  var client = new Github({
    "debug":    false,
    "host":     githubOption(conf, "host"),
    "protocol": githubOption(conf, "secure") ? "https" : "http",
    "version":  githubOption(conf, "version")
  });

  var token = githubOption(conf, "token");

  if (token) {
    debug("token found: authenticate", token);
    client.authenticate({
      type:   "oauth",
      token:  token
    });

    checkToken(client, cb);
  } else {
    getToken(client, cb);
  }
}

// Check if OAuth token is still working with a simple API call
// Sets CLIENT (this enables "requireClient" functions)
// Client ~→ void
function checkToken (client, cb) {
  debug("checkToken");
  client.user.get({}, function (err) {
    if (err) {
      console.error("Failed to validate Github OAuth token: please check API access (network?) or force re-authentication with 'github-todos auth --force'");
      return cb(err);
    }

    // Store client for next API calls
    CLIENT = client;

    cb();
  });
}

// Authenticate then stores OAuth token to user's configuration for later use
// Client ~→ void
function getToken (client, cb) {
  debug("getToken");
  console.log("No token found to access Github API. I will now ask for your username and password to generate one.");
  console.log("Those information ARE NOT STORED, only the generated token will be stored in your global git configuration.");
  console.log("If you don't want to let this process go you'll have to generate a token yourself and then save it with 'github-todos config github.token <your token>'.");

  inquirer.prompt([
    {"type": "input",     "message": "Github username", "name": "user"},
    {"type": "password",  "message": "Github password", "name": "password"}
  ], function (answers) {

    client.authenticate({
      "type":     "basic",
      "username": answers.user,
      "password": answers.password
    });

    var payload = {
      "note":     "Github-Todos (" + (new Date()) + ")",
      "note_url": "https://github.com/naholyr/github-todos",
      "scopes":   ["user", "repo"]
    };

    function onCreate (err, res) {
      if (err) {
        return cb(err);
      }

      if (!res.token) {
        return cb(new Error("No token generated"));
      }

      config.set("github.token", res.token, function (err) {
        if (err) {
          return cb(err);
        }

        client.authenticate({
          type:   "oauth",
          token:  res.token
        });

        cb();
      });
    }

    client.authorization.create(payload, function (err, res) {
      if (err && err.code === 401 && err.message && err.message.indexOf("OTP") !== -1) {
        // Two-factor authentication
        console.log("You are using two-factor authentication, please enter your code to finish:");
        inquirer.prompt([{"type": "input", "message": "Code", "name": "code"}], function (answers) {
          _.merge(payload, {
            "headers": {
              "X-GitHub-OTP": answers.code
            }
          });
          client.authorization.create(payload, onCreate);
        }, {
          input:  ttys.stdin,
          output: ttys.stdout
        });
      } else {
        onCreate(err, res);
      }
    });
  }, {
    input: ttys.stdin,
    output: ttys.stdout
  });
}
