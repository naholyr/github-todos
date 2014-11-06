
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
    command = null;
  }

  return command;
}

// Safe-fun command
function run (command, opts, onError) {
  require("domain").create().on("error", onError).run(function () {
    if (command.config) {
      opts = command.config(opts);
    }
    command.run(opts.argv, opts);
  });
}
