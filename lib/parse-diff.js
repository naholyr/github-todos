"use strict";

var _ = require("lodash");
var diffParse = require("diff-parse");


module.exports = parseDiff;


function parseDiff (string) {
  var parsed = diffParse(string);

  // FIX a bug in line numbers, seems to somehow not detect chunk and calculate lines like a drunk monkey then
  // I will suppose it still outputs lines in valid order, and rely on that
  return _.map(parsed, fixParsedDiff);
}

function fixParsedDiff (file) {
  if (typeof file.lines[0] !== 'undefined' && file.lines[0].content[0] === "@" && !file.lines[0].chunk) {
    // Buggy
    file.lines = _.map(file.lines, fixDiffLine);
  }

  return file;
}

function fixDiffLine (line, index) {
  if (index === 0) {
    if (line.content[0] === "@" && !line.chunk) {
      line.type = "chunk";
      line.chunk = true;
    }
  } else {
    line.ln = index;
  }

  return line;
}
