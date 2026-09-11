# Branching strategy

This app is maintained against two Frappe major versions in parallel:

| Branch       | Frappe version      | Python           |
|--------------|----------------------|------------------|
| `main`       | `>=16.0.0,<17.0.0`   | `>=3.14`         |
| `version-15` | `>=15.0.0,<16.0.0`   | `>=3.10,<3.13`   |

`main` is the primary line (targeting the current Frappe v16) — new features
and fixes land there first. `version-15` carries the same app logic, adapted
only where Frappe v15's older APIs or Python floor require it.

There is no separate `version-16` branch — `main` fills that role, since
duplicating it under another name would just mean maintaining two identical
branches.

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

1. Land feature/bugfix work on `main` first.
2. Cherry-pick each commit onto `version-15`:
   ```bash
   git checkout version-15
   git cherry-pick <commit-sha>
   ```
3. If a change relies on a Frappe v16-only API, adapt it in the cherry-picked
   commit on `version-15` instead of skipping it silently — otherwise the
   branches quietly diverge in behavior, not just in supported-version
   metadata.
4. When Frappe v17 ships, branch a new `version-15`-style compatibility
   branch off `main` for whichever version `main` has moved past by then.
