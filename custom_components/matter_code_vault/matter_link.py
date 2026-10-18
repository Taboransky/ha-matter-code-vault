"""Suggest Home Assistant Matter devices that match a stored code."""

from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr

MATTER_DOMAIN = "matter"


def _tokens(text: str | None) -> set[str]:
    return {t for t in (text or "").lower().replace("/", " ").split() if len(t) > 2}


def _score(device: dr.DeviceEntry, entry: dict[str, Any] | None) -> int:
    if not entry:
        return 0
    score = 0
    pid = entry.get("product_id")
    if pid is not None and device.model_id in (str(pid), f"0x{pid:04x}", f"0x{pid:04X}"):
        score += 2
    product = (entry.get("product_name") or "").lower()
    if product and (device.model or "").lower() == product:
        score += 2
    if _tokens(device.manufacturer) & _tokens(entry.get("vendor_name")):
        score += 1
    return score


def async_matter_devices(
    hass: HomeAssistant, entry: dict[str, Any] | None, linked_ids: set[str]
) -> list[dict[str, Any]]:
    """List Matter devices in HA, best matches for `entry` first."""
    registry = dr.async_get(hass)
    result = []
    for device in registry.devices.values():
        if not any(domain == MATTER_DOMAIN for domain, _ in device.identifiers):
            continue
        if device.entry_type == dr.DeviceEntryType.SERVICE:
            continue
        score = _score(device, entry)
        result.append(
            {
                "id": device.id,
                "name": device.name_by_user or device.name or "",
                "manufacturer": device.manufacturer or "",
                "model": device.model or "",
                "area_id": device.area_id,
                "suggested": score >= 2,
                "score": score,
                "linked": device.id in linked_ids,
            }
        )
    result.sort(key=lambda d: (-d["score"], d["name"].lower()))
    return result
