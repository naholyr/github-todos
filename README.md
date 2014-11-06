# github-todos

Git hook to convert your TODOs into Github issues

## WIP

The tool is a work in progress, pushed here more for backup purpose than publishing. Please clone or fork only if you intend to contribute.

### Dependencies

* Update notification is based on `update-notifier` module. [You can disable it](https://github.com/yeoman/update-notifier#user-settings) using CLI argument, file configuration, or environment variable.
* Debug output is triggered thanks to `debug` module. You can enable it by setting environment variable `DEBUG=github-todos`.

### How I think it should work under the hood

All that follows may be highly arguable and I expect comments to make the right tool:

* **Detect TODOs** should be very simple stupid: any line containing "TODO …" will consider "…" matches a TODO issue
* It should be a **pre-push hook** because it requires connection, and may modify source files
  1. Get the overall diff to be commited
  2. Detect TODOs added in this commits
  3. (maybe also detect TODOs removed, to close corresponding issues)
  4. Create or comment issues accordingly
* **Inject issue number** next to TODO should be optional, and contained into one single isolated commit:
  1. `git stash save --include-untracked` if workspace is dirty
  2. modify source files: `TODO …` → `TODO #X …`
  3. `git add .`
  4. `git commit -m "[Github-Todos] Inject issue numbers"` (*)
  5. `git stash pop --index` if stashed on step 1
  6. Ready to let the push go (*)
* **Configuration option** should allow to:
  * Define target github repository (`user`, `repo`, default taken from remote "origin")
  * Enable/disable issue injection (`inject-issue`, should be disabled by default?)
  * Limit parsed files
    * Using extension? maybe `extensions`, default to "html,js,sh,css,c,o,md", maybe "*"?
    * Maybe an option to exclude paths, supporting the "**/…" usual pattern?
  * Be more or less verbose (`verbose`, enabled by default)
  * Maybe enable interactive mode where the tool would ask confirmation for every TODO before touching online issues (`interactive`, disabled by default?)

(*) Note that you [can't add a commit to a push in a hook](http://stackoverflow.com/a/21334985), we must choose an option:

* let push continue, let user with an unpushed extra commit: not very nice but easy, works, and the user can choose what to do with this extra commit (amend it, remove it, whatever), it will have no more side-effect
* break push, let user push the whole lot + extra commit: even more user-unfriendly in my opinion, and we'll have to handle the "push again" logic (**)
* push within the hook (prevent circular execution)

First and last solutions seem the best in our case, I'll go with first because it's the easiest, and maybe implement last as an option.

(**) Note that anyway, it can always happend that a push is refused **after** Github-Todos has worked. It should keep track of handled commits so that it does not trigger twice on same commit (in a file within .git directory?).

## Mid-term goal

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

## Roadmap

1. Minimum viable product: create or comment issue when a line containing "TODO …" is added to commited file
2. Guess github user & repository from remote origin
3. Implement option "inject-issue"
4. (maybe?) close issue when a line containing "TODO #…" is removed from commited file
5. (maybe?) add a command to execute hook on a given series of commit (to create your issues on existing codebase)
