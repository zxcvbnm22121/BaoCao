from pathlib import Path
import os
from dotenv import load_dotenv

load_dotenv()

def env(key, default=""):
    return os.getenv(key, default)

WORK_DIR = Path("work")
WORK_DIR.mkdir(exist_ok=True)
Path("state").mkdir(exist_ok=True)
ALLOWED_NAMES = {s.strip().lower() for s in env("ALLOWED_NAMES").split(",") if s.strip()}
