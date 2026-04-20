
import sqlite3
import json
import time
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "history.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS runs (
            id TEXT PRIMARY KEY,
            filename TEXT,
            started_at REAL,
            finished_at REAL,
            pages_total INTEGER,
            pages_done INTEGER,
            status TEXT,
            metrics_json TEXT,
            output_path TEXT,
            created_at REAL
        )
    ''')
    conn.commit()
    conn.close()

def save_run(run_id, filename, started_at, finished_at, pages_total, pages_done, status, metrics, output_path):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        INSERT OR REPLACE INTO runs 
        (id, filename, started_at, finished_at, pages_total, pages_done, status, metrics_json, output_path, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        run_id, 
        filename, 
        started_at, 
        finished_at, 
        pages_total, 
        pages_done, 
        status, 
        json.dumps(metrics), 
        str(output_path),
        time.time()
    ))
    conn.commit()
    conn.close()

def get_runs():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM runs ORDER BY created_at DESC')
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def get_run(run_id):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM runs WHERE id = ?', (run_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def delete_run(run_id):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('DELETE FROM runs WHERE id = ?', (run_id,))
    conn.commit()
    conn.close()
