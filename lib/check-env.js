"use strict";

var which = require("which");
var Promise = require("bluebird");


module.exports = checkEnv;


var whichP = Promise.promisify(which);

function checkEnv () {
  return whichP("git").then(null, function (err) {
    if (process.env.DEBUG) {
      console.error(err.stack);
    }
    throw new Error("git command not found in PATH");
  });
}
