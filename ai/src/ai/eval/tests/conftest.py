import os
import sys
from pathlib import Path

AI_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(AI_ROOT))
os.environ.setdefault("LLM_BACKEND", "local")
