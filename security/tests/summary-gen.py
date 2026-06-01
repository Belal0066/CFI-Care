import json
import os
import glob
import re
import subprocess
import platform
from pathlib import Path
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

def run_cmd(args, cwd=None):
    try:
        out = subprocess.check_output(args, cwd=cwd, stderr=subprocess.STDOUT, text=True).strip()
        return out
    except Exception:
        return ""

def pct(covered, total):
    if not total:
        return None
    return round((covered / total) * 100.0, 2)

def color_status(s):
    if s == "PASS":
        return '<span style="color:#15803d;font-weight:700">PASS</span>'
    if s == "FAIL":
        return '<span style="color:#b91c1c;font-weight:700">FAIL</span>'
    return '<span style="color:#a16207;font-weight:700">SKIP</span>'

def color_trend(v):
    if not v:
        return '<span style="color:#6b7280;font-weight:600">NEW</span>'
    if v.startswith("STABLE"):
        return '<span style="color:#6b7280;font-weight:600">STABLE</span>'
    if v.startswith("SLOWER"):
        return f'<span style="color:#b91c1c;font-weight:600">{v}</span>'
    if v.startswith("FASTER"):
        return f'<span style="color:#15803d;font-weight:600">{v}</span>'
    return f'<span style="color:#2563eb;font-weight:600">{v}</span>'

def trend_marker(curr, prev):
    if curr is None or prev is None:
        return "NEW"
    delta = curr - prev
    if abs(delta) < 0.02:
        return "STABLE"
    if delta > 0:
        return f"SLOWER +{delta:.3f}s"
    return f"FASTER {delta:.3f}s"

def test_key(r):
    return f"{r.get('suite','')}|{r.get('id','')}|{r.get('name','')}"


# for pdf
def truncate_text(value, max_len):
    if value is None:
        return ""
    s = str(value).replace("\n", " ").strip()
    if len(s) <= max_len:
        return s
    return s[: max_len - 1] + "…"

script_dir = Path(__file__).resolve().parent
repo_root = Path(os.environ.get("REPO_ROOT", script_dir.parent.parent))

log_dir = Path(os.environ.get("LOG_DIR", script_dir / "logs"))
node_json = Path(os.environ.get("NODE_JSON", log_dir / "nodejs-jest.json"))
summary_md = Path(os.environ.get("SUMMARY_MD", log_dir / "test-summary.md"))
summary_json = Path(os.environ.get("SUMMARY_JSON", log_dir / "test-summary.json"))
prev_summary_json = Path(os.environ.get("PREV_SUMMARY_JSON", log_dir / "test-summary.prev.json"))

keycloak_test_dir = Path(os.environ.get("KEYCLOAK_TEST_DIR", script_dir / "unit-tests" / "Keycloak"))
node_cov_json = Path(os.environ.get("NODE_COVERAGE_JSON", log_dir / "node-coverage" / "coverage-summary.json"))
keycloak_jacoco_xml = Path(os.environ.get("KEYCLOAK_JACOCO_XML", keycloak_test_dir / "target" / "site" / "jacoco" / "jacoco.xml"))

node_log = Path(os.environ.get("NODE_LOG", log_dir / "nodejs-unit.log"))
keycloak_log = Path(os.environ.get("KEYCLOAK_LOG", log_dir / "keycloak-unit.log"))

log_dir.mkdir(parents=True, exist_ok=True)

previous_times = {}
if prev_summary_json.exists():
    try:
        prev_data = json.load(open(prev_summary_json, "r", encoding="utf-8"))
        for t in prev_data.get("tests", []):
            previous_times[test_key(t)] = t.get("time_sec")
    except Exception:
        pass

rows = []


# parse Jest JSON
if node_json.exists():
    data = json.load(open(node_json, "r", encoding="utf-8"))
    for f in data.get("testResults", []):
        file_name = f.get("name", "")
        assertions = f.get("assertionResults", [])

        for a in assertions:
            name = a.get("fullName") or a.get("title") or file_name or "unknown"
            m = re.search(r"(SEC-[A-Z]+-\d+[A-Za-z0-9-]*)", name)
            # test_id = m.group(1) if m else ""
            status_raw = a.get("status", "unknown")
            duration_ms = a.get("duration")
            err = ""
            if status_raw == "failed":
                fails = a.get("failureMessages") or []
                err = (fails[0].splitlines()[0] if fails else "Assertion failed")

            status = "PASS" if status_raw == "passed" else ("SKIP" if status_raw in ("pending", "skipped", "todo") else "FAIL")
            tsec = (duration_ms / 1000.0) if isinstance(duration_ms, (int, float)) else None

            rows.append({
                "suite": "NodeJs",
                # "id": test_id,
                "name": name,
                "status": status,
                "time_sec": tsec,
                "error": err
            })

        if not assertions and f.get("status") == "failed":
            msg = (f.get("message") or "").strip()
            first = ""
            for line in msg.splitlines():
                s = line.strip()
                if s and s != "● Test suite failed to run":
                    first = s
                    break
            if not first:
                first = "Test suite failed to run"

            m = re.search(r"(SEC-[A-Z]+-\d+[A-Za-z0-9-]*)", msg)
            # test_id = m.group(1) if m else ""

            rows.append({
                "suite": "NodeJs",
                # "id": test_id,
                "name": f"Suite load failure: {file_name}",
                "status": "FAIL",
                "time_sec": None,
                "error": first
            })

# parse maven XML
for p in glob.glob(str(keycloak_test_dir / "target" / "surefire-reports" / "TEST-*.xml")):
    root = ET.parse(p).getroot()
    for tc in root.findall(".//testcase"):
        cls = tc.attrib.get("classname", "")
        nm = tc.attrib.get("name", "")
        tm = float(tc.attrib.get("time", "0") or "0")
        status = "PASS"
        err = ""

        skipped = tc.find("skipped")
        fail = tc.find("failure")
        error = tc.find("error")

        if skipped is not None:
            status = "SKIP"
        elif fail is not None or error is not None:
            status = "FAIL"
            node = fail if fail is not None else error
            msg = node.attrib.get("message", "") if node is not None else ""
            txt = (node.text or "").strip() if node is not None and node.text else ""
            err = msg or (txt.splitlines()[0] if txt else "Test failure")

        m = re.search(r"(sec[A-Za-z0-9_]+)", nm)
        # test_id = m.group(1) if m else ""

        rows.append({
            "suite": "Keycloak",
            # "id": test_id,
            "name": f"{cls}.{nm}",
            "status": status,
            "time_sec": tm,
            "error": err
        })

# per-test trend
for r in rows:
    prev_t = previous_times.get(test_key(r))
    r["trend"] = trend_marker(r.get("time_sec"), prev_t)

#tot
total = len(rows)
passed = sum(1 for r in rows if r["status"] == "PASS")
failed = sum(1 for r in rows if r["status"] == "FAIL")
skipped = sum(1 for r in rows if r["status"] == "SKIP")

# Suite info
suite_stats = {}
total_duration = sum((r["time_sec"] or 0.0) for r in rows)
for r in rows:
    s = r["suite"]
    if s not in suite_stats:
        suite_stats[s] = {"total": 0, "passed": 0, "failed": 0, "skipped": 0, "duration_sec": 0.0}
    suite_stats[s]["total"] += 1
    suite_stats[s]["duration_sec"] += (r["time_sec"] or 0.0)
    if r["status"] == "PASS":
        suite_stats[s]["passed"] += 1
    elif r["status"] == "FAIL":
        suite_stats[s]["failed"] += 1
    else:
        suite_stats[s]["skipped"] += 1

for s in suite_stats:
    dur = suite_stats[s]["duration_sec"]
    suite_stats[s]["duration_pct"] = round((dur / total_duration) * 100.0, 2) if total_duration else 0.0

# coverage: NJS
coverage = {
    "NodeJs": {"line": None, "branch": None, "function": None, "counts": {}},
    "Keycloak": {"line": None, "branch": None, "function": None, "counts": {}},
    "Global": {"line": None, "branch": None, "function": None}
}

global_counts = {
    "line": {"covered": 0, "total": 0},
    "branch": {"covered": 0, "total": 0},
    "function": {"covered": 0, "total": 0},
}

if node_cov_json.exists():
    n = json.load(open(node_cov_json, "r", encoding="utf-8")).get("total", {})
    line_cov = n.get("lines", {})
    branch_cov = n.get("branches", {})
    fn_cov = n.get("functions", {})

    for k, src in [("line", line_cov), ("branch", branch_cov), ("function", fn_cov)]:
        c = int(src.get("covered", 0) or 0)
        t = int(src.get("total", 0) or 0)
        coverage["NodeJs"][k] = pct(c, t)
        coverage["NodeJs"]["counts"][k] = {"covered": c, "total": t}
        global_counts[k]["covered"] += c
        global_counts[k]["total"] += t

# coverage: Keycloak 
if keycloak_jacoco_xml.exists():
    root = ET.parse(keycloak_jacoco_xml).getroot()
    counters = {c.attrib.get("type"): c for c in root.findall(".//counter")}

    def jacoco_cov(counter_type):
        c = counters.get(counter_type)
        if c is None:
            return (0, 0, None)
        missed = int(c.attrib.get("missed", "0"))
        covered = int(c.attrib.get("covered", "0"))
        total = missed + covered
        return (covered, total, pct(covered, total))

    line_c, line_t, line_p = jacoco_cov("LINE")
    br_c, br_t, br_p = jacoco_cov("BRANCH")
    fn_c, fn_t, fn_p = jacoco_cov("METHOD")

    coverage["Keycloak"]["line"] = line_p
    coverage["Keycloak"]["branch"] = br_p
    coverage["Keycloak"]["function"] = fn_p
    coverage["Keycloak"]["counts"]["line"] = {"covered": line_c, "total": line_t}
    coverage["Keycloak"]["counts"]["branch"] = {"covered": br_c, "total": br_t}
    coverage["Keycloak"]["counts"]["function"] = {"covered": fn_c, "total": fn_t}

    global_counts["line"]["covered"] += line_c
    global_counts["line"]["total"] += line_t
    global_counts["branch"]["covered"] += br_c
    global_counts["branch"]["total"] += br_t
    global_counts["function"]["covered"] += fn_c
    global_counts["function"]["total"] += fn_t

coverage["Global"]["line"] = pct(global_counts["line"]["covered"], global_counts["line"]["total"])
coverage["Global"]["branch"] = pct(global_counts["branch"]["covered"], global_counts["branch"]["total"])
coverage["Global"]["function"] = pct(global_counts["function"]["covered"], global_counts["function"]["total"])

# metadata
git_branch = run_cmd(["git", "-C", str(repo_root), "rev-parse", "--abbrev-ref", "HEAD"])
git_sha = run_cmd(["git", "-C", str(repo_root), "rev-parse", "HEAD"])
os_info = f"{platform.system()} {platform.release()}"
py_ver = platform.python_version()
node_ver = run_cmd(["node", "--version"])
java_ver = run_cmd(["java", "--version"]).splitlines()[0] if run_cmd(["java", "--version"]) else ""

artifacts = {
    "node_log": str(node_log),
    "keycloak_log": str(keycloak_log),
    "node_jest_json": str(node_json),
    "summary_md": str(summary_md),
    "summary_json": str(summary_json),
    "node_coverage_json": str(node_cov_json),
    "keycloak_jacoco_xml": str(keycloak_jacoco_xml),
    "prev_summary_json": str(prev_summary_json),
}

payload = {
    "generated_at_utc": datetime.now(timezone.utc).isoformat(),
    "git": {"branch": git_branch, "sha": git_sha},
    "environment": {"os": os_info, "python": py_ver, "node": node_ver, "java": java_ver},
    "totals": {"total": total, "passed": passed, "failed": failed, "skipped": skipped, "duration_sec": round(total_duration, 3)},
    "suite_totals": suite_stats,
    "coverage": coverage,
    "artifacts": artifacts,
    "tests": rows,
}

json.dump(payload, open(summary_json, "w", encoding="utf-8"), indent=2)

# md :D
def fmt_pct(v):
    return "" if v is None else f"{v:.2f}%"

with open(summary_md, "w", encoding="utf-8") as f:
    f.write("# Test Summary\n\n")
    f.write("## Metadata\n\n")
    f.write(f"- Generated (UTC): {payload['generated_at_utc']}\n")
    f.write(f"- Git branch: {git_branch}\n")
    f.write(f"- Git commit: {git_sha}\n")
    f.write(f"- OS: {os_info}\n")
    f.write(f"- Python: {py_ver}\n")
    f.write(f"- Node: {node_ver}\n")
    f.write(f"- Java: {java_ver}\n\n")

    f.write("## Overall Totals\n\n")
    f.write(f"- Total: {total}\n- Passed: {passed}\n- Failed: {failed}\n- Skipped: {skipped}\n- Total Duration (s): {total_duration:.3f}\n\n")

    f.write("## Suite Totals\n\n")
    f.write("| Suite | Total | Passed | Failed | Skipped | Duration (s) | Duration % |\n")
    f.write("|---|---:|---:|---:|---:|---:|---:|\n")
    for s, st in suite_stats.items():
        f.write(f"| {s} | {st['total']} | {st['passed']} | {st['failed']} | {st['skipped']} | {st['duration_sec']:.3f} | {st['duration_pct']:.2f}% |\n")
    f.write("\n")

    f.write("## Coverage\n\n")
    f.write("| Scope | Line | Branch | Function |\n")
    f.write("|---|---:|---:|---:|\n")
    f.write(f"| NodeJs | {fmt_pct(coverage['NodeJs']['line'])} | {fmt_pct(coverage['NodeJs']['branch'])} | {fmt_pct(coverage['NodeJs']['function'])} |\n")
    f.write(f"| Keycloak | {fmt_pct(coverage['Keycloak']['line'])} | {fmt_pct(coverage['Keycloak']['branch'])} | {fmt_pct(coverage['Keycloak']['function'])} |\n")
    f.write(f"| Global | {fmt_pct(coverage['Global']['line'])} | {fmt_pct(coverage['Global']['branch'])} | {fmt_pct(coverage['Global']['function'])} |\n\n")

    f.write("## Artifacts\n\n")
    f.write(f"- Node log: {artifacts['node_log']}\n")
    f.write(f"- Keycloak log: {artifacts['keycloak_log']}\n")
    f.write(f"- Node Jest JSON: {artifacts['node_jest_json']}\n")
    f.write(f"- Node coverage JSON: {artifacts['node_coverage_json']}\n")
    f.write(f"- Keycloak JaCoCo XML: {artifacts['keycloak_jacoco_xml']}\n")
    f.write(f"- Summary JSON: {artifacts['summary_json']}\n")
    f.write(f"- Previous Summary JSON: {artifacts['prev_summary_json']}\n\n")

    f.write("## Test Cases\n\n")
    f.write("Full values are in test-summary.json\n\n")
    f.write("| Suite | Name | Status | Time (s) | Trend | Error |\n")
    f.write("|---|---|---|---:|---|---|\n")
    for r in rows:
        t = "" if r.get("time_sec") is None else f"{r['time_sec']:.3f}"
        name_md = truncate_text(r.get("name", ""), 25).replace("|", "\\|")
        err_md = truncate_text(r.get("error", ""), 40).replace("|", "\\|")
        # id_md = truncate_text(r.get("id", ""), 15).replace("|", "\\|")
        status_md = color_status(r.get("status", ""))
        trend_md = color_trend(truncate_text(r.get("trend") or "NEW", 15)).replace("|", "\\|")
        f.write(
            f"| {r.get('suite','')} | {name_md} | {status_md} | {t} | {trend_md} | {err_md} |\n"
        )
