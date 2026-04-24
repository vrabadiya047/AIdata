"""
Tests for provision.py — the offline provisioning script.

All external calls (subprocess, huggingface_hub, filesystem) are mocked so
these tests run fully offline with no Docker or network access required.
"""

import subprocess
import sys
import os
import types
from io import StringIO
from pathlib import Path
from unittest.mock import MagicMock, patch, mock_open

import pytest

# ── Import the module under test ──────────────────────────────────────────────
# provision.py lives at repo root, one level above this file.
sys.path.insert(0, str(Path(__file__).parent.parent))
import provision  # noqa: E402


# ═══════════════════════════════════════════════════════════
#  _find_ollama_runner
# ═══════════════════════════════════════════════════════════

class TestFindOllamaRunner:

    def test_returns_docker_when_container_running(self):
        with patch("subprocess.check_output", return_value="true\n"):
            assert provision._find_ollama_runner() == "docker"

    def test_returns_local_when_binary_on_path(self):
        with patch("subprocess.check_output", side_effect=subprocess.CalledProcessError(1, [])):
            with patch("shutil.which", return_value="/usr/local/bin/ollama"):
                assert provision._find_ollama_runner() == "local"

    def test_returns_none_when_nothing_available(self):
        with patch("subprocess.check_output", side_effect=FileNotFoundError()):
            with patch("shutil.which", return_value=None):
                assert provision._find_ollama_runner() is None

    def test_docker_not_running_falls_through_to_local(self):
        # Docker answers but container is NOT running
        with patch("subprocess.check_output", return_value="false\n"):
            with patch("shutil.which", return_value="/usr/bin/ollama"):
                assert provision._find_ollama_runner() == "local"

    def test_docker_command_missing_falls_through_to_local(self):
        with patch("subprocess.check_output", side_effect=FileNotFoundError()):
            with patch("shutil.which", return_value="/usr/bin/ollama"):
                assert provision._find_ollama_runner() == "local"


# ═══════════════════════════════════════════════════════════
#  _ollama_list_tags
# ═══════════════════════════════════════════════════════════

_OLLAMA_LIST_OUTPUT = (
    "NAME                    ID              SIZE    MODIFIED\n"
    "llama3.2:1b             abc123          1.3 GB  2 hours ago\n"
    "llama3.2:3b             def456          2.0 GB  2 hours ago\n"
    "llava:7b                ghi789          4.7 GB  1 hour ago\n"
)

class TestOllamaListTags:

    def test_docker_runner_returns_tags(self):
        with patch("subprocess.check_output", return_value=_OLLAMA_LIST_OUTPUT):
            tags = provision._ollama_list_tags("docker")
        assert "llama3.2:1b" in tags
        assert "llama3.2:3b" in tags
        assert "llava:7b" in tags

    def test_local_runner_returns_tags(self):
        with patch("subprocess.check_output", return_value=_OLLAMA_LIST_OUTPUT):
            tags = provision._ollama_list_tags("local")
        assert "llama3.2:1b" in tags

    def test_returns_empty_on_error(self):
        with patch("subprocess.check_output", side_effect=Exception("fail")):
            tags = provision._ollama_list_tags("docker")
        assert tags == []

    def test_skips_header_line(self):
        with patch("subprocess.check_output", return_value=_OLLAMA_LIST_OUTPUT):
            tags = provision._ollama_list_tags("docker")
        assert "NAME" not in tags

    def test_returns_empty_list_for_no_models(self):
        header_only = "NAME    ID    SIZE    MODIFIED\n"
        with patch("subprocess.check_output", return_value=header_only):
            tags = provision._ollama_list_tags("local")
        assert tags == []


# ═══════════════════════════════════════════════════════════
#  _ollama_pull
# ═══════════════════════════════════════════════════════════

class TestOllamaPull:

    def _make_proc(self, returncode=0, output="pulling..."):
        proc = MagicMock()
        proc.stdout = iter([output + "\n"])
        proc.returncode = returncode
        proc.wait = MagicMock()
        return proc

    def test_docker_pull_uses_docker_exec(self):
        proc = self._make_proc(returncode=0)
        with patch("subprocess.Popen", return_value=proc) as mock_popen:
            result = provision._ollama_pull("docker", "llama3.2:1b")
        cmd = mock_popen.call_args[0][0]
        assert cmd[:3] == ["docker", "exec", "ollama"]
        assert "llama3.2:1b" in cmd
        assert result is True

    def test_local_pull_uses_ollama_binary(self):
        proc = self._make_proc(returncode=0)
        with patch("subprocess.Popen", return_value=proc) as mock_popen:
            result = provision._ollama_pull("local", "llama3.2:1b")
        cmd = mock_popen.call_args[0][0]
        assert cmd[0] == "ollama"
        assert "llama3.2:1b" in cmd
        assert result is True

    def test_returns_false_on_nonzero_exit(self):
        proc = self._make_proc(returncode=1)
        with patch("subprocess.Popen", return_value=proc):
            result = provision._ollama_pull("docker", "llama3.2:1b")
        assert result is False

    def test_streams_deduplicated_output(self, capsys):
        proc = MagicMock()
        proc.stdout = iter(["pulling\n", "pulling\n", "done\n"])
        proc.returncode = 0
        proc.wait = MagicMock()
        with patch("subprocess.Popen", return_value=proc):
            provision._ollama_pull("local", "llava:7b")
        out = capsys.readouterr().out
        # "pulling" should appear only once despite two identical lines
        assert out.count("pulling") == 1
        assert "done" in out


# ═══════════════════════════════════════════════════════════
#  _hf_cache_dir
# ═══════════════════════════════════════════════════════════

class TestHfCacheDir:

    def test_uses_HF_HUB_CACHE_env(self, tmp_path, monkeypatch):
        monkeypatch.setenv("HF_HUB_CACHE", str(tmp_path))
        monkeypatch.delenv("HUGGINGFACE_HUB_CACHE", raising=False)
        assert provision._hf_cache_dir() == tmp_path

    def test_uses_HUGGINGFACE_HUB_CACHE_env(self, tmp_path, monkeypatch):
        monkeypatch.delenv("HF_HUB_CACHE", raising=False)
        monkeypatch.setenv("HUGGINGFACE_HUB_CACHE", str(tmp_path))
        assert provision._hf_cache_dir() == tmp_path

    def test_HF_HUB_CACHE_takes_priority(self, tmp_path, monkeypatch):
        monkeypatch.setenv("HF_HUB_CACHE", str(tmp_path / "primary"))
        monkeypatch.setenv("HUGGINGFACE_HUB_CACHE", str(tmp_path / "secondary"))
        assert provision._hf_cache_dir() == tmp_path / "primary"

    def test_defaults_to_home_cache(self, monkeypatch):
        monkeypatch.delenv("HF_HUB_CACHE", raising=False)
        monkeypatch.delenv("HUGGINGFACE_HUB_CACHE", raising=False)
        result = provision._hf_cache_dir()
        assert result == Path.home() / ".cache" / "huggingface" / "hub"


# ═══════════════════════════════════════════════════════════
#  _hf_is_cached
# ═══════════════════════════════════════════════════════════

class TestHfIsCached:

    def _make_cache(self, tmp_path: Path, repo: str, with_files: bool = True) -> Path:
        folder = "models--" + repo.replace("/", "--")
        snap = tmp_path / folder / "snapshots" / "abc123"
        snap.mkdir(parents=True)
        if with_files:
            (snap / "config.json").write_text("{}")
        return tmp_path

    def test_returns_true_when_snapshot_has_files(self, tmp_path, monkeypatch):
        cache = self._make_cache(tmp_path, "sentence-transformers/all-MiniLM-L6-v2")
        monkeypatch.setenv("HF_HUB_CACHE", str(cache))
        assert provision._hf_is_cached("sentence-transformers/all-MiniLM-L6-v2") is True

    def test_returns_false_when_no_snapshot_dir(self, tmp_path, monkeypatch):
        monkeypatch.setenv("HF_HUB_CACHE", str(tmp_path))
        assert provision._hf_is_cached("BAAI/bge-reranker-base") is False

    def test_returns_false_when_snapshot_empty(self, tmp_path, monkeypatch):
        cache = self._make_cache(tmp_path, "BAAI/bge-reranker-base", with_files=False)
        monkeypatch.setenv("HF_HUB_CACHE", str(cache))
        assert provision._hf_is_cached("BAAI/bge-reranker-base") is False

    def test_folder_name_encodes_slash(self, tmp_path, monkeypatch):
        # "org/repo" → "models--org--repo"
        cache = self._make_cache(tmp_path, "org/my-model")
        monkeypatch.setenv("HF_HUB_CACHE", str(cache))
        folder = tmp_path / "models--org--my-model"
        assert folder.exists()
        assert provision._hf_is_cached("org/my-model") is True


# ═══════════════════════════════════════════════════════════
#  _hf_download
# ═══════════════════════════════════════════════════════════

class TestHfDownload:

    def test_uses_snapshot_download_when_available(self):
        mock_snap = MagicMock(return_value="/cache/path")
        fake_hf = types.ModuleType("huggingface_hub")
        fake_hf.snapshot_download = mock_snap
        with patch.dict("sys.modules", {"huggingface_hub": fake_hf}):
            result = provision._hf_download("BAAI/bge-reranker-base")
        mock_snap.assert_called_once_with(
            repo_id="BAAI/bge-reranker-base", local_files_only=False
        )
        assert result is True

    def test_falls_back_to_transformers_when_no_hf_hub(self):
        with patch.dict("sys.modules", {"huggingface_hub": None}):
            mock_tok   = MagicMock()
            mock_model = MagicMock()
            fake_tf = types.ModuleType("transformers")
            fake_tf.AutoTokenizer = MagicMock(return_value=mock_tok)
            fake_tf.AutoModel     = MagicMock(return_value=mock_model)
            with patch.dict("sys.modules", {"transformers": fake_tf}):
                # Re-import to pick up patched modules
                result = provision._hf_download("BAAI/bge-reranker-base")
        assert result is True

    def test_returns_false_when_both_libraries_fail(self):
        with patch.dict("sys.modules", {"huggingface_hub": None, "transformers": None}):
            result = provision._hf_download("some/model")
        assert result is False


# ═══════════════════════════════════════════════════════════
#  provision_ollama  (integration of helpers)
# ═══════════════════════════════════════════════════════════

class TestProvisionOllama:

    def test_returns_false_when_ollama_not_found(self, capsys):
        with patch.object(provision, "_find_ollama_runner", return_value=None):
            result = provision.provision_ollama()
        assert result is False
        assert "not reachable" in capsys.readouterr().out

    def test_skips_already_present_models(self, capsys):
        all_tags = ["llama3.2:1b", "llama3.2:3b", "llava:7b"]
        with patch.object(provision, "_find_ollama_runner", return_value="docker"):
            with patch.object(provision, "_ollama_list_tags", return_value=all_tags):
                with patch.object(provision, "_ollama_pull") as mock_pull:
                    result = provision.provision_ollama()
        mock_pull.assert_not_called()
        assert result is True
        assert "already present" in capsys.readouterr().out

    def test_pulls_missing_models(self):
        with patch.object(provision, "_find_ollama_runner", return_value="local"):
            with patch.object(provision, "_ollama_list_tags", return_value=[]):
                with patch.object(provision, "_ollama_pull", return_value=True) as mock_pull:
                    result = provision.provision_ollama()
        assert mock_pull.call_count == len(provision.OLLAMA_MODELS)
        assert result is True

    def test_returns_false_when_a_pull_fails(self):
        with patch.object(provision, "_find_ollama_runner", return_value="docker"):
            with patch.object(provision, "_ollama_list_tags", return_value=[]):
                with patch.object(provision, "_ollama_pull", return_value=False):
                    result = provision.provision_ollama()
        assert result is False

    def test_partial_pull_skips_present_and_pulls_missing(self):
        with patch.object(provision, "_find_ollama_runner", return_value="docker"):
            with patch.object(provision, "_ollama_list_tags", return_value=["llama3.2:1b", "llama3.2:3b"]):
                with patch.object(provision, "_ollama_pull", return_value=True) as mock_pull:
                    provision.provision_ollama()
        # Only llava:7b should be pulled
        pulled_tags = [call.args[1] for call in mock_pull.call_args_list]
        assert "llava:7b" in pulled_tags
        assert "llama3.2:1b" not in pulled_tags
        assert "llama3.2:3b" not in pulled_tags


# ═══════════════════════════════════════════════════════════
#  provision_hf  (integration of helpers)
# ═══════════════════════════════════════════════════════════

class TestProvisionHf:

    def test_skips_already_cached_models(self, capsys):
        with patch.object(provision, "_hf_is_cached", return_value=True):
            with patch.object(provision, "_hf_download") as mock_dl:
                result = provision.provision_hf()
        mock_dl.assert_not_called()
        assert result is True
        assert "already cached" in capsys.readouterr().out

    def test_downloads_missing_models(self):
        with patch.object(provision, "_hf_is_cached", return_value=False):
            with patch.object(provision, "_hf_download", return_value=True) as mock_dl:
                result = provision.provision_hf()
        assert mock_dl.call_count == len(provision.HF_MODELS)
        assert result is True

    def test_returns_false_when_download_fails(self):
        with patch.object(provision, "_hf_is_cached", return_value=False):
            with patch.object(provision, "_hf_download", return_value=False):
                result = provision.provision_hf()
        assert result is False

    def test_partial_cache_only_downloads_missing(self):
        repos = [m["repo"] for m in provision.HF_MODELS]
        cached_repo = repos[0]

        def is_cached(repo):
            return repo == cached_repo

        with patch.object(provision, "_hf_is_cached", side_effect=is_cached):
            with patch.object(provision, "_hf_download", return_value=True) as mock_dl:
                result = provision.provision_hf()

        downloaded = [call.args[0] for call in mock_dl.call_args_list]
        assert cached_repo not in downloaded
        assert repos[1] in downloaded
        assert result is True


# ═══════════════════════════════════════════════════════════
#  verify()
# ═══════════════════════════════════════════════════════════

class TestVerify:

    def test_shows_all_present(self, capsys):
        all_tags = [m["tag"] for m in provision.OLLAMA_MODELS]
        with patch.object(provision, "_find_ollama_runner", return_value="docker"):
            with patch.object(provision, "_ollama_list_tags", return_value=all_tags):
                with patch.object(provision, "_hf_is_cached", return_value=True):
                    provision.verify()
        out = capsys.readouterr().out
        for m in provision.OLLAMA_MODELS:
            assert m["tag"] in out
        for m in provision.HF_MODELS:
            assert m["repo"] in out

    def test_shows_not_reachable_when_no_runner(self, capsys):
        with patch.object(provision, "_find_ollama_runner", return_value=None):
            with patch.object(provision, "_hf_is_cached", return_value=False):
                provision.verify()
        assert "not reachable" in capsys.readouterr().out

    def test_all_models_listed(self, capsys):
        with patch.object(provision, "_find_ollama_runner", return_value="local"):
            with patch.object(provision, "_ollama_list_tags", return_value=[]):
                with patch.object(provision, "_hf_is_cached", return_value=False):
                    provision.verify()
        out = capsys.readouterr().out
        assert len(provision.OLLAMA_MODELS) == 3
        assert len(provision.HF_MODELS) == 2
        for m in provision.OLLAMA_MODELS:
            assert m["tag"] in out
        for m in provision.HF_MODELS:
            assert m["repo"] in out


# ═══════════════════════════════════════════════════════════
#  Model catalogue completeness
# ═══════════════════════════════════════════════════════════

class TestModelCatalogue:

    def test_ollama_catalogue_has_required_models(self):
        tags = [m["tag"] for m in provision.OLLAMA_MODELS]
        assert "llama3.2:1b" in tags   # primary text LLM
        assert "llava:7b" in tags      # vision model

    def test_hf_catalogue_has_embedding_model(self):
        repos = [m["repo"] for m in provision.HF_MODELS]
        assert "sentence-transformers/all-MiniLM-L6-v2" in repos

    def test_hf_catalogue_has_reranker_model(self):
        repos = [m["repo"] for m in provision.HF_MODELS]
        assert "BAAI/bge-reranker-base" in repos

    def test_every_ollama_entry_has_required_keys(self):
        for m in provision.OLLAMA_MODELS:
            assert "tag"  in m
            assert "size" in m
            assert "role" in m

    def test_every_hf_entry_has_required_keys(self):
        for m in provision.HF_MODELS:
            assert "repo" in m
            assert "size" in m
            assert "role" in m


# ═══════════════════════════════════════════════════════════
#  CLI argument parsing  (main())
# ═══════════════════════════════════════════════════════════

class TestCLI:

    def _run_main(self, argv, **patches):
        with patch("sys.argv", ["provision.py"] + argv):
            with patch.object(provision, "provision_ollama", return_value=True) as mock_ol:
                with patch.object(provision, "provision_hf", return_value=True) as mock_hf:
                    with patch.object(provision, "verify") as mock_vfy:
                        provision.main()
        return mock_ol, mock_hf, mock_vfy

    def test_default_runs_both(self):
        mock_ol, mock_hf, _ = self._run_main([])
        mock_ol.assert_called_once()
        mock_hf.assert_called_once()

    def test_skip_ollama_skips_ollama(self):
        mock_ol, mock_hf, _ = self._run_main(["--skip-ollama"])
        mock_ol.assert_not_called()
        mock_hf.assert_called_once()

    def test_skip_hf_skips_hf(self):
        mock_ol, mock_hf, _ = self._run_main(["--skip-hf"])
        mock_ol.assert_called_once()
        mock_hf.assert_not_called()

    def test_verify_flag_calls_verify_only(self):
        mock_ol, mock_hf, mock_vfy = self._run_main(["--verify"])
        mock_vfy.assert_called_once()
        mock_ol.assert_not_called()
        mock_hf.assert_not_called()

    def test_skip_both_runs_nothing(self):
        mock_ol, mock_hf, _ = self._run_main(["--skip-ollama", "--skip-hf"])
        mock_ol.assert_not_called()
        mock_hf.assert_not_called()
