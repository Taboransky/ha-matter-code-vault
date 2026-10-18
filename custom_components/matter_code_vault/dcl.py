"""Lookup of vendor/product names in the CSA Distributed Compliance Ledger."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import aiohttp

from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import (
    DCL_BASE_URL,
    DEVICE_TYPE_KEYWORDS,
    MATTER_DEVICE_TYPE_MAP,
)
from .store import CodeStore

_LOGGER = logging.getLogger(__name__)
_TIMEOUT = aiohttp.ClientTimeout(total=10)


def guess_device_type(device_type_id: int | None, *names: str) -> str:
    """Guess our device type from a Matter device type ID or product names."""
    if device_type_id in MATTER_DEVICE_TYPE_MAP:
        return MATTER_DEVICE_TYPE_MAP[device_type_id]
    text = " ".join(n for n in names if n).lower()
    for device_type, keywords in DEVICE_TYPE_KEYWORDS:
        if any(k in text for k in keywords):
            return device_type
    return "other"


async def _get_json(hass: HomeAssistant, url: str) -> dict[str, Any] | None:
    session = async_get_clientsession(hass)
    try:
        async with session.get(url, timeout=_TIMEOUT) as resp:
            if resp.status == 404:
                return None
            resp.raise_for_status()
            return await resp.json()
    except (aiohttp.ClientError, asyncio.TimeoutError) as err:
        raise LookupError(f"DCL request failed: {err}") from err


async def async_lookup(
    hass: HomeAssistant, store: CodeStore, vendor_id: int, product_id: int
) -> dict[str, Any]:
    """Return vendor/product info for a VID/PID, cached in the store.

    Raises LookupError when the DCL cannot be reached. Unknown products
    return empty names rather than raising.
    """
    key = f"{vendor_id}:{product_id}"
    if key in store.dcl_cache:
        return store.dcl_cache[key]

    vendor = await _get_json(hass, f"{DCL_BASE_URL}/vendorinfo/vendors/{vendor_id}")
    model = await _get_json(
        hass, f"{DCL_BASE_URL}/model/models/{vendor_id}/{product_id}"
    )
    vinfo = (vendor or {}).get("vendorInfo", {})
    minfo = (model or {}).get("model", {})

    product_name = minfo.get("productName") or minfo.get("productLabel") or ""
    result = {
        "found": bool(vinfo or minfo),
        "vendor_name": vinfo.get("companyPreferredName") or vinfo.get("vendorName") or "",
        "product_name": product_name,
        "part_number": minfo.get("partNumber") or "",
        "device_type": guess_device_type(
            minfo.get("deviceTypeId"), product_name, minfo.get("productLabel", "")
        ),
    }
    if result["found"]:
        # Don't cache misses: the product may be certified later.
        store.dcl_cache[key] = result
        store.schedule_save()
    _LOGGER.debug("DCL lookup %s -> %s", key, result)
    return result
