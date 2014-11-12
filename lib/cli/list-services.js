"use strict";

var _ = require("lodash");

var service = require("../issue-service");


exports.config = function (opts) {
  return opts
    .boolean("json")
    .describe("json", "Output in JSON format");
};

exports.run = function (argv) {
  var services = service.list();

  if (argv.json) {
    var names = _.pluck(services, "name");
    var metas = _.map(services, _.partialRight(_.omit, "name"));
    console.log(JSON.stringify(_.zipObject(names, metas), null, "  "));
  } else {
    _.each(service.list(), function (meta) {
      console.log(meta.desc ? "%s - %s" : "%s", meta.name, meta.desc);
      console.log("    Repo format: %s", meta.repo || "Undocumented");
    });
  }
};
