"use strict";

var fs = require("fs");
var _ = require("lodash");
var Promise = require("bluebird");

var readFileStrict = _.partialRight(Promise.promisify(fs.readFile), {encoding: "utf8"});

function readFile (filename) {
  return readFileStrict(filename).then(null, function (err) {
    // convert ENOENT to null content
    var code = err.code || (err.cause && err.cause.code);
    if (code === "ENOENT") {
      return null;
    }

    throw err;
  });
}

var writeFile = _.partialRight(Promise.promisify(fs.writeFile), {encoding: "utf8"});

var readDir = Promise.promisify(fs.readdir);


module.exports = {
  "readFile":       readFile,
  "readFileStrict": readFileStrict,
  "writeFile":      writeFile,
  "readDir":        readDir
};
