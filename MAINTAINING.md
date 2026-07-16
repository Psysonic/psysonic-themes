# Maintaining the Theme Store

Notes for maintainers. Contributors don't need this — see
[CONTRIBUTING.md](CONTRIBUTING.md).

## Resolving a stale or conflicting theme PR

A theme PR conflicts when its branch was cut from an older `main` or stacked on
another unmerged branch: a change that already merged (often an earlier PR on the
same theme) comes back as a duplicate. A rebase onto current `main` fixes it in a
couple of minutes — `git rebase` drops the already-merged hunks on its own.

1. **Fetch** the PR branch and current `main`:
   ```
   git fetch origin
   git fetch origin pull/<PR>/head:pr<PR>
   ```

2. **Rebase** onto `main`:
   ```
   git switch -c pr<PR>-fix pr<PR>
   git rebase origin/main
   ```
   - Commits whose content is already upstream drop automatically
     (`dropping … patch contents already upstream`) — that's the duplicated
     block leaving. Usually no manual conflict resolution is needed.
   - A leftover from a stacked branch — a version-only bump, or an edit to a
     theme the PR shouldn't touch — can be dropped with `git rebase --skip`.

3. **Fix up** if the rebase left a gap:
   - If a `theme.css` change survived but its `version` bump was in a dropped
     duplicate, bump `manifest.json` yourself. CI fails a theme edit that
     doesn't raise the version.

4. **Validate**, then update the PR in place (the fork must allow maintainer
   edits — `maintainerCanModify`):
   ```
   node scripts/validate-theme.mjs themes/<id>
   git push <contributor-fork-url> pr<PR>-fix:<pr-branch> --force-with-lease
   ```

5. **Merge** on GitHub — squash, so the author stays the contributor. Then delete
   the temp branch (`git branch -D pr<PR>-fix pr<PR>`).

The lasting fix is contributor-side: the branch-hygiene note in
[CONTRIBUTING.md](CONTRIBUTING.md) (cut each update from an up-to-date `main`,
don't stack branches, rebase when behind).
