"""Persistent storage of Matter codes."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
import uuid

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import STORAGE_KEY, STORAGE_VERSION

EDITABLE_FIELDS = (
    "name",
    "device_type",
    "room",
    "notes",
    "vendor_name",
    "product_name",
    "linked_device_id",
)


class CodeStore:
    """Holds all stored codes plus a small DCL lookup cache."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self.entries: dict[str, dict[str, Any]] = {}
        self.dcl_cache: dict[str, dict[str, Any]] = {}

    async def async_load(self) -> None:
        data = await self._store.async_load() or {}
        self.entries = {e["id"]: e for e in data.get("entries", [])}
        self.dcl_cache = data.get("dcl_cache", {})

    def _data(self) -> dict[str, Any]:
        return {"entries": list(self.entries.values()), "dcl_cache": self.dcl_cache}

    def schedule_save(self) -> None:
        self._store.async_delay_save(self._data, 1)

    def find_by_manual_code(self, manual_code: str) -> dict[str, Any] | None:
        return next(
            (e for e in self.entries.values() if e["manual_code"] == manual_code),
            None,
        )

    def add(self, payload: dict[str, Any], fields: dict[str, Any]) -> dict[str, Any]:
        now = datetime.now(UTC).isoformat()
        entry: dict[str, Any] = {
            "id": uuid.uuid4().hex,
            "qr_payload": payload.get("qr_payload"),
            "manual_code": payload["manual_code"],
            "vendor_id": payload.get("vendor_id"),
            "product_id": payload.get("product_id"),
            "discriminator": payload.get("discriminator"),
            "name": "",
            "device_type": "other",
            "room": "",
            "notes": "",
            "vendor_name": "",
            "product_name": "",
            "linked_device_id": None,
            "created": now,
            "updated": now,
        }
        entry.update({k: v for k, v in fields.items() if k in EDITABLE_FIELDS})
        self.entries[entry["id"]] = entry
        self.schedule_save()
        return entry

    def update(self, entry_id: str, fields: dict[str, Any]) -> dict[str, Any]:
        entry = self.entries[entry_id]
        entry.update({k: v for k, v in fields.items() if k in EDITABLE_FIELDS})
        entry["updated"] = datetime.now(UTC).isoformat()
        self.schedule_save()
        return entry

    def delete(self, entry_id: str) -> None:
        self.entries.pop(entry_id)
        self.schedule_save()
