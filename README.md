# github-todos

Github-Todos is a git hook to convert your TODOs into Github issues.

## Still a WIP

The tool is not usable yet, very important features are missing:

* Detect (or ask for) Github repository of the project
* Ask user before creating issue (or very smart detection of false-positives?)
* Configuration options to not trigger the hook on every branch or files

## Basic usage

* Install hook on your repository

```sh
github-todos init
```

* Check and maybe tweak configuration

```sh
github-todos config --defaults

# want to enable issue injection?
github-todos config inject-issue true

# check configuration help
github-todos help config
```

* Work, commit, push

```
[Github-Todos] Checking Github Authentication… OK
[Github-Todos] Created issue #11 (do something better) - https://github.com/user/repo/issues/11
[Github-Todos] Created issue #12 (add security filter) - https://github.com/user/repo/issues/12
[Github-Todos] Added comment to issue #12 (add security filter) - https://github.com/user/repo/issues/11/#…
[Github-Todos] Injecting issue numbers to files…
[Github-Todos] Added a commit containing issue injections
```

### Dry run

Set environment variable `DRY_RUN` to enable dry run: in this mode no call to Github API will occur, and issues will not be injected even if `inject-issue` option is enabled.

### Debugging

Github-Todos uses `debug` module. You can enable additional verbose output by setting environment variable `DEBUG` to `github-todos`.

## Install

```sh
npm install -g github-todos
```

### Authenticate to Github

```sh
github-todos auth
```

## Configuration

TODO detailed configuration

## Full presentation

### What it is, what it isn't

This tool is a command line interface to help you install and configure a hook to your git repository. This hook will automaticall create issues or comment existing ones when it finds a new "TODO" in committed files.

It's not a GitHub issue manager, you can take a look at [gh](http://nodegh.io) or [ghi](https://github.com/stephencelis/ghi) for this.

### Why it exists

While coding I often encounter little details that could be improved, little issues that could be fixed but do not match my current goal and are not urgent… In those cases I generally end up adding a little `TODO we should definitely improve this`. I don't get disturbed and let the little things aside, focusing on the main goal.

But those `TODO`s are then usually lost in code, and take a thousand years to be fixed, never raise any discussion. It's hardly better than doing nothing at all. That's why I thought about a tool that would automatically create an issue for each TODO.

### Who can use it

Any Github user can use it:

* it only requires the permission to create issue on repository
* it's language agnostic, just detecting word `TODO`, in comment or anywhere else

### When you can use it

* On any existing repository you run `github-todos init` to install hook, a bunch of `github-todos config` calls to tweak behavior, it will then run when you push your contributions
* You can also use it on an existing codebase, to convert those already lost TODOs into issues. This is a very specific usage that you should first simulate:

```sh
# Simulation
DRY_RUN=1 github-todos _hook --remote origin --range firstCommit..lastCommit

# Looks OK, let's run the real thing
github-todos _hook --remote origin --range firstCommit..lastCommit
```

### How it works under the hood

#### The hook itself

* TODOs detection is very simple stupid: any new line matching "TODO …" causes an issue to be created or commented
  * If the lines matches "TODO #<number> …" then it will comment the corresponding issue
  * If multiple TODOs with the same text are found, only one issue will be open
  * Optionally it will modify any "TODO …" into "TODO #<number> …" after creating or commenting issue, all modifications being isolated in a
    * stash if workspace is dirty
    * modify source files
    * add, commit
    * stash pop if necessary
* The hook is triggered on *pre-push*
  * As it's an operation requiring network (Github API) it should be linked to push
  * It sounds dumb to create issue for unpublished code

##### Issue injection

  1. `git stash save --include-untracked` if workspace is dirty
  2. modify source files: `TODO …` → `TODO #X …`
  3. `git add .`
  4. `git commit -m "[Github-Todos] Inject issue numbers"` (1)
  5. `git stash pop --index` if stashed on step 1
  6. Ready to let the push go (1)


#### The configuration layer

Github-Todos simply uses `git config` to manage its configuration. All options are prefixed with `github-todos.`.

* `github-todos config` will grep `git config` for `github-todos.…` options
* `github-todos config option` will call `git config --local github-todos.option` or `git config --global github-todos.option` depending on option
* etc.

#### Installing the hook

* If no `pre-push` hook exists it creates the file with the simple `github-todos _hook` command
* If a `pre-push` hook exists, Github-Todos will grep it for the expected command
  * If found, do nothing
  * If not found, add it on top

As soon as you don't manually edit the Github-Todos hook command in `pre-push` file, `github-todos init` can install/uninstall hook painlessly.

If you have any doubt, you should manually insert the command (read `doc/hooks/command.txt` to get it).
