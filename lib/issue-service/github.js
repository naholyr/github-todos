"use strict";

var Github = require("github");
var _ = require("lodash");
var Promise = require("bluebird");
var debug = require("debug")("github-todos:github");

var ask = require("../ask");
var config = require("../config");

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
  "meta": {
    "desc": "Github issue service",
    "repo": "user/repository"
  },

  "connect":          connect,
  "findIssueByTitle": requireClient(findIssueByTitle),
  "allIssues":        requireClient(allIssues),
  "getFileUrl":       getFileUrl,
  "createIssue":      requireClient(createIssue),
  "commentIssue":     requireClient(commentIssue),
  "tagIssue":         requireClient(tagIssue),
  "guessRepoFromUrl": guessRepoFromUrl
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
    var args = arguments;

    if (!CLIENT) {
      debug("no client: connect before work");
      return config.list().then(connect).then(function () {
        return work.apply(self, args);
      });
    } else {
      // Already connected: work!
      return work.apply(self, args);
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
function findIssueByTitle (repo, title) {
  debug("findIssueByTitle", repo, title);
  title = title.toLowerCase();
  return allIssues(repo).then(_.partialRight(_.find, function (issue) {
    return issue.title.toLowerCase() === title;
  }));
}

// Convert a Github issue into a lighter object
// Object → Issue
function fromGithubIssue (issue) {
  if (!issue) {
    return null;
  }

  return {
    "type":   "issue",
    "number": issue.number,
    "url":    issue.html_url,
    "title":  issue.title,
    "labels": _.pluck(issue.labels, "name")
  };
}

// String ~→ [Issue]
function allIssues (repo) {
  debug("allIssues");

  if (process.env.DRY_RUN) {
    return Promise.resolve([]);
  }

  return CLIENT.repoIssues(extractRepo(repo)).then(_.partialRight(_.map, fromGithubIssue));
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
function createIssue (repo, title, body, labels) {
  debug("createIssue", repo, title, body);

  if (process.env.DRY_RUN) {
    return Promise.resolve(FAKE_ISSUE);
  }

  return CLIENT.createIssue(_.merge(extractRepo(repo), {
    "title":  title,
    "body":   body,
    "labels": labels
  })).then(fromGithubIssue);
}

// String, Number, String ~→ Comment
function commentIssue (repo, number, comment) {
  debug("commentIssue", repo, number, comment);

  if (process.env.DRY_RUN) {
    return Promise.resolve(FAKE_COMMENT);
  }

  CLIENT.commentIssue(_.merge(extractRepo(repo), {
    "number": number,
    "body":   comment
  })).then(function (comment) {
    return {
      "type":   "comment",
      "issue":  number,
      "url":    comment.html_url
    };
  });
}

// Add a label (append, not replace)
// String, Number, String ~→ Issue
function tagIssue (repo, number, label) {
  debug("tagIssue", repo, number, label);

  if (process.env.DRY_RUN) {
    return Promise.resolve(FAKE_ISSUE);
  }

  CLIENT.getIssue(_.merge(extractRepo(repo), {
    "number": number
  })).then(function (issue) {
    var labels = _.pluck(issue.labels, "name");
    if (!_.contains(labels, label)) {
      return CLIENT.updateIssue(_.merge(extractRepo(repo), {
        "number": number,
        "labels": labels.concat([label])
      })).then(fromGithubIssue);
    } else {
      return fromGithubIssue(issue);
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
function connect (conf) {
  if (process.env.DRY_RUN) {
    CLIENT = {}; // make it truthy for "requireClient"
    return Promise.resolve();
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

    return checkToken(client);
  }

  return getToken(client);
}

// Check if OAuth token is still working with a simple API call
// Sets CLIENT (this enables "requireClient" functions)
// Client ~→ void
function checkToken (client) {
  debug("checkToken");
  return Promise.promisify(client.user.get, client.user)({})
    .then(null, function (err) {
      console.error("Failed to validate Github OAuth token: please check API access (network?) or force re-authentication with 'github-todos auth --force'");
      throw err;
    })
    .then(function () {
      // Store client for next API calls
      CLIENT = {
        "repoIssues":     Promise.promisify(client.issues.repoIssues, client.issues),
        "createIssue":    Promise.promisify(client.issues.create, client.issues),
        "commentIssue":   Promise.promisify(client.issues.createComment, client.issues),
        "getIssue":       Promise.promisify(client.issues.getRepoIssue, client.issues),
        "updateIssue":    Promise.promisify(client.issues.edit, client.issues)
      };
    });
}

// Authenticate then stores OAuth token to user's configuration for later use
// Client ~→ void
function getToken (client) {
  debug("getToken");
  console.log("No token found to access Github API. I will now ask for your username and password to generate one.");
  console.log("Those information ARE NOT STORED, only the generated token will be stored in your global git configuration.");
  console.log("If you don't want to let this process go you'll have to generate a token yourself and then save it with 'github-todos config github.token <your token>'.");

  return ask([
    {"type": "input",     "message": "Github username", "name": "user"},
    {"type": "password",  "message": "Github password", "name": "password"}
  ]).then(function (answers) {

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

    return Promise.promisify(client.authorization.create, client.authorization)(payload)
      .then(null, function (err) {
        if (err && err.code === 401 && err.message && err.message.indexOf("OTP") !== -1) {
          // Two-factor authentication
          console.log("You are using two-factor authentication, please enter your code to finish:");
          return twoFactorAuth(client, payload);
        } else {
          throw err;
        }
      })
      .then(saveToken(client));
  });
}

function saveToken (client) {
  return function (res) {
    if (!res || !res.token) {
      throw new Error("No token generated");
    }

    return config.set("github.token", res.token).then(function () {
      client.authenticate({
        type:   "oauth",
        token:  res.token
      });
    });
  };
}

function twoFactorAuth (client, payload) {
  return ask([{"type": "input", "message": "Code", "name": "code"}]).then(function (answers) {
    _.merge(payload, {
      "headers": {
        "X-GitHub-OTP": answers.code
      }
    });

    return Promise.promisify(client.authorization.create, client.authorization)(payload);
  });
}

function guessRepoFromUrl (url) {
  var match = url.match(/github\.com[:\/]([^\/]+\/[^\/]+?)(?:\.git)?$/);

  return match && match[1];
}
