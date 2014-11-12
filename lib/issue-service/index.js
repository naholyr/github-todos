"use strict";

var fs = require("fs");
var _ = require("lodash");
var debug = require("debug")("github-todos");

var config = require("../config");


module.exports = getService;

function getService (service) {
  if (!service) {
    service = config.defaults.service;
  }

  return require("./" + service);
}

getService.list = listServices;

function listServices () {
  var files = fs.readdirSync(__dirname);

  return _.filter(_.map(files, function (file) {
    if (file === "index.js") {
      return null;
    }

    try {

      var service = require("./" + file);
      var name = file.replace(/\.[^\.]+$/, "");

      return _.merge(
        { "desc": name },
        service.meta || {},
        { "name": name }
      );

    } catch (e) {
      debug("failed loading issue service", file, e);
      return null;
    }
  }));
}
