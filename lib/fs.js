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

// Hash of buffers (avoid heap overflow)
var cache = {};
function readFileCached (filename) {
  if (cache[filename]) {
    return Promise.resolve(cache[filename].toString("utf8"));
  } else {
    return readFile(filename).then(function (string) {
      cache[filename] = new Buffer(string, "utf8");
      return string;
    });
  }
}

var writeFile = _.partialRight(Promise.promisify(fs.writeFile), {encoding: "utf8"});

var readDir = Promise.promisify(fs.readdir);


module.exports = {
  "readFile":       readFile,
  "readFileCached": readFileCached,
  "readFileStrict": readFileStrict,
  "writeFile":      writeFile,
  "readDir":        readDir
};
