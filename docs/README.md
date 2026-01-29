# Documentation

## Structure

- **`Thesis/CFI_Care_Thesis/`** → Edit LaTeX files here
- **`Thesis/CFI_Care_Thesis.zip`** → (the original base-copy)

- **`CFI_Care_Thesis_Latest.pdf`** → Latest compiled PDF (auto-generated)
- **`CFI_Care_Thesis_Source.zip`** → Latest source archive (auto-generated)

## Workflow

1. Edit files in `Thesis/CFI_Care_Thesis/`
2. Commit and push to `Documentation` branch
3. PDF auto-compiles and updates in `docs/`
4. **Always `git pull` before editing** to sync latest PDF/ZIP
5. Add `[rel]` in commit message to create a GitHub release

## Example

```bash
git add .
git commit -m "docs: added cool visualzzzz [rel]"
git push
# Wait for workflow → PDF + ZIP auto-updated
git pull  # Get the latest files
# or pull rebase if you have already commits
```
