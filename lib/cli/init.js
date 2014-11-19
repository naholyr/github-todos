"use strict";

/* eslint no-process-exit:0 */

var fs = require("fs");
var path = require("path");
var Promise = require("bluebird");
var _ = require("lodash");

var git = require("../git");
var service = require("../issue-service");
var config = require("../config");


var templates = path.join(__dirname, "..", "..", "doc", "hooks");
var prePushCommand = fs.readFileSync(path.join(templates, "command.txt"), {encoding: "utf8"}).trim();
var prePushTxt = fs.readFileSync(path.join(templates, "pre-push.txt"), {encoding: "utf8"});
var prePushScript = prePushTxt.replace(/\{\s*command\s*\}/g, prePushCommand);

exports.config = function (opts) {
  return opts
    .boolean("u")
    .alias("u", "uninstall")
    .describe("u", "Uninstall Github-Todos hook")
    .boolean("f")
    .alias("f", "force")
    .describe("f", "Force-delete hook on uninstall, or force-add command to existing hook on install")
    .boolean("connect")
    .default("connect", true)
    .describe("connect", "Check or create Github authentication credentials before generating hook");
};

exports.run = function (argv) {
  var fileP = git.dir("hooks/pre-push");

  var connectP = Promise.resolve();
  if (argv.connect) {
    console.log("[Github-Todos] To disable checking credentials on 'init', add option '--no-connect'");
    connectP = config.list().then(function (conf) {
      return service(conf.service).connect(conf);
    });
  }

  return Promise.all([fileP, connectP]).spread(function (file /*, connected */) {
    var found = fs.existsSync(file);
    var content = found && fs.readFileSync(file, {encoding: "utf8"});
    var isUnmodifiedScript = content && (content.trim() === prePushScript.trim());
    var commandFound = content && content.indexOf(prePushCommand) !== -1;

    if (argv.uninstall) {
      if (isUnmodifiedScript || argv.force) {
        removeHook(file);
      } else if (content && commandFound) {
        removeFromHook(file, content);
      } else {
        cannotUninstall(file, content);
      }
    } else {
      if (commandFound && !argv.force) {
        commandAlreadyInHook(file);
      } else if (found) {
        addToHook(file, content, commandFound);
      } else {
        createHook(file);
      }
    }

    if (!argv.uninstall) {

      try {
        fs.chmodSync(file, 493); // 0755
      } catch (e) {
        console.error("[Github-Todos] WARNING: Failed to `chmod 755 " + file + "`. Not that this file *must* be executable, you may want to fix this manually.");
      }

      console.log("[Github-Todos] Hook installed");

      return config.get("repo", "local")
        .then(function (repo) {
          if (!repo) {
            console.log("[Github-Todos] Option 'repo' is not set");
            return guessRepo();
          } else {
            console.log("[Github-Todos] Option 'repo' is already set. Using '" + repo + "'");
            console.log("[Github-Todos] OK");
          }
        })
        .then(null, function (err) {
          console.error("[Github-Todos] %s", err);
          console.error("[Github-Todos] Failed to fetch 'repo' option");
          return guessRepo();
        });

    } else {
      console.log("[Github-Todos] OK");
    }
  });
};


function guessRepo () {
  console.log("[Github-Todos] Now guessing initial configuration from remote 'origin'…");

  function fail (msg) {
    return function (err) {
      if (err) {
        console.error("[Github-Todos] %s", err);
        if (process.env.DEBUG) {
          console.error(err.stack || err);
        }
      }

      console.error("[Github-Todos] Initial configuration failed: %s", msg);
      console.error("[Github-Todos] Run 'github-todos config repo \"<GITHUB USER OR ORG>/<REPOSITORY>\"' to enable hook");

      throw err || new Error("Interrupt");
    };
  }

  function ok (repo) {
    return function () {
      console.log("[Github-Todos] Will use repository '%s'", repo);
      console.log("[Github-Todos] Run 'github-todos config' to check configuration, you may want to customize 'repo' option");
      console.log("[Github-Todos] OK");
    };
  }

  function getRepoFromUrl (url) {
    return config.get("service")
      .then(null, fail("could not fetch option 'service'"))
      .then(function (serviceName) {
        return Promise.resolve((service(serviceName).guessRepoFromUrl || _.noop)(url)).then(function (repo) {
          return [url, repo];
        });
      });
  }

  function saveRepo (url, repo) {
    if (!repo) {
      return fail("could not guess repo from url '" + url + "'");
    }

    return config.set("repo", repo, "local")
      .then(null, fail("could not save configuration, please run 'github-todos config repo \"" + repo + "\"'"))
      .then(ok(repo));
  }

  return git.run("config --local remote.origin.url")
    .then(null, fail("could not fetch remote 'origin' url"))
    .then(getRepoFromUrl)
    .spread(saveRepo);
}

function createHook (file) {
  console.log("[Github-Todos] Hook file not found, create new one…");
  fs.writeFileSync(file, prePushScript);
}

function addToHook (file, content, unsafe) {
  if (unsafe) {
    console.error("[Github-Todos] Hook file found, github-todos command found.");
    console.error("[Github-Todos] Execution forced by option --force: add github-todos command on top anyway…");
  } else {
    console.log("[Github-Todos] Hook file found, add github-todos command on top…");
  }

  var lines = content.split("\n");
  lines.splice(1, 0, "\n" + prePushCommand + "\n");
  content = lines.join("\n");

  fs.writeFileSync(file, content);
}

function removeFromHook (file, content) {
  console.log("[Github-Todos] Hook file found, removing github-todos command…");

  content = content.split("\n").map(function (line, index) {
    if (line.indexOf(prePushCommand) !== -1) {
      console.log("[Github-Todos] Remove line " + (index + 1) + ": " + line);
      return "";
    }

    return line;
  }).join("\n");

  fs.writeFileSync(file, content);
}

function removeHook (file) {
  console.log("[Github-Todos] Hook file found, unmodified, remove hook…");

  fs.unlinkSync(file);
}

function commandAlreadyInHook (file) {
  console.error("[Github-Todos] Hook file found, github-todos command found.");
  console.error("[Github-Todos] Use option --force to add command to hook anyway.");
  console.error("[Github-Todos] You may want to insert command '" + prePushCommand + "' manually: edit '" + file + "'");

  process.exit(5);
}

function cannotUninstall (file, hasContent) {
  if (hasContent) {
    console.error("[Github-Todos] Hook file found but command not found, cannot uninstall.");
  } else {
    console.error("[Github-Todos] Hook file not found, cannot uninstall.");
  }
  console.error("[Github-Todos] You may want to uninstall manually: edit '" + file + "'");

  process.exit(5);
}
