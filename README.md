# github-todos

Git hook to convert your TODOs into Github issues

## WIP

The tool is a work in progress, pushed here more for backup purpose than publishing. Please clone or fork only if you intend to contribute.

## Goal

```sh
# Install git hook
$ ght init
[Github-Todos] Git hook installed successfully.

# Set option (inject-issue = modify code after commit to inject issue number in TODO comment)
$ ght config inject-issue true

# Here is line 15 of my demo file
$ head -n 15 lib/app.js | tail -n 1
// TODO do not use this deprecated method

# Now I commit with some TODOs added in app.js
# An issue will be created, the other one commented…
$ git commit -m "Added some TODOs"
[Github-Todos] lib/app.js:37 "TODO do not use this deprecated method"
[Github-Todos] Issue not found, creating new one…
[Github-Todos] Issue created: #42
[Github-Todos] lib/app.js:49 "TODO security filter"
[Github-Todos] Issue found: #37. Adding comment…
[Github-Todos] Issue commented: #37

# …and because I enabled inject-issue, app.js is left modified
# notice the "#42" added next to "TODO"
$ head -n 15 lib/app.js | tail -n 1
// TODO #42 do not use this deprecated method
```
