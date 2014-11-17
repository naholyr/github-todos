"use strict";

var request = require("request");
var _ = require("lodash");
var Promise = require("bluebird");
var debug = require("debug")("github-todos:bitbucket");

var ask = require("../ask");
var config = require("../config");


// Exposed API
module.exports = {
  "meta": {
    "desc": "Bitbucket issue service",
    "repo": "user/repository"
  },

  "connect":          connect,
  "findIssueByTitle": findIssueByTitle,
  "allIssues":        allIssues,
  "getFileUrl":       getFileUrl,
  "createIssue":      createIssue,
  "commentIssue":     commentIssue,
  "tagIssue":         tagIssue,
  "guessRepoFromUrl": guessRepoFromUrl
};


// Base API tools

var HOST = "https://bitbucket.org";

var getP = Promise.promisify(request.get);
var postP = Promise.promisify(request.post);

function responseBody (res, body) {
  if (res.statusCode === 204) {
    return null;
  }

  if (String(res.statusCode)[0] !== "2") {
    throw new Error(body);
  }

  if (_.isString(body) && body.length > 0) {
    return JSON.parse(body);
  }

  return body;
}

function get (path, options) {
  debug("GET", HOST + "/api/" + path, options);
  return getP(_.merge({ url: HOST + "/api/" + path }, options || {})).spread(responseBody);
}

function post (path, data, options) {
  debug("POST", HOST + "/api/" + path, data, options);
  return postP(_.merge({url: HOST + "/api/" + path, form: data}, options || {})).spread(responseBody);
}


// Converters

function convertIssue (issue) {
  if (!issue) {
    return null;
  }

  return {
    "type":   "issue",
    "number": issue.local_id,
    "url":    HOST + issue.resource_uri.replace(/^\/[\d\.]+\/repositories/, ""),
    "title":  issue.title,
    "labels": [] // unsupported
  };
}

function findIssueByTitle (oauth, repo, title) {
  title = title.toLowerCase();
  return allIssues(oauth, repo).then(_.partialRight(_.find, function (issue) {
    return issue.title.toLowerCase() === title;
  }));
}

function allIssues (oauth, repo) {
  return get("1.0/repositories/" + repo + "/issues", { "oauth": oauth })
    .then(null, function (err) {
      if (err.message.match(/Not Found/i)) {
        console.error("[Github-Todos] Issues not found: have you enabled issue tracking on your repository?");
        console.error("[Github-Todos] Please check https://bitbucket.org/" + repo + "/admin/issues");
        throw err;
      }
    })
    .then(_.property("issues"))
    .map(convertIssue);
}

function createIssue (oauth, repo, title, body /*, labels */) {
  var data = {
    "title":    title,
    "content":  body
  };

  return post("1.0/repositories/" + repo + "/issues", data, { "oauth": oauth }).then(convertIssue);
}

function commentIssue (oauth, repo, number, comment) {
  var data = {
    "content": comment
  };

  return post("1.0/repositories/" + repo + "/issues/" + number + "/comments", data, { "oauth": oauth }).then(function (comment) {
    return {
      "type":   "comment",
      "issue":  number,
      "url":    HOST + "/" + repo + "/issue/" + number + "#comment-" + comment.comment_id
    };
  });
}

function tagIssue (/* oauth, repo, number, label */) {
  // Unsupported
  return Promise.resolve();
}

// Synchronously generate direct link to file
function getFileUrl (repo, path, sha, line) {
  return HOST + "/" + repo + "/src/" + sha + "/" + path + "#cl-" + line;
}

// Synchronously generate "repo" value from remote url
function guessRepoFromUrl (url) {
  var match = url.match(/bitbucket\.org[:\/]([^\/]+\/[^\/]+?)(?:\.git)?$/);

  return match && match[1];
}

function connect (conf) {
  if (conf["bitbucket.secret"] && conf["bitbucket.key"]) {
    var oauth = {
      "consumer_key":     conf["bitbucket.key"],
      "consumer_secret":  conf["bitbucket.secret"]
    };

    return checkOAuth(oauth).then(null, createOAuth);
  } else {
    // No token found: create new one
    return createOAuth();
  }
}

function checkOAuth (oauth) {
  return get("1.0/user", {"oauth": oauth}).then(function (user) {
    if (!user) {
      throw new Error("Authentication failed");
    }

    return oauth;
  });
}

function createOAuth () {
  return ask([
    {"type": "input",     "message": "Bitbucket username", "name": "user"},
    {"type": "password",  "message": "Bitbucket password", "name": "pass"}
  ]).then(function (auth) {
    return get("1.0/users/" + auth.user + "/consumers", { "auth": auth })
      .then(_.partialRight(_.findLast, {"name": "github-todos"}))
      .then(function (found) {
        if (found) {
          return found;
        }

        var data = {
          "name":         "github-todos",
          "description":  "Github-Todos CLI"
        };

        return post("1.0/users/" + auth.user + "/consumers", data, { "auth": auth });
      })
      .then(saveOAuth);
    });
}

function saveOAuth (consumer) {
  return config.set("bitbucket.key", consumer.key)
    .then(function () {
      return config.set("bitbucket.secret", consumer.secret);
    })
    .then(function () {
      return _.pick(consumer, ["key", "secret"]);
    });
}
