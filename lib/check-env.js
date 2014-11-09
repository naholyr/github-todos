"use strict";

var which = require("which");


module.exports = checkEnv;


function checkEnv (cb) {
  which("git", function (err) {
    if (err) {
      cb(new Error("git command not found in PATH"));
    }

    cb();
  });
}
