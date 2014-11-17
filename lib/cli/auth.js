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
    var Service = service(conf.service);

    if (argv.force && Service.meta.conf) {
      Service.meta.conf.forEach(function (option) {
        delete conf[option];
      });
    }

    return Service.connect(conf)
      .then(null, function (err) {
        console.error("Connection to '" + Service.meta.name + "' failed");
        throw err;
      })
      .then(function () {
        console.log("Connection to '" + Service.meta.name + "' succeeded");
      });
  });
};
