# GitHub Actions

## Active Workflows

### Documentation PDF Builder (`documentation-pdf.yml`)

**Version:** v2.1  
**Trigger:** Push to `Documentation` branch  
**Purpose:** Auto-compile LaTeX thesis to PDF and maintain latest versions in `docs/`

#### Configuration

| Setting | Value |
|---------|-------|
| LaTeX Compiler | `latexmk` with `pdflatex` |
| Working Directory | `docs/Thesis/CFI_Care_Thesis/` |
| Main File | `bachelor.tex` |
| Compiler Args | `-pdf -file-line-error -interaction=nonstopmode -bibtex -f` |
| Extra Packages | `py-pygments` |
| Artifact Retention | 30 days |

#### Outputs

- **`docs/CFI_Care_Thesis_Latest.pdf`** - Latest compiled PDF (auto-committed)
- **`docs/CFI_Care_Thesis_Source.zip`** - Latest source archive (auto-committed)
- **Artifacts** - Timestamped PDFs (30-day retention)
- **Releases** - Created when `[rel]` in commit message (permanent, marked as pre-release)

#### Naming Convention

- **Artifacts:** `docs-YYYY-MM-DD-HHMM-committer-name-SHA`
- **Releases:** `docs-YYYY-MM-DD-HHMM-committer-name-SHA`
- **Auto-commit:** `docs: auto-update PDF and ZIP by <committer> [skip ci]`

#### Failure Handling

- Creates GitHub issue with label `documentation`, `build-failure`, `needs-fix`
- Posts commit comment with link to build logs
- Does not prevent commit (manual revert required)

---

## Changelog

### v2.1 (2025-12-10)
- Added `-f` flag to force LaTeX compilation through warnings
- Fixed undefined reference errors in multi-pass compilation

### v2.0 (2025-12-09)
- Initial implementation
- Auto-compile on `Documentation` branch pushes
- Conditional releases with `[rel]` tag
- Committer name in artifact/release naming
