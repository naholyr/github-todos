"use strict";

var debug = require("debug")("github-todos");
var Promise = require("bluebird");


module.exports = {
  "load": load,
  "run":  run
};


// Safe-require command module
function load (commandName) {
  var command;

  try {
    command = require("./cli/" + commandName);
  } catch (e) {
    debug("Error loading command", commandName, e);
    command = null;
  }

  return command;
}

// Safe-fun command
function run (command, opts, conf) {
  // Use "new Promise" to isolate process and catch any error
  return new Promise(function (resolve, reject) {
    if (command.config) {
      opts = command.config(opts, conf);
    }

    Promise.cast(command.run(opts.argv, opts, conf)).then(resolve, reject);
  });
}
