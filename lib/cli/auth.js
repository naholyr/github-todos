"use strict";

var service = require("../issue-service");
var config = require("../config");

/* eslint no-process-exit:0 */

exports.config = function (opts) {
  return opts
    .boolean("force")
    .alias("force", "f")
    .describe("force", "Force re-authentication");
};

exports.run = function (argv) {
  return config.list().then(function (conf) {
    if (argv.force) {
      delete conf["github.token"];
    }

    return service(conf.service).connect(conf)
      .then(null, function (err) {
        console.error("Connection to Github API failed");
        throw err;
      })
      .then(function () {
        console.log("Connection to Github API succeeded");
      });
  });
};
