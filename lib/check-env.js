var which = require("which");

module.exports = function (cb) {
  which("git", function (err) {
    if (err) {
      cb(new Error("git command not found in PATH"));
    }

    cb();
  });
}
