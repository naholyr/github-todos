"use strict";

var config = require("../config");


module.exports = function (service) {
  if (!service) {
    service = config.defaults.service;
  }

  return require("./" + service);
};
