var exec = require("child_process").exec;

module.exports = {
  "run": run
};


function run (args, cb) {
  if (Array.isArray(args)) {
    args = args.join(" ");
  }

  exec("git " + args, function (err, stdout, stderr) {
    if (err) {
      if (stdout) {
        err.message += "\n" + stdout;
      }
      return cb(err);
    }

    cb(null, stdout);
  });
}
