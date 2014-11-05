var fs = require("fs");
var path = require("path");
var _ = require("lodash");

var helpDir = path.join(__dirname, "..", "doc", "cli");

function content (key) {
  var file = "help" + (key ? ("." + key) : "") + ".txt";
  var buffer = fs.readFileSync(path.join(helpDir, file), {encoding: 'utf8'}).trim();
  return function () {
    return buffer;
  };
}

var help = module.exports = content();

var keys = _.map(_.filter(_.invoke(fs.readdirSync(helpDir), 'match', /^help\.(.*)\.txt$/)), _.property(1));
_.merge(help, _.zipObject(keys, _.map(keys, content)));
