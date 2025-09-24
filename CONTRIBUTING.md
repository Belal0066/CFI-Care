## 🔹 Repo Setup (Sparse Checkout)

We use a monorepo, but you only need the folders relevant to your work.

Clone with partial history:
```bash
git clone --filter=blob:none https://github.com/your-org/medflow.git
cd medflow
````

Enable sparse checkout:

```bash
git sparse-checkout init --cone
git sparse-checkout set backend     # or ai, frontend, mobile, infra
```

To add more folders later:

```bash
git sparse-checkout add ai
```

---

## 🔹 Branching Strategy

* `main` → stable, production-ready
* `dev` → integration branch for active development
* `milestone-#` → milestone-specific branches
* `feature/*` → feature branches (e.g. `feature/auth-login`)

Always branch from `dev` unless doing a hotfix.

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
   git checkout -b feature/my-task
   ```
2. Push and open a PR against `dev`.
3. Ensure **all checks pass** (CI, tests, lint).
4. At least **1 code review approval** required.

---

## 🔹 Best Practices

- don't push keys, use env var
- git secrets for scanning
- billing alerts and qoutas in aws


