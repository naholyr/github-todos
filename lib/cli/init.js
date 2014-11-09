"use strict";

/* eslint no-process-exit:0 */

var fs = require("fs");
var path = require("path");

var git = require("../git");


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
    .describe("f", "Force-delete hook on uninstall, or force-add command to existing hook on install");
};

exports.run = function (argv) {
  git.dir("hooks/pre-push", function (err, file) {
    if (err) {
      throw err;
    }

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
        console.error("WARNING: Failed to `chmod 755 " + file + "`. Not that this file *must* be executable, you may want to fix this manually.");
      }
    }

    console.log("OK.");
  });
};


function createHook (file) {
  console.log("Hook file not found, create new one…");
  fs.writeFileSync(file, prePushScript);
}

function addToHook (file, content, unsafe) {
  if (unsafe) {
    console.error("Hook file found, github-todos command found.");
    console.error("Execution forced by option --force: add github-todos command on top anyway…");
  } else {
    console.log("Hook file found, add github-todos command on top…");
  }

  var lines = content.split("\n");
  lines.splice(1, 0, "\n" + prePushCommand + "\n");
  content = lines.join("\n");

  fs.writeFileSync(file, content);
}

function removeFromHook (file, content) {
  console.log("Hook file found, removing github-todos command…");

  content = content.split("\n").map(function (line, index) {
    if (line.indexOf(prePushCommand) !== -1) {
      console.log("Remove line " + (index + 1) + ": " + line);
      return "";
    }

    return line;
  }).join("\n");

  fs.writeFileSync(file, content);
}

function removeHook (file) {
  console.log("Hook file found, unmodified, remove hook…");

  fs.unlinkSync(file);
}

function commandAlreadyInHook (file) {
  console.error("Hook file found, github-todos command found.");
  console.error("Use option --force to add command to hook anyway.");
  console.error("You may want to insert command '" + prePushCommand + "' manually: edit '" + file + "'");

  process.exit(5);
}

function cannotUninstall (file, hasContent) {
  if (hasContent) {
    console.error("Hook file found but command not found, cannot uninstall.");
  } else {
    console.error("Hook file not found, cannot uninstall.");
  }
  console.error("You may want to uninstall manually: edit '" + file + "'");

  process.exit(5);
}
