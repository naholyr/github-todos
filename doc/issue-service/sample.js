"use strict";

/*
Sample issue service
*/

// Assuming a module already exists to connect to your service API
var Client = require("your-service-api-client");

// Lodash may be useful (partial, partialRight, map, filter, reduce, constant,
// property… are often useful methods with promises)
var _ = require("lodash");

// Promise-friendly wrapper around Inquirer
var ask = require("../ask");

// Configuration layer API, should be useful to automatically save your credentials
// Remember to enable options in lib/config.js
var config = require("../config");


// Exposed API
module.exports = {
  "meta": {
    "desc": "Sample issue service",
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


// Convert issue to Github-Todos format
function convertIssue (issue) {
  if (!issue) {
    return null;
  }

  return {
    "type":   "issue",
    "number": issue.number,
    "url":    issue.url,
    "title":  issue.title,
    "labels": issue.labels
  };
}

// Convert comment to Github-Todos format
function convertComment (comment) {
  if (!comment) {
    return null;
  }

  return {
    "type":   "comment",
    "issue":  comment.issue,
    "url":    comment.url
  };
}

// This implementation relies on allIssues()
function findIssueByTitle (client, repo, title) {
  title = title.toLowerCase();
  return allIssues(client, repo).then(_.partialRight(_.find, function (issue) {
    return issue.title.toLowerCase() === title;
  }));
}

// Assuming client.getIssues returns promise of issues
function allIssues (client, repo) {
  return client.getIssues(repo).then(function (issues) {
    return issues.map(convertIssue);
  });
}

// Assuming client.createIssue returns a promise of issue
function createIssue (client, repo, title, body, labels) {
  return client.createIssue(repo, title, body, labels).then(convertIssue);
}

// Assuming client.createComment returns a promise of comment
function commentIssue (client, repo, number, comment) {
  return client.createComment(repo, number, comment).then(convertComment);
}

// Assuming client.addLabel returns a promise of issue
function tagIssue (client, repo, number, label) {
  return client.addLabel(repo, number, label).then(convertIssue);
}

// Synchronously generate direct link to file
function getFileUrl (repo, path, sha, line) {
  return "https://my-host.com/" + repo + "/file/" + sha + "/" + path + "#" + line;
}

// Synchronously generate "repo" value from remote url
function guessRepoFromUrl (url) {
  var match = url.match(/my-host\.com[:\/]([^\/]+\/[^\/]+?)(?:\.git)?$/);

  return match && match[1];
}

// Assuming option "my-host.token" has been enabled in "../config.js"
// Assuming client.setToken sets authorization token for next calls
function connect (conf) {
  // Instantiating API client, this is the one that will be passed to other methods
  var client = new Client();

  if (conf["my-host.token"]) {
    // Authorize client
    client.setToken(conf["my-host.token"]);
    // Check token…
    return checkToken(client)
      .then(null, function () {
        // …and create a new one if it failed
        console.error("Existing token is invalid");
        return createToken(client);
      });
  } else {
    // No token found: create new one
    return createToken(client);
  }
}

// Assuming client.checkAuthorization returns a promise of anything, rejected if
// authentication fails
function checkToken (client) {
  return client.checkAuthorization().then(function () {
    // Authentication successful: return client back to connect()
    return client;
  });
}

// Assuming client.createToken returns a promise of string
function createToken (client) {
  return ask([
    {"type": "input",     "message": "Username", "name": "user"},
    {"type": "password",  "message": "Password", "name": "password"}
  ]).then(function (answers) {
    return client.createToken(answers.username, answers.password)
      .then(saveToken)
      .then(function (token) {
        // Authorize client…
        client.setToken(token);
        // …and send it back to connect()
        return client;
      });
  });
}

function saveToken (token) {
  return config.set("my-host.token", token).then(_.constant(token));
}
