var help = require("../help");
var config = require("../config");


exports.config = function (opts) {
  return opts
    .boolean("unset")
    .describe("unset", "Remove option")
    .boolean("json")
    .describe("json", "Output in JSON format")
}

exports.run = function (argv) {
  var option = argv._[1];
  var value = argv._[2] || "";

  if (!option) {
    // list options
    config.list(function (err, options) {
      if (err) {
        throw new Error("Cannot get config list, are you in a git repository?");
      }

      if (argv.json) {
        console.log(JSON.stringify(options, null, "  "));
      } else {
        for (var opt in options) {
          console.log(opt, options[opt]);
        }
      }
    });
  } else if (argv.unset) {
    config.unset(option, function (err) {
      if (err) {
        throw new Error("Failed to unset option, are you in a git repository?");
      }
    });
  } else if (!value) {
    config.get(option, function (err, value) {
      if (err) {
        throw new Error("Failed to get option, are you in a git repository?");
      }

      if (value === null) {
        throw new Error("Option '" + option + "' not set");
      }

      if (argv.json) {
        result = {};
        result[option] = value;
        console.log(JSON.stringify(result, null, "  "));
      } else {
        console.log(value);
      }
    });
  } else {
    config.set(option, value, function (err) {
      if (err) {
        throw err;
      }
    });
  }
}
