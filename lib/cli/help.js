var help = require("../help");

exports.run = function (argv, opts) {
  var commandName = argv._[1];

  if (commandName) {
    var command;
    try {
      command = require("./" + commandName);
    } catch (e) {
      command = null;
    }

    if (!command) {
      throw new Error("Unknown command: " + commandName);
    }

    if (!help[commandName]) {
      throw new Error("No help available for command: " + commandName);
    }

    if (command.config) {
      opts = command.config(opts);
    }

    opts.usage(help[commandName]()).showHelp();
  } else {
    opts.showHelp();
  }
}
