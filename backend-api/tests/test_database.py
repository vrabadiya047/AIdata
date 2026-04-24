"""Unit tests for database functions — no HTTP layer involved."""
import os
import pytest

from src.database import (
    add_custom_project, get_all_projects, delete_project_data, rename_project,
    get_project_threads, save_chat_message, get_chat_history,
    rename_thread, delete_thread,
    save_file_project, delete_file_metadata,
    share_project_with_user, get_project_shares, unshare_project_from_user,
    create_group, add_group_member, get_user_groups, delete_group,
)


def _mk_project_dir(username: str, project: str):
    """get_all_projects checks DATA_DIR for directory existence."""
    path = os.path.join(os.environ["SOVEREIGN_DATA_DIR"], username, project)
    os.makedirs(path, exist_ok=True)
    return path


# ── Projects ─────────────────────────────────────────────────────────────────

def test_add_and_get_project():
    _mk_project_dir("dbuser1", "ProjA")
    add_custom_project("ProjA", "dbuser1")
    projects = get_all_projects("dbuser1")
    assert any(p["name"] == "ProjA" for p in projects)


def test_rename_project():
    _mk_project_dir("dbuser2", "OldProj")
    add_custom_project("OldProj", "dbuser2")
    # Rename physical dir (mirrors what the API does)
    old_path = os.path.join(os.environ["SOVEREIGN_DATA_DIR"], "dbuser2", "OldProj")
    new_path = os.path.join(os.environ["SOVEREIGN_DATA_DIR"], "dbuser2", "NewProj")
    os.rename(old_path, new_path)
    rename_project("OldProj", "NewProj", "dbuser2")
    projects = get_all_projects("dbuser2")
    names = [p["name"] for p in projects]
    assert "NewProj" in names
    assert "OldProj" not in names


def test_delete_project():
    _mk_project_dir("dbuser3", "ToDelete")
    add_custom_project("ToDelete", "dbuser3")
    delete_project_data("ToDelete", "dbuser3")
    projects = get_all_projects("dbuser3")
    assert not any(p["name"] == "ToDelete" for p in projects)


# ── Chat history ──────────────────────────────────────────────────────────────

def test_save_and_get_history():
    save_chat_message("HistProj", "huser", "Thread1", "user", "Hello!")
    save_chat_message("HistProj", "huser", "Thread1", "assistant", "Hi there!")
    history = get_chat_history("HistProj", "huser", "Thread1")
    assert len(history) == 2
    assert history[0]["role"] == "user"
    assert history[0]["content"] == "Hello!"
    assert history[1]["role"] == "assistant"


def test_history_empty_for_unknown_thread():
    history = get_chat_history("NoProj", "nobody", "NoThread")
    assert history == []


# ── Threads ───────────────────────────────────────────────────────────────────

def test_get_threads():
    save_chat_message("TProj", "tuser", "MyThread", "user", "msg")
    threads = get_project_threads("TProj", "tuser")
    assert "MyThread" in threads


def test_rename_thread():
    save_chat_message("RProj", "ruser", "OldThread", "user", "msg")
    rename_thread("RProj", "ruser", "OldThread", "NewThread")
    threads = get_project_threads("RProj", "ruser")
    assert "NewThread" in threads
    assert "OldThread" not in threads


def test_delete_thread():
    save_chat_message("DProj", "duser", "GoneThread", "user", "msg")
    delete_thread("DProj", "duser", "GoneThread")
    threads = get_project_threads("DProj", "duser")
    assert "GoneThread" not in threads


def test_threads_ordered_by_most_recent():
    save_chat_message("OrdProj", "ouser", "Thread1", "user", "first")
    save_chat_message("OrdProj", "ouser", "Thread2", "user", "second")
    threads = get_project_threads("OrdProj", "ouser")
    assert "Thread1" in threads
    assert "Thread2" in threads


# ── File metadata ─────────────────────────────────────────────────────────────

def test_save_and_delete_file_metadata():
    save_file_project("report.pdf", "FileProj", "fuser")
    delete_file_metadata("report.pdf", "fuser")


# ── Sharing ───────────────────────────────────────────────────────────────────

def test_share_and_unshare():
    add_custom_project("SharedProj", "sowner")
    share_project_with_user("SharedProj", "sowner", "recip1")
    shares = get_project_shares("SharedProj", "sowner")
    assert any(s["username"] == "recip1" for s in shares)

    unshare_project_from_user("SharedProj", "sowner", "recip1")
    shares = get_project_shares("SharedProj", "sowner")
    assert not any(s["username"] == "recip1" for s in shares)


def test_no_shares_by_default():
    add_custom_project("PrivateProj", "pvtowner")
    shares = get_project_shares("PrivateProj", "pvtowner")
    assert shares == []


# ── Groups ────────────────────────────────────────────────────────────────────

def test_create_group_and_add_member():
    create_group("Engineers", "gowner")
    add_group_member("Engineers", "gowner", "alice")
    groups = get_user_groups("gowner")
    grp = next((g for g in groups if g["name"] == "Engineers"), None)
    assert grp is not None
    assert "alice" in grp["members"]


def test_delete_group():
    create_group("TempGroup", "gowner2")
    delete_group("TempGroup", "gowner2")
    groups = get_user_groups("gowner2")
    assert not any(g["name"] == "TempGroup" for g in groups)
