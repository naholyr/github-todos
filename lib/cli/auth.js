"use strict";

var github = require("../github");
var config = require("../config");

/* eslint no-process-exit:0 */

exports.config = function (opts) {
  return opts
    .boolean("force")
    .alias("force", "f")
    .describe("force", "Force re-authentication");
};

exports.run = function (argv) {
  config.list(function (err, conf) {
    if (err) {
      throw err;
    }

    if (argv.force) {
      delete conf["github.token"];
    }

    github.connect(conf, function (err) {
      if (err) {
        console.error("Connection to Github API failed");
        process.exit(1);
      }

      console.log("Connection to Github API succeeded");
    });
  });
};
