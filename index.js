var optimist = require("optimist");

var help = require("./lib/help");
var commands = require("./lib/commands");


// We need to regenerate optimist options if --help or -h is encountered
function getOpts (processArgv) {
  return optimist(processArgv)
    .usage(help())
    // Help options (converted to help command)
    .boolean('h')
    .describe('h', 'Show help')
    .alias('h', 'help')
    // Update notification control
    .boolean('no-notifier')
    .describe('no-notifier', 'Disable update notifier')
}

// Check for package update
function checkUpdate () {
  var pkg = require("./package.json");
  require("update-notifier")({
    packageName:    pkg.name,
    packageVersion: pkg.version
  }).notify();
}

// Transform CLI args to convert --help && -h into help command
function transformHelpArgs (processArgv) {
  var args = (processArgv || []).slice();

  // Remove "--help" and "-h" from args
  var longIndex = args.indexOf("--help");
  if (longIndex !== -1) {
    args.splice(longIndex, 1);
  }
  var shortIndex = args.indexOf("-h");
  if (shortIndex !== -1) {
    args.splice(shortIndex, 1);
  }

  // Replace `$0 …` by `$0 help …`
  args.unshift("help");

  return args;
}

// processArgv = CLI args === process.argv.slice(2)
function main (processArgv) {

  // CLI input
  var opts = getOpts(processArgv);
  var argv = opts.argv;

  // Update notifier
  if (!argv['no-notifier']) {
    checkUpdate();
  }

  // Convert options "--help" and "-h" into command "help"
  if (argv.help) {
    processArgv = transformHelpArgs(processArgv);
    // Regenerate opts from newly forged process.argv
    opts = getOpts(processArgv);
    argv = opts.argv;
  }

  var commandName = argv._[0];

  // Demand command name
  if (!commandName) {
    console.error("No command specified");
    opts.showHelp();
    process.exit(127);
  }

  // Load command module
  var command = commands.load(commandName);

  // Demand valid command
  if (!command) {
    console.error("Unknown command: " + commandName);
    opts.showHelp();
    process.exit(127);
  }

  // Configure opts and run command (inside a domain to catch any error)
  commands.run(command, opts, function (e) {
    console.error(e.message);
    process.exit(1);
  });
}

// Expose main API
module.exports = main;
