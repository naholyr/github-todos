"use strict";

var fs = require("../fs");
var _ = require("lodash");
var Promise = require("bluebird");
var debug = require("debug")("github-todos");

var config = require("../config");


module.exports = getService;

function getService (service) {
  if (!service) {
    service = "github"; // hardcoded since config.defaults() became async
  }

  return wrapServiceAPI(service);
}

getService.list = listServices;

function listServices () {
  return fs.readDir(__dirname)
    .then(_.partialRight(_.map, function (file) {
      if (file === "index.js") {
        return null;
      }

      try {
        var service = require("./" + file);
        var name = file.replace(/\.[^\.]+$/, "");

        return _.merge(
          { "desc": name },
          service.meta || {},
          { "name": name }
        );
      } catch (e) {
        debug("failed loading issue service", file, e);
        return null;
      }
    }))
    .then(_.filter);
}


var FAKE_ISSUE = {
  "type":   "issue",
  "number": -1,
  "url":    "http://nope",
  "title":  "FAKE",
  "labels": []
};

var FAKE_COMMENT = {
  "type":   "comment",
  "issue":  -1,
  "url":    "http://nope"
};

function wrapServiceAPI (name) {
  var api = require("./" + name);

  var state = {
    client: null // while unconnected
  };

  var service = {
    // Meta data
    "meta":             _.merge({name: name}, api.meta),

    // Connection
    "connect":          wrapDryRun(connect, dryRunConnect(state)),

    // Methods requiring authentication
    "findIssueByTitle": wrapRequireClient(wrapDryRun(api.findIssueByTitle, null), state, connect),
    "allIssues":        wrapRequireClient(wrapDryRun(api.allIssues, []), state, connect),
    "createIssue":      wrapRequireClient(wrapDryRun(api.createIssue, FAKE_ISSUE), state, connect),
    "commentIssue":     wrapRequireClient(wrapDryRun(api.commentIssue, FAKE_COMMENT), state, connect),
    "tagIssue":         wrapRequireClient(wrapDryRun(api.tagIssue, null), state, connect),

    // Optional validation method
    "validateConfig":   api.validateConfig || _.constant(Promise.resolve()),

    // Sync methods
    "getFileUrl":       api.getFileUrl,
    "guessRepoFromUrl": api.guessRepoFromUrl
  };

  function connect (conf) {
    debug("service.connect");
    return service.validateConfig(conf).then(function (modifiedConf) {
      if (typeof modifiedConf !== "object") {
        modifiedConf = conf;
      }

      return api.connect(conf).then(function (client) {
        state.client = client;
        return service;
      });
    });
  }

  return service;
}

function dryRunConnect (state) {
  return function () {
    state.client = {}; // make it truthy for "requireClient"
    return Promise.resolve();
  };
}

// "work" is called only if github client is connected, otherwise try to authenticate and call work
// Function(…, cb) → Function(…, cb)
function wrapRequireClient (work, state, connect) {
  return function () {
    var self = this;
    var args = Array.prototype.slice.call(arguments);

    if (!state.client) {
      debug("no client: connect before work");
      return config.list().then(connect).then(function () {
        return work.apply(self, [state.client].concat(args));
      });
    } else {
      // Already connected: work!
      return work.apply(self, [state.client].concat(args));
    }
  };
}

function wrapDryRun (work, result) {
  return function () {
    if (process.env.DRY_RUN) {
      debug("dry-run fallback");
      if (typeof result === "function") {
        return result();
      } else {
        return Promise.resolve(result);
      }
    }

    return work.apply(this, arguments);
  };
}
