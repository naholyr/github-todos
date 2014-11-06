// Safe-require command module
exports.load = function load (commandName) {
  var command;

  try {
    command = require("./cli/" + commandName);
  } catch (e) {
    command = null;
  }

  return command;
}

// Safe-fun command
exports.run = function run (command, opts, onError) {
  require("domain").create().on("error", onError).run(function () {
    if (command.config) {
      opts = command.config(opts);
    }
    command.run(opts.argv, opts);
  });
}
