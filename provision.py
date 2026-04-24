#!/usr/bin/env python3
"""
Sovereign AI — Offline Provisioning Script
==========================================
Downloads every model weight needed to run the full stack
in a fully air-gapped / offline environment.

What gets pulled
----------------
  Ollama  llama3.2:1b          ~1.3 GB   primary text LLM (fast)
  Ollama  llama3.2:3b          ~2.0 GB   higher-quality text LLM
  Ollama  llava:7b             ~4.7 GB   vision / image understanding
  HF      all-MiniLM-L6-v2    ~90  MB   document embedding
  HF      bge-reranker-base    ~280 MB   search result reranking

Usage
-----
  python provision.py                   download everything
  python provision.py --skip-ollama     HuggingFace models only
  python provision.py --skip-hf        Ollama models only
  python provision.py --verify          check what is already present
  python provision.py --ollama-url URL  use a non-default Ollama URL
"""

import argparse
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Optional

# ── UTF-8 stdout (fixes Windows CP1252 terminals) ─────────────────────────────
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# ── Terminal colours & symbols ────────────────────────────────────────────────

_WIN = platform.system() == "Windows"

# Enable ANSI on Windows 10+
if _WIN:
    import ctypes
    try:
        ctypes.windll.kernel32.SetConsoleMode(
            ctypes.windll.kernel32.GetStdHandle(-11), 7
        )
    except Exception:
        pass

# Detect whether the terminal can render UTF-8 box chars
_UTF8 = (sys.stdout.encoding or "").lower().replace("-", "") in ("utf8", "utf16")

RESET  = "\033[0m"
BOLD   = "\033[1m"
DIM    = "\033[2m"
RED    = "\033[91m"
GREEN  = "\033[92m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
WHITE  = "\033[97m"

OK   = f"{GREEN}{'[OK]' if not _UTF8 else chr(0x2714)}{RESET}"
FAIL = f"{RED}{'[!!]' if not _UTF8 else chr(0x2718)}{RESET}"
SKIP = f"{YELLOW}{'-'}{RESET}"
WAIT = f"{CYAN}{'[>>]' if not _UTF8 else chr(0x2193)}{RESET}"

def banner():
    if _UTF8:
        box = (
            "╔" + "═" * 54 + "╗\n"
            "║" + "        Sovereign AI  -  Offline Provisioning         " + "║\n"
            "╚" + "═" * 54 + "╝"
        )
    else:
        box = (
            "+" + "=" * 54 + "+\n"
            "|" + "        Sovereign AI  -  Offline Provisioning         " + "|\n"
            "+" + "=" * 54 + "+"
        )
    print(f"\n{BOLD}{CYAN}{box}{RESET}\n")

def section(title: str):
    width = 54
    print(f"\n{BOLD}{WHITE}{'─' * width}{RESET}")
    print(f"{BOLD}{WHITE}  {title}{RESET}")
    print(f"{BOLD}{WHITE}{'─' * width}{RESET}")

def info(msg: str):
    print(f"  {DIM}{msg}{RESET}")

def success(msg: str):
    print(f"  {OK}  {msg}")

def warn(msg: str):
    print(f"  {YELLOW}⚠{RESET}  {msg}")

def error(msg: str):
    print(f"  {FAIL}  {RED}{msg}{RESET}")

def skip(msg: str):
    print(f"  {SKIP}  {DIM}{msg}{RESET}")


# ── Model catalogue ───────────────────────────────────────────────────────────

OLLAMA_MODELS = [
    {"tag": "llama3.2:1b",       "size": "~1.3 GB", "role": "Primary text LLM (fast)"},
    {"tag": "llama3.2:3b",       "size": "~2.0 GB", "role": "Higher-quality text LLM"},
    {"tag": "llava:7b",          "size": "~4.7 GB", "role": "Vision / image analysis"},
]

HF_MODELS = [
    {
        "repo": "sentence-transformers/all-MiniLM-L6-v2",
        "size": "~90 MB",
        "role": "Document embedding",
    },
    {
        "repo": "BAAI/bge-reranker-base",
        "size": "~280 MB",
        "role": "Search result reranking",
    },
]


# ── Ollama helpers ────────────────────────────────────────────────────────────

def _find_ollama_runner() -> Optional[str]:
    """Return 'docker' if the ollama container is running, 'local' if ollama
    binary is on PATH, else None."""
    # Check Docker container named 'ollama'
    try:
        out = subprocess.check_output(
            ["docker", "inspect", "--format", "{{.State.Running}}", "ollama"],
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
        if out == "true":
            return "docker"
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass

    # Check local ollama binary
    if shutil.which("ollama"):
        return "local"

    return None


def _ollama_list_tags(runner: str) -> list[str]:
    """Return list of already-pulled model tags."""
    try:
        if runner == "docker":
            raw = subprocess.check_output(
                ["docker", "exec", "ollama", "ollama", "list"],
                stderr=subprocess.DEVNULL, text=True,
            )
        else:
            raw = subprocess.check_output(
                ["ollama", "list"], stderr=subprocess.DEVNULL, text=True,
            )
        tags = []
        for line in raw.splitlines()[1:]:  # skip header
            parts = line.split()
            if parts:
                tags.append(parts[0])
        return tags
    except Exception:
        return []


def _ollama_pull(runner: str, tag: str) -> bool:
    """Pull a model. Streams output. Returns True on success."""
    if runner == "docker":
        cmd = ["docker", "exec", "ollama", "ollama", "pull", tag]
    else:
        cmd = ["ollama", "pull", tag]

    print(f"  {WAIT}  Pulling {BOLD}{tag}{RESET}")
    proc = subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, bufsize=1,
    )
    last_line = ""
    for line in proc.stdout:  # type: ignore[union-attr]
        line = line.rstrip()
        if line and line != last_line:
            print(f"      {DIM}{line}{RESET}", flush=True)
            last_line = line
    proc.wait()
    return proc.returncode == 0


def provision_ollama(skip_if_present: bool = True):
    section("Ollama Models  (LLM + Vision)")

    runner = _find_ollama_runner()
    if runner is None:
        error("Ollama is not reachable.")
        info("Start it with:  docker run -d --name ollama ollama/ollama")
        info("            or  install Ollama from https://ollama.com")
        return False

    via = "Docker container" if runner == "docker" else "local binary"
    info(f"Ollama found via {via}")

    already = _ollama_list_tags(runner)

    all_ok = True
    for m in OLLAMA_MODELS:
        tag  = m["tag"]
        size = m["size"]
        role = m["role"]
        if any(t.startswith(tag.split(":")[0] + ":" + tag.split(":")[1]) for t in already):
            success(f"{tag:<22} {DIM}{size:<10}{RESET} already present  {DIM}({role}){RESET}")
            continue
        print(f"\n  {CYAN}Downloading {BOLD}{tag}{RESET}  {DIM}{size}  {role}{RESET}")
        ok = _ollama_pull(runner, tag)
        if ok:
            success(f"{tag} downloaded successfully")
        else:
            error(f"Failed to pull {tag}")
            all_ok = False

    return all_ok


# ── HuggingFace helpers ───────────────────────────────────────────────────────

def _hf_cache_dir() -> Path:
    custom = os.environ.get("HF_HUB_CACHE") or os.environ.get("HUGGINGFACE_HUB_CACHE")
    if custom:
        return Path(custom)
    return Path.home() / ".cache" / "huggingface" / "hub"


def _hf_is_cached(repo: str) -> bool:
    folder = "models--" + repo.replace("/", "--")
    snapshots = _hf_cache_dir() / folder / "snapshots"
    if not snapshots.exists():
        return False
    return any(
        any(p.is_file() for p in snap.rglob("*"))
        for snap in snapshots.iterdir()
    )


def _hf_download(repo: str) -> bool:
    """Download via huggingface_hub (preferred) or git clone fallback."""
    try:
        from huggingface_hub import snapshot_download
        snapshot_download(repo_id=repo, local_files_only=False)
        return True
    except ImportError:
        pass

    # Fallback: use transformers AutoModel to trigger download
    try:
        from transformers import AutoModel, AutoTokenizer
        AutoTokenizer.from_pretrained(repo)
        AutoModel.from_pretrained(repo)
        return True
    except Exception as exc:
        error(f"Download failed: {exc}")
        return False


def provision_hf():
    section("HuggingFace Models  (Embedding + Reranker)")

    try:
        import huggingface_hub  # noqa: F401
        info("huggingface_hub is available")
    except ImportError:
        warn("huggingface_hub not installed — trying transformers fallback")
        try:
            import transformers  # noqa: F401
        except ImportError:
            error("Neither huggingface_hub nor transformers is installed.")
            info("Run:  pip install huggingface_hub")
            return False

    cache = _hf_cache_dir()
    info(f"Cache directory: {cache}")

    all_ok = True
    for m in HF_MODELS:
        repo = m["repo"]
        size = m["size"]
        role = m["role"]

        if _hf_is_cached(repo):
            success(f"{repo:<45} {DIM}{size:<10}{RESET} already cached  {DIM}({role}){RESET}")
            continue

        print(f"\n  {WAIT}  Downloading {BOLD}{repo}{RESET}  {DIM}{size}  {role}{RESET}")
        ok = _hf_download(repo)
        if ok:
            success(f"{repo} downloaded successfully")
        else:
            error(f"Failed to download {repo}")
            all_ok = False

    return all_ok


# ── Verify mode ───────────────────────────────────────────────────────────────

def verify():
    section("Verification — Current State")

    runner = _find_ollama_runner()
    already = _ollama_list_tags(runner) if runner else []

    print(f"\n  {BOLD}Ollama models{RESET}  ({('via ' + runner) if runner else RED + 'not reachable' + RESET})")
    for m in OLLAMA_MODELS:
        tag = m["tag"]
        present = any(t.startswith(tag) for t in already)
        status  = OK if present else FAIL
        print(f"    {status}  {tag:<22}  {DIM}{m['size']}{RESET}")

    print(f"\n  {BOLD}HuggingFace models{RESET}  (cache: {_hf_cache_dir()})")
    for m in HF_MODELS:
        present = _hf_is_cached(m["repo"])
        status  = OK if present else FAIL
        print(f"    {status}  {m['repo']:<45}  {DIM}{m['size']}{RESET}")

    print()


# ── Summary ───────────────────────────────────────────────────────────────────

def summary(results: dict[str, bool]):
    section("Summary")
    all_pass = all(results.values())
    for step, ok in results.items():
        mark = OK if ok else FAIL
        print(f"  {mark}  {step}")
    print()
    if all_pass:
        print(f"  {GREEN}{BOLD}All models provisioned. System is ready for air-gapped use.{RESET}")
    else:
        print(f"  {YELLOW}{BOLD}Some steps failed — re-run or check errors above.{RESET}")
    print()


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Sovereign AI offline provisioning script",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--skip-ollama", action="store_true", help="Skip Ollama model downloads")
    parser.add_argument("--skip-hf",     action="store_true", help="Skip HuggingFace model downloads")
    parser.add_argument("--verify",      action="store_true", help="Only check what is already downloaded")
    args = parser.parse_args()

    banner()

    if args.verify:
        verify()
        return

    results: dict[str, bool] = {}

    if not args.skip_ollama:
        results["Ollama models"] = provision_ollama()
    else:
        skip("Ollama models  (--skip-ollama)")

    if not args.skip_hf:
        results["HuggingFace models"] = provision_hf()
    else:
        skip("HuggingFace models  (--skip-hf)")

    if results:
        summary(results)


if __name__ == "__main__":
    main()
