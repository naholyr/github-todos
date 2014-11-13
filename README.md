[![npm version](https://badge.fury.io/js/github-todos.svg)](http://badge.fury.io/js/github-todos)
[![Dependency Status](https://david-dm.org/naholyr/github-todos.png)](https://david-dm.org/naholyr/github-todos)
[![Flattr this git repo](http://api.flattr.com/button/flattr-badge-large.png)](https://flattr.com/submit/auto?user_id=naholyr&url=https%3A%2F%2Fgithub.com%2Fnaholyr%2Fgithub-todos&title=Github-Todos&language=javascript&tags=github&category=software)
[![Gittip donate](https://img.shields.io/gratipay/naholyr.svg)](https://gratipay.com/naholyr)

# github-todos

Github-Todos is a git hook to convert your TODOs into Github issues.

You can read [the full presentation from wiki](https://github.com/naholyr/github-todos/wiki/Full-presentation) for detailed information.

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

## Advanced usage

### Disabling hook

Set environment variable `DRY_RUN` to enable dry run: in this mode no call to Github API will occur, and issues will not be injected even if `inject-issue` option is enabled.

If you have some very dirty work to do, like a `push --force` and don't want `github-todos` to interfere, set environment variable `NO_GITHUB_TODOS`. It will not even start.

If you want to uninstall hook for current repository:

```sh
github-todos init --no-connect --uninstall
```

### Debugging

Github-Todos uses `debug` module. You can enable additional verbose output by setting environment variable `DEBUG` to `github-todos`.
