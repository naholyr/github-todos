"use strict";

var _ = require("lodash");
var Path = require("path");
var fs = require("../fs");
var todotxt = require("todotxt");


// Exposed API
module.exports = {
  "meta": {
    "desc": "TODO.txt issue service",
    "repo": "/path/to/todo.txt (default = ./todo.txt)",
    "conf": ["todotxt.context", "todotxt.project", "todotxt.priority"]
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


// Converters

function convertIssue (item) {
  if (!item) {
    return null;
  }

  return {
    "type":   "issue",
    "number": item.number,
    "title":  item.text,
    "labels": item.contexts
  };
}

function convertIssues (items) {
  return items.map(convertIssue);
}

function read (repo) {
  return fs.readFile(repo).then(todotxt.parse).catch(_.constant([]));
}

function write (items, repo) {
  return fs.writeFile(repo, todotxt.stringify(items));
}

function getItemByNumber (items, number) {
  var item = _.find(items, {number: number});
  if (item) {
    return Promise.resolve(item);
  } else {
    return Promise.reject("Task #" + number + " not found");
  }
}


function connect (conf) {
  return read(conf.repo).then(function (items) {
    // Add conf options to object
    items.options = {
      "context": conf["todotxt.context"],
      "project": conf["todotxt.project"],
      "priority": conf["todotxt.priority"]
    };

    return items;
  });
}

function findIssueByTitle (items, repo, title) {
  title = title.toLowerCase();
  return convertIssue(_.find(items, function (item) {
    return item && item.text.toLowerCase().indexOf(title) !== -1;
  }));
}

function allIssues (client, repo) {
  return fs.readFile(repo).then(todotxt.parse).then(convertIssues);
}

// Synchronously generate direct link to todo.txt
function getFileUrl (repo, path) {
  return "file://" + Path.resolve(path);
}

// Note: body is ignored
function createIssue (items, repo, title, body, labels) {
  var item = todotxt.item({text: title, date: new Date(), number: items.length + 1});
  labels.forEach(item.addContext);

  if (items.options) {
    if (items.options.priority) {
      item.priority = items.options.priority;
    }
    if (items.options.context) {
      item.addContext(items.options.context);
    }
    if (items.options.project) {
      item.addProject(items.options.project);
    }
  }

  items.push(item);

  return write(items, repo).then(_.constant(convertIssue(item)));
}

// Unsupported: reopen issue instead
function commentIssue (items, repo, number) {
  return getItemByNumber(items, number).then(function (item) {
    item.complete = false;
    return write(items, repo).then(_.constant(convertIssue(item)));
  });
}

function tagIssue (items, repo, number, label) {
  return getItemByNumber(items, number).then(function (item) {
    item.addContext(label);
    return write(items, repo).then(_.constant(convertIssue(item)));
  });
}

function guessRepoFromUrl () {
  return Path.resolve("./todo.txt");
}
