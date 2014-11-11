"use strict";

var Github = require("github");
var _ = require("lodash");
var inquirer = require("inquirer");

var config = require("./config");

/**
 * Format of an issue:
 * * type:   String - "issue"
 * * number: Number
 * * url:    String
 * * title:  String
 *
 * Format of a comment:
 * * type:   String - "comment"
 * * issue: Number
 * * url:   String
 **/


module.exports = {
  "connect":          connect,
  "findIssueByTitle": findIssueByTitle,
  "allIssues":        allIssues,
  "getFileUrl":       getFileUrl,
  "createIssue":      createIssue,
  "commentIssue":     commentIssue,
  "tagIssue":         tagIssue
};


var CLIENT = null;


function findIssueByTitle (repo, title, cb) {
  console.log("WIP: github.findIssueByTitle", title);

  cb(null, null);
}

function allIssues (repo, cb) {
  console.log("WIP: github.allIssues");

  cb(null, null);
}

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

function createIssue (repo, title, body, cb) {
  console.log("WIP: github.createIssue", title, body);

  cb(null, {
    type:   "issue",
    number: 42,
    url:    "https://github.com/" + repo + "/issues/42",
    title:  title
  });
}

function commentIssue (repo, number, comment, cb) {
  console.log("WIP: github.commentIssue", number, comment);

  cb({
    type:  "comment",
    issue: number,
    url:   "https://github.com/" + repo + "/issues/" + number + "#issuecomment-3376876"
  });
}

function tagIssue (repo, number, label, cb) {
  console.log("WIP: github.tagIssue", number, label);

  cb(null);
}

function githubOption (conf, option) {
  var key = "github." + option;

  return (typeof conf[key] === "undefined") ? config.defaults[key] : conf[key];
}

function connect (conf, cb) {
  var client = new Github({
    "debug":    false,
    "host":     githubOption(conf, "host"),
    "protocol": githubOption(conf, "secure") ? "https" : "http",
    "version":  githubOption(conf, "version")
  });

  var token = githubOption(conf, "token");

  if (token) {
    client.authenticate({
      type:   "oauth",
      token:  token
    });

    checkToken(client, cb);
  } else {
    getToken(client, cb);
  }
}

function checkToken (client, cb) {
  // TODO simple API call
  client.user.get({}, function (err) {
    if (err) {
      console.error("Failed to validate Github OAuth token: please check API access (network?) or force re-authentication with 'github-todos auth --force'");
      return cb(err);
    }

    cb();

    // Store client for next API calls
    CLIENT = client;
  });
}

function getToken (client, cb) {
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
        });
      } else {
        onCreate(err, res);
      }
    });
  });
}
