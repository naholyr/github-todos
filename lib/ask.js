"use strict";

var inquirer = require("inquirer");
var ttys = require("ttys");
var Promise = require("bluebird");

module.exports = function (questions) {
  var promise = new Promise(function (resolve) {
    inquirer.prompt(questions, resolve, {
      "input":  ttys.stdin,
      "output": ttys.stdout
    });
  });

  promise.choices = function (answer, choices) {
    return promise.then(function (answers) {
      var choice = choices[answers[answer] || "default"];
      if (typeof choice === "function") {
        return choice(answers);
      } else {
        return choice;
      }
    });
  };

  return promise;
};
