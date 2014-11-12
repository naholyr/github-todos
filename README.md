# github-todos

Github-Todos is a git hook to convert your TODOs into Github issues.

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

If you have some very dirty work to do, like a `push --force` and don't want `github-todos` to interfere, set `$NO_GITHUB_TODOS`. It will not even start.

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

There seems to be a lot of options, but as this tool can have critical impact on your project (creating dumb issues, causing conflicts on workspace…) it's important for it to have conservative defaults, and for you to understand these options.

Use `github-todos help config` for more details (including formats). Here is a short-list of most probably useful options:

* Repository configuration:
  * `repo` is the repository to create issues on (format: "user/repository", default: guessed from remote origin)
  * `service` is the issue service (default: "github", available: "github")
  * `branches` are the branches on which the hook will be enabled (default: `master,develop`)
  * `remotes` are the remotes on which the hook will be enabled (advice: setting more than one will cause duplicate issues when you will push the same commits to different enabled remotes, default: `origin`)
  * `files` are the files on which the hook will be enabled (default: `**`)
* Detection:
  * `label.<MARKER>` enables a marker and associates a Github label to it (default: `label.TODO=TODO` and `label.FIXME=TODO`)
  * `label-whitespace` forces a whitespace to be found next to marker to trigger hook (default: `true`)
  * `case-sensitive` forces case sensitivity (default: `false`)
* Others:
  * `inject-issue` hook will modify your files (and commit changes, after push) to add issue number next to TODOs (default: `false`)
  * `confirm-create` hook will ask for user confirmation before opening any new issue (default: `true`)
  * `open-url` will open issues and comments in your main browser (default: `false`)
  * `context` is the number of line you want to include in your issue or comment body (default: `3`)

### .github-todos-ignore

This file will contain all TODOs you wish to automatically ignore (false positives, issues that should not be created on purpose…).

For example, if your `.github-todos-ignore` file is as follows:

```
write something useful
```

and you're about to commit the following TODOs

```diff
+ TODO write something useful
+ TODO write something useful please
```

then the first one will be simply ignored.

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

Configuration is store in `.github-todos` file, using INI format.

* `$HOME/.github-todos` contains global configuration, overriden by…
* `<YOUR-REPO>/.github-todos` which contains local (repository-wide) configuration

#### Installing the hook

* If no `pre-push` hook exists it creates the file with the simple `github-todos _hook` command
* If a `pre-push` hook exists, Github-Todos will grep it for the expected command
  * If found, do nothing
  * If not found, add it on top

As soon as you don't manually edit the Github-Todos hook command in `pre-push` file, `github-todos init` can install/uninstall hook painlessly.

If you have any doubt, you should manually insert the command (read `doc/hooks/command.txt` to get it).
