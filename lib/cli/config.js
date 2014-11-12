"use strict";

var _ = require("lodash");
var ini = require("ini");

var config = require("../config");


exports.config = function (opts) {
  return opts
    .boolean("unset")
    .describe("unset", "Remove option")
    .boolean("json")
    .describe("json", "Output in JSON format")
    .boolean("extra")
    .describe("extra", "Include extra options (not used by Github-Todos)")
    .boolean("global")
    .describe("global", "Force fetching/storing option in global scope")
    .boolean("local")
    .describe("local", "Force fetching/storing option in local scope")
    .boolean("defaults")
    .describe("defaults", "Use default values instead of hiding unset options");
};

exports.run = function (argv) {
  if (argv.global && argv.local) {
    throw new Error("You cannot use '--local' and '--global' simultaneously");
  }

  var scope = argv.global ? "global" : (argv.local ? "local" : null);
  var option = argv._[1];
  var value = argv._[2] || "";
  var keys = Object.keys(config.defaults);

  if (option && !argv.extra && !_.contains(keys, option)) {
    throw new Error("Unsupported option '" + option + "': use --extra to force");
  }

  if (!option) {
    // list options
    config.list(scope, function (err, options) {
      if (err) {
        throw new Error("Cannot get config list, are you in a git repository?");
      }

      if (!argv.extra) {
        options = _.omit(options, function (value, key) {
          return !_.contains(keys, key);
        });
      }

      if (argv.defaults) {
        options = _.merge({}, config.defaults, options);
      }

      if (argv.json) {
        console.log(JSON.stringify(options, null, "  "));
      } else {
        console.log(ini.stringify(options, {"whitespace": true}));
      }
    });
  } else if (argv.unset) {
    config.unset(option, scope, function (err) {
      if (err) {
        throw new Error("Failed to unset option, are you in a git repository?");
      }
    });
  } else if (!value) {
    config.get(option, scope, function (err, value) {
      if (err) {
        throw new Error("Failed to get option, are you in a git repository?");
      }

      if (value === null) {
        if (!argv.defaults || config.defaults[option] === null) {
          throw new Error("Option '" + option + "' not set");
        } else {
          value = config.defaults[option];
        }
      }

      if (argv.json) {
        var result = {};
        result[option] = value;
        console.log(JSON.stringify(result, null, "  "));
      } else {
        console.log(value);
      }
    });
  } else {
    config.set(option, value, scope, function (err) {
      if (err) {
        throw err;
      }
    });
  }
};
