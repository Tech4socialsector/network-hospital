# Branching strategy

This app is maintained against two Frappe major versions in parallel:

| Branch       | Frappe version      | Python           |
|--------------|----------------------|------------------|
| `version-16` | `>=16.0.0,<17.0.0`   | `>=3.14`         |
| `version-15` | `>=15.0.0,<16.0.0`   | `>=3.10,<3.13`   |

`version-16` is the primary line — new features and fixes land there first.
`version-15` carries the same app logic, adapted only where Frappe v15's
older APIs or Python floor require it.

## What differs between the branches

Only these files are allowed to differ between `version-15` and `version-16`,
and the difference is permanent (never cherry-pick these specific commits
across):

- `pyproject.toml` — `[tool.bench.frappe-dependencies]` version pin,
  `requires-python`, `[tool.ruff] target-version`
- `.github/workflows/ci.yml` — push-trigger branch name, concurrency group
  name, `python-version`, `bench init --frappe-branch ...`
- `.github/workflows/linter.yml` — `python-version`
- `README.md` — `bench get-app ... --branch ...` install instructions

Everything else (app code, doctypes, fixtures, tests) should stay identical
across both branches.

## Keeping the branches in sync

1. Land feature/bugfix work on `version-16` first.
2. Cherry-pick each commit onto `version-15`:
   ```bash
   git checkout version-15
   git cherry-pick <commit-sha>
   ```
3. If a change relies on a Frappe v16-only API, adapt it in the cherry-picked
   commit on `version-15` instead of skipping it silently — otherwise the
   branches quietly diverge in behavior, not just in supported-version
   metadata.
4. When Frappe v17 ships, branch a new `version-17` off `version-16` the same
   way `version-15` was branched off it, and repeat this process.

## Open item

GitHub's default branch is still `main`, which predates this split and
doesn't match either version branch. Decide whether to set `version-16` as
the default branch, or keep `main` as a rolling alias of the latest version
branch.
