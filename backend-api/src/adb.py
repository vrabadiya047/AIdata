# src/adb.py
"""
Async adapter for synchronous database/auth/manager modules.

psycopg2 is blocking — calling it directly from an async route handler
monopolises the event loop thread, freezing the server under concurrent load.
This module wraps every public function from the three sync modules in
run_in_threadpool so route handlers can simply `await adb.func(...)`.

Usage in main.py:
    from src import adb
    projects = await adb.get_all_projects(username)
"""
import functools
import inspect
from fastapi.concurrency import run_in_threadpool

from src import database as _db
from src import auth     as _auth
from src import manager  as _mgr


def _wrap(module, name):
    """Return an async wrapper that looks up `name` on `module` at call time.

    Late binding (getattr at call time rather than capturing fn at import time)
    means unittest.mock.patch on the underlying module attribute is intercepted
    correctly during tests.
    """
    original = getattr(module, name)
    @functools.wraps(original)
    async def _async(*args, **kwargs):
        return await run_in_threadpool(getattr(module, name), *args, **kwargs)
    return _async


def _export(module):
    for name in dir(module):
        if name.startswith('_'):
            continue
        obj = getattr(module, name)
        if inspect.isfunction(obj) and name not in globals():
            globals()[name] = _wrap(module, name)


_export(_db)
_export(_auth)
_export(_mgr)
