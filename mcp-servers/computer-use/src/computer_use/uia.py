"""UI Automation core: structured snapshots with stable uids, and deterministic control.

Everything the MCP tools need lives here. The module keeps a small amount of session
state (the last snapshot and the uid -> element map) so that:
  * ``snapshot`` can assign short, stable uids to tree nodes;
  * ``click``/``fill``/``scroll`` can resolve an element by that uid, or by a live
    ``role`` + ``name`` / ``automation_id`` search when no snapshot was taken;
  * ``eval_state`` can diff the live tree against the last snapshot.

Elements are pywinauto UIA ``element_info`` objects; actions wrap them in a
``UIAWrapper``. Errors are raised as ``UiaError`` and translated to structured JSON
by the tool layer.
"""

from __future__ import annotations

import base64
import ctypes
import hashlib
import io
import os
import tempfile
import threading
import time
from typing import Any, Iterable, Iterator, Optional

from pywinauto import Desktop
from pywinauto.controls.uiawrapper import UIAWrapper

DEFAULT_MAX_DEPTH = 12
DEFAULT_MAX_NODES = 250
DEFAULT_TIMEOUT = 5.0
POLL_INTERVAL = 0.15

_UIA = Desktop(backend="uia")
_LOCK = threading.RLock()

# --- session state -----------------------------------------------------------
_last_nodes: list[dict[str, Any]] = []
_uid_map: dict[str, Any] = {}


class UiaError(RuntimeError):
    """A recoverable UIA failure (bad uid, element gone, unsupported action)."""


# --- element helpers ---------------------------------------------------------
def _get(info: Any, name: str, default: Any = None) -> Any:
    try:
        value = getattr(info, name)
    except Exception:
        return default
    try:
        return value() if callable(value) and name in ("children", "iter_children") else value
    except Exception:
        return default


def _children(info: Any) -> list[Any]:
    """Return the direct UIA children of an element, tolerating API variants."""
    for attr in ("children",):
        value = getattr(info, attr, None)
        if value is None:
            continue
        try:
            items = value() if callable(value) else value
            return [c for c in items]  # type: ignore[union-attr]
        except Exception:
            continue
    fn = getattr(info, "iter_children", None)
    if callable(fn):
        try:
            return [c for c in fn()]  # type: ignore[union-attr]
        except Exception:
            pass
    return []


def _uid_for(info: Any) -> str:
    """A short uid that is stable for the same element within a session.

    Prefers the UI Automation runtime id (unique and stable while the element lives);
    falls back to a structural fingerprint when it is unavailable.
    """
    pid = _get(info, "process_id", None)
    rid = _get(info, "runtime_id", None)
    if rid:
        raw = f"{pid}:{tuple(rid)}"
    else:
        raw = "|".join(
            str(_get(info, k, "") or "")
            for k in ("class_name", "name", "automation_id", "control_type")
        )
        raw = f"{pid}:{raw}:{_get(info, 'handle', '')}"
    return hashlib.sha1(raw.encode("utf-8", "replace")).hexdigest()[:12]


def _node(info: Any, depth: int, parent_uid: Optional[str]) -> dict[str, Any]:
    rect = None
    try:
        r = info.rectangle
        rect = [int(r.left), int(r.top), int(r.right), int(r.bottom)]
    except Exception:
        rect = None
    return {
        "uid": _uid_for(info),
        "role": _get(info, "control_type", None) or _get(info, "class_name", None) or "",
        "name": _get(info, "name", "") or "",
        "automation_id": _get(info, "automation_id", "") or "",
        "class_name": _get(info, "class_name", "") or "",
        "rect": rect,
        "enabled": bool(_get(info, "enabled", True)),
        "visible": bool(_get(info, "visible", True)),
        "depth": depth,
        "parent_uid": parent_uid,
    }


def _roots(scope: str) -> list[Any]:
    try:
        wins = _UIA.windows()
    except Exception as exc:  # pragma: no cover - environment dependent
        raise UiaError(f"cannot enumerate top-level windows: {exc}") from exc

    if scope == "desktop":
        return [w.element_info for w in wins]
    if scope == "foreground":
        hwnd = ctypes.windll.user32.GetForegroundWindow()
        for w in wins:
            try:
                if w.element_info.handle == hwnd:
                    return [w.element_info]
            except Exception:
                continue
        return [wins[0].element_info] if wins else []
    raise UiaError(f"unknown scope {scope!r} (expected 'foreground' or 'desktop')")


def _iter_all(limit: int = 4000, max_depth: int = DEFAULT_MAX_DEPTH) -> Iterator[Any]:
    """Depth-first walk of all top-level windows, bounded."""
    seen = 0
    stack: list[tuple[Any, int]] = [(w.element_info, 0) for w in _UIA.windows()]
    while stack and seen < limit:
        info, depth = stack.pop()
        seen += 1
        yield info
        if depth < max_depth:
            for child in reversed(_children(info)):
                stack.append((child, depth + 1))


# --- public API --------------------------------------------------------------
def _capture(scope: str, max_depth: int, max_nodes: int) -> tuple[list[dict[str, Any]], dict[str, Any], bool]:
    """Walk the UIA tree once and return (nodes, uid_map, truncated) without storing."""
    roots = _roots(scope)
    nodes: list[dict[str, Any]] = []
    uid_map: dict[str, Any] = {}
    truncated = False
    stack: list[tuple[Any, int, Optional[str]]] = [(r, 0, None) for r in reversed(roots)]
    while stack:
        info, depth, parent = stack.pop()
        if len(nodes) >= max_nodes:
            truncated = True
            break
        try:
            node = _node(info, depth, parent)
        except Exception:
            continue
        nodes.append(node)
        uid_map[node["uid"]] = info
        if depth < max_depth:
            for child in reversed(_children(info)):
                stack.append((child, depth + 1, node["uid"]))
    return nodes, uid_map, truncated


def snapshot(
    scope: str = "foreground",
    max_depth: int = DEFAULT_MAX_DEPTH,
    max_nodes: int = DEFAULT_MAX_NODES,
) -> dict[str, Any]:
    """Capture a structured UIA snapshot; stores it as the session baseline."""
    with _LOCK:
        nodes, uid_map, truncated = _capture(scope, max_depth, max_nodes)
        global _last_nodes, _uid_map
        _last_nodes = nodes
        _uid_map = uid_map
        return {
            "scope": scope,
            "count": len(nodes),
            "truncated": truncated,
            "max_depth": max_depth,
            "nodes": nodes,
        }


def resolve(
    uid: Optional[str] = None,
    role: Optional[str] = None,
    name: Optional[str] = None,
    automation_id: Optional[str] = None,
) -> Any:
    """Resolve a live element by uid (from the last snapshot) or by attributes."""
    with _LOCK:
        if uid:
            info = _uid_map.get(uid)
            if info is not None:
                return info
            raise UiaError(f"unknown uid {uid!r}; take a snapshot first")
        if not (role or name or automation_id):
            raise UiaError("provide a uid, or role/name/automation_id to locate the element")
        # Prefer the elements captured by the last snapshot: targeting the freshest
        # captured tree is far more reliable than re-walking UIA live.
        for node in _last_nodes:
            if role and (node.get("role", "") or "").lower() != role.lower():
                continue
            if name and name.lower() not in (node.get("name", "") or "").lower():
                continue
            if automation_id and (node.get("automation_id", "") or "") != automation_id:
                continue
            info = _uid_map.get(node["uid"])
            if info is not None:
                return info
        for info in _iter_all():
            ct = (_get(info, "control_type", "") or "").lower()
            nm = (_get(info, "name", "") or "")
            aid = (_get(info, "automation_id", "") or "")
            if role and ct != role.lower():
                continue
            if name and name.lower() not in nm.lower():
                continue
            if automation_id and aid != automation_id:
                continue
            return info
        raise UiaError(
            "no element matched "
            + ", ".join(f"{k}={v!r}" for k, v in
                        (("role", role), ("name", name), ("automation_id", automation_id)) if v)
        )


def _wrapper(info: Any) -> UIAWrapper:
    try:
        return UIAWrapper(info)
    except Exception as exc:  # pragma: no cover - environment dependent
        raise UiaError(f"cannot wrap element: {exc}") from exc


def click(
    uid: Optional[str] = None,
    role: Optional[str] = None,
    name: Optional[str] = None,
    automation_id: Optional[str] = None,
    button: str = "left",
    double: bool = False,
) -> dict[str, Any]:
    info = resolve(uid=uid, role=role, name=name, automation_id=automation_id)
    wrapper = _wrapper(info)
    try:
        wrapper.set_focus()
    except Exception:
        pass
    wrapper.click_input(button=button, double=double)
    return {"clicked": _node(info, 0, None), "button": button, "double": double}


def fill(
    value: str,
    uid: Optional[str] = None,
    role: Optional[str] = None,
    name: Optional[str] = None,
    automation_id: Optional[str] = None,
) -> dict[str, Any]:
    info = resolve(uid=uid, role=role, name=name, automation_id=automation_id)
    wrapper = _wrapper(info)
    # Preferred: the UI Automation Value pattern writes text without simulating keys.
    iv = getattr(wrapper, "iface_value", None)
    if iv is not None:
        try:
            iv.SetValue(value)
            return {"filled": _node(info, 0, None), "method": "iface_value.SetValue", "value": value}
        except Exception:
            pass
    # Fallback: focus and type, escaping pywinauto special characters.
    try:
        wrapper.set_focus()
        wrapper.type_keys(_escape(value), with_spaces=True)
        return {"filled": _node(info, 0, None), "method": "type_keys", "value": value}
    except Exception as exc:
        raise UiaError(f"cannot fill element ({exc})") from exc


def press_key(keys: str, uid: Optional[str] = None) -> dict[str, Any]:
    from pywinauto.keyboard import send_keys

    if uid:
        try:
            _wrapper(resolve(uid=uid)).set_focus()
        except Exception:
            pass
    send_keys(keys)
    return {"pressed": keys}


def scroll(
    direction: str = "down",
    amount: int = 3,
    uid: Optional[str] = None,
    role: Optional[str] = None,
    name: Optional[str] = None,
    automation_id: Optional[str] = None,
) -> dict[str, Any]:
    info = resolve(uid=uid, role=role, name=name, automation_id=automation_id)
    wrapper = _wrapper(info)
    try:
        wrapper.set_focus()
    except Exception:
        pass
    try:
        wrapper.scroll(direction, amount)
        return {"scrolled": _node(info, 0, None), "direction": direction, "amount": amount}
    except Exception:
        # Fall back to a wheel event at the element centre.
        from pywinauto import mouse

        rect = info.rectangle
        cx, cy = (rect.left + rect.right) // 2, (rect.top + rect.bottom) // 2
        delta = -amount if direction in ("down", "pgdn") else amount
        mouse.scroll(coords=(cx, cy), wheel_dist=delta)
        return {"scrolled": _node(info, 0, None), "direction": direction, "amount": amount, "method": "wheel"}


def wait_for(
    role: Optional[str] = None,
    name: Optional[str] = None,
    automation_id: Optional[str] = None,
    timeout: float = DEFAULT_TIMEOUT,
    state: str = "exists",
) -> dict[str, Any]:
    """Wait until an element matching role/name satisfies *state*.

    ``state`` is one of: exists, visible, enabled, absent.
    """
    deadline = time.monotonic() + max(0.0, float(timeout))
    last: Optional[dict[str, Any]] = None
    while True:
        match = _find(role=role, name=name, automation_id=automation_id)
        ok = False
        if state == "absent":
            ok = match is None
        elif match is not None:
            ok = (
                state == "exists"
                or (state == "visible" and match["visible"])
                or (state == "enabled" and match["enabled"])
            )
        if ok:
            return {"state": state, "met": True, "elapsed": round(max(0.0, float(timeout)) - max(0.0, deadline - time.monotonic()), 3),
                    "element": match}
        last = match
        if time.monotonic() >= deadline:
            return {"state": state, "met": False, "timeout": timeout, "element": last}
        time.sleep(POLL_INTERVAL)


def _find(role: Optional[str], name: Optional[str], automation_id: Optional[str] = None) -> Optional[dict[str, Any]]:
    # Observe live state with a fresh capture (never clobbering the stored baseline),
    # then fall back to a live walk.
    try:
        nodes, _map, _trunc = _capture("foreground", DEFAULT_MAX_DEPTH, DEFAULT_MAX_NODES)
    except Exception:
        nodes = []
    for node in nodes:
        if role and (node.get("role", "") or "").lower() != role.lower():
            continue
        if name and name.lower() not in (node.get("name", "") or "").lower():
            continue
        if automation_id and (node.get("automation_id", "") or "") != automation_id:
            continue
        return node
    for info in _iter_all():
        ct = (_get(info, "control_type", "") or "").lower()
        nm = (_get(info, "name", "") or "")
        aid = (_get(info, "automation_id", "") or "")
        if role and ct != role.lower():
            continue
        if name and name.lower() not in nm.lower():
            continue
        if automation_id and aid != automation_id:
            continue
        try:
            return _node(info, 0, None)
        except Exception:
            return None
    return None


def screenshot(
    uid: Optional[str] = None,
    save_path: Optional[str] = None,
    max_side: int = 1400,
    quality: int = 75,
    inline: bool = False,
    max_inline_bytes: int = 200_000,
) -> dict[str, Any]:
    """Capture the screen (or an element) to a JPEG file; bound the return payload."""
    from PIL import ImageGrab

    bbox = None
    if uid:
        rect = resolve(uid=uid).rectangle
        bbox = (rect.left, rect.top, rect.right, rect.bottom)

    image = ImageGrab.grab(bbox=bbox, all_screens=(bbox is None))
    w, h = image.size
    scale = min(1.0, max_side / max(w, h)) if max(w, h) else 1.0
    if scale < 1.0:
        image = image.resize((max(1, int(w * scale)), max(1, int(h * scale))))

    if save_path is None:
        fd, save_path = tempfile.mkstemp(prefix="computer-use-", suffix=".jpg")
        os.close(fd)
    fmt = "JPEG" if save_path.lower().endswith((".jpg", ".jpeg")) else "PNG"
    if fmt == "JPEG":
        image.convert("RGB").save(save_path, fmt, quality=quality)
    else:
        image.save(save_path, fmt)

    size_bytes = os.path.getsize(save_path)
    result: dict[str, Any] = {
        "path": save_path,
        "width": image.size[0],
        "height": image.size[1],
        "bytes": size_bytes,
        "format": fmt,
        "scope": f"element:{uid}" if uid else "screen",
    }
    if inline and size_bytes <= max_inline_bytes:
        with open(save_path, "rb") as fh:
            result["data_base64"] = base64.b64encode(fh.read()).decode("ascii")
    return result


def eval_state(
    scope: str = "foreground",
    max_depth: int = DEFAULT_MAX_DEPTH,
) -> dict[str, Any]:
    """Diff the live UI tree against the last snapshot (before/after comparison)."""
    with _LOCK:
        before = {n["uid"]: n for n in _last_nodes}
        current = snapshot(scope=scope, max_depth=max_depth)
        after = {n["uid"]: n for n in current["nodes"]}

        added = [after[u] for u in after if u not in before]
        removed = [before[u] for u in before if u not in after]
        changed = []
        for u in after:
            if u not in before:
                continue
            b, a = before[u], after[u]
            delta = {
                k: {"before": b[k], "after": a[k]}
                for k in ("name", "enabled", "visible", "rect", "role")
                if b.get(k) != a.get(k)
            }
            if delta:
                changed.append({"uid": u, "changes": delta})
        return {
            "scope": scope,
            "baseline_was_empty": not before,
            "counts": {"added": len(added), "removed": len(removed), "changed": len(changed)},
            "added": added[:100],
            "removed": removed[:100],
            "changed": changed[:100],
            "truncated": current.get("truncated", False),
        }


def _escape(text: str) -> str:
    """Escape pywinauto ``type_keys`` metacharacters in literal text."""
    specials = set("+^%~(){}[]")
    return "".join("{" + ch + "}" if ch in specials else ch for ch in text)
