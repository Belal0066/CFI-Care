# Contributing Guid

This document explains how we should work with the repo.

---

## 🔹 Repo Setup (Sparse Checkout)

We use a **monorepo**, but you only need the folders relevant to your work.

Clone with partial history:

```bash
git clone --filter=blob:none https://github.com/Belal0066/CFI-Care
cd cfi-care
```

Enable sparse checkout:

```bash
git sparse-checkout init --cone
git sparse-checkout set backend     # or ai, frontend, mobile, infra
```
now you have only backend, not the whole repo files


To add more folders:

```bash
git sparse-checkout add fronend
```
now you have have backend and forntend :D

```bash
CFI-Care/
├── frontend/
└── backend/
```
---

## 🔹 Branching Strategy

* `main` → stable, production-ready
* `milestone-#` → milestone integration branches (e.g. `milestone-1`)
* `feature/*` → feature branches (e.g. `feature/auth-login`)

Always branch from the **latest milestone branch**, not directly from `main`.

---

## 🔹 Workflow

1. **Feature Branch Development**

   * Create your branch:

     ```bash
     git checkout -b feature/auth-login milestone-1
     ```
   * Work inside your module folder (`backend/`, `frontend/`, etc.).
   * Run **unit tests** in your dir.

2. **Merge into Milestone Branch (Integration Testing)**

   * Open a PR from `feature/*` → `milestone-#`.
   * CI will run **integration tests** across services.
   * If it fails:

     * Fix the issue in your feature branch.
     * Re-run tests until it passes.

3. **Regression Testing (Milestone → Main)**

   * Once integration is stable, milestone branches are tested with **regression & performance tests**.
   * If they fail:

     * Roll back the merge or hotfix in the milestone branch.
     * Create a fix branch (`fix/*`) and repeat step 2.

4. **Promotion to Main**

   * Only after a milestone branch passes regression testing, it can be merged into `main`.

---

## 🔹 Commit Style

We use [Conventional Commits](https://www.conventionalcommits.org/):

* `feat:` new feature
* `fix:` bug fix
* `chore:` configs, setup, no code logic changes
* `docs:` documentation only
* `test:` adding or fixing tests

Example:

```
feat(auth): add Keycloak-based RBAC
```

---

## 🔹 Pull Requests

1. Create a feature branch:

   ```bash
   git checkout -b feature/my-task milestone-#
   ```
2. Push and open a PR against the correct **milestone branch**.
3. Ensure **all checks pass** (unit, integration, lint).

---

## 🔹 If a Test Fails

* **Unit tests fail (feature branch):** fix locally, don’t merge until green.
* **Integration tests fail (milestone branch):**

  * Diagnose the failing module.
  * Fix in a `fix/*` branch and PR back into the milestone.
* **Regression tests fail (pre-main):**

  * Revert the milestone merge if necessary.
  * Open a fix branch and re-run regression.

**Never merge red builds into `main`.**

---

## 🔹 Best Practices

* Do **not** commit keys or secrets. Use `.env` files.
* Run `git secrets` or scanning tools before pushing.
* Configure billing alerts and quotas for cloud resources.
* Keep PRs small and focused (1 feature/bug per PR).


