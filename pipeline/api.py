"""Small client for the Bzzoiro Sports Data API with an on-disk cache."""
from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path

import requests

from .config import API, RAW

_local = threading.local()
_lock = threading.Lock()
calls = 0


def _session() -> requests.Session:
    if not hasattr(_local, "s"):
        s = requests.Session()
        token = os.environ.get("BSD_TOKEN")
        if token:  # in a cloud session the proxy adds the header instead
            s.headers["Authorization"] = f"Token {token}"
        _local.s = s
    return _local.s


def cache_path(path: str, params: dict | None = None) -> Path:
    key = path.strip("/").replace("/", "_")
    if params:
        key += "__" + "_".join(f"{k}-{v}" for k, v in sorted(params.items()))
    return RAW / f"{key}.json"


def get(path: str, params: dict | None = None, refresh: bool = False):
    """GET `path`; reuse the cached copy unless `refresh`. Missing (404) is cached as {}."""
    global calls
    f = cache_path(path, params)
    if f.exists() and not refresh:
        return json.loads(f.read_text())
    last = None
    for attempt in range(5):
        try:
            r = _session().get(API + path, params=params, timeout=60)
        except requests.RequestException as ex:
            last = ex
            time.sleep(2 * (attempt + 1))
            continue
        with _lock:
            calls += 1
        if r.status_code == 200:
            data = r.json()
            break
        if r.status_code == 404:
            data = {}
            break
        last = RuntimeError(f"{r.status_code} for {path}: {r.text[:200]}")
        if r.status_code in (401, 402, 400):
            raise last
        time.sleep(3 * (attempt + 1))
    else:
        raise RuntimeError(f"giving up on {path}: {last}")
    f.parent.mkdir(parents=True, exist_ok=True)
    tmp = f.with_suffix(f".{threading.get_ident()}.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False))
    tmp.replace(f)
    return data


def get_all(path: str, params: dict | None = None, refresh: bool = False) -> list[dict]:
    out, offset = [], 0
    while True:
        d = get(path, {**(params or {}), "limit": 200, "offset": offset}, refresh)
        out += d.get("results", [])
        if not d.get("next"):
            return out
        offset += 200
