"use strict";

/**
 * Format of an issue:
 * * type:   String - "issue"
 * * number: Number
 * * url:    String
 * * title:  String
 * * body:   String
 *
 * Format of a comment:
 * * type:   String - "comment"
 * * issue: Number
 * * url:   String
 * * body:  String
 **/


module.exports = {
  "findIssueByTitle": findIssueByTitle,
  "allIssues":        allIssues,
  "getFileUrl":       getFileUrl,
  "createIssue":      createIssue,
  "commentIssue":     commentIssue,
  "tagIssue":         tagIssue
};


var GITHUB_USER = "todo";
var GITHUB_REPO = "todo";


function findIssueByTitle (title, cb) {
  console.log("WIP: github.findIssueByTitle", title);

  cb(null, null);
}

function allIssues (cb) {
  console.log("WIP: github.allIssues");

  cb(null, null);
}

function getFileUrl (path, sha, line) {
  var url = "https://github.com/" + GITHUB_USER + "/" + GITHUB_REPO + "/blob/";

  if (sha) {
    url += sha + "/";
  }

  url += path;

  if (line) {
    url += "#L" + line;
  }

  return url;
}

function createIssue (title, body, cb) {
  console.log("WIP: github.createIssue", title, body);

  cb(null, {
    type:   "issue",
    number: 42,
    url:    "https://github.com/" + GITHUB_USER + "/" + GITHUB_REPO + "/issues/42",
    title:  title,
    body:   body
  });
}

function commentIssue (number, comment, cb) {
  console.log("WIP: github.commentIssue", number, comment);

  cb({
    type:  "comment",
    issue: number,
    url:   "https://github.com/" + GITHUB_USER + "/" + GITHUB_REPO + "/issues/" + number + "#issuecomment-3376876",
    body:  comment
  });
}

function tagIssue (number, label, cb) {
  console.log("WIP: github.tagIssue", number, label);

  cb(null);
}
