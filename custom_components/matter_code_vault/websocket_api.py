"""WebSocket API used by the panel."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .const import DEVICE_TYPES, DOMAIN
from .dcl import async_lookup, guess_device_type
from .matter_link import async_matter_devices
from .matter_payload import PayloadError, parse_any
from .store import CodeStore

PREFIX = f"{DOMAIN}/"

_FIELDS = {
    vol.Optional("name"): vol.All(str, vol.Length(max=200)),
    vol.Optional("device_type"): vol.In(DEVICE_TYPES),
    vol.Optional("room"): vol.All(str, vol.Length(max=100)),
    vol.Optional("notes"): vol.All(str, vol.Length(max=2000)),
    vol.Optional("vendor_name"): vol.All(str, vol.Length(max=200)),
    vol.Optional("product_name"): vol.All(str, vol.Length(max=200)),
    vol.Optional("linked_device_id"): vol.Any(None, str),
}
_FIELDS_KEYS = tuple(k.schema for k in _FIELDS)


@callback
def async_register(hass: HomeAssistant) -> None:
    """Register all commands."""
    for handler in (
        ws_list,
        ws_decode,
        ws_lookup,
        ws_add,
        ws_update,
        ws_delete,
        ws_matter_devices,
    ):
        websocket_api.async_register_command(hass, handler)


def _store(hass: HomeAssistant, connection, msg) -> CodeStore | None:
    store: CodeStore | None = hass.data.get(DOMAIN)
    if store is None:
        connection.send_error(msg["id"], "not_loaded", "Matter Code Vault is not set up")
    return store


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): PREFIX + "list"})
@callback
def ws_list(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (store := _store(hass, connection, msg)) is None:
        return
    connection.send_result(
        msg["id"],
        {"entries": list(store.entries.values()), "device_types": DEVICE_TYPES},
    )


@websocket_api.require_admin
@websocket_api.websocket_command(
    {vol.Required("type"): PREFIX + "decode", vol.Required("code"): str}
)
@callback
def ws_decode(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    """Validate a scanned/typed code without saving it."""
    if (store := _store(hass, connection, msg)) is None:
        return
    try:
        payload = parse_any(msg["code"]).as_dict()
    except PayloadError as err:
        connection.send_error(msg["id"], "invalid_code", str(err))
        return
    existing = store.find_by_manual_code(payload["manual_code"])
    connection.send_result(
        msg["id"],
        {"payload": payload, "existing_id": existing["id"] if existing else None},
    )


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): PREFIX + "lookup",
        vol.Required("vendor_id"): vol.All(int, vol.Range(min=0, max=0xFFFF)),
        vol.Required("product_id"): vol.All(int, vol.Range(min=0, max=0xFFFF)),
    }
)
@websocket_api.async_response
async def ws_lookup(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (store := _store(hass, connection, msg)) is None:
        return
    try:
        result = await async_lookup(hass, store, msg["vendor_id"], msg["product_id"])
    except LookupError as err:
        connection.send_error(msg["id"], "lookup_failed", str(err))
        return
    connection.send_result(msg["id"], result)


@websocket_api.require_admin
@websocket_api.websocket_command(
    {vol.Required("type"): PREFIX + "add", vol.Required("code"): str, **_FIELDS}
)
@callback
def ws_add(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (store := _store(hass, connection, msg)) is None:
        return
    try:
        payload = parse_any(msg["code"]).as_dict()
    except PayloadError as err:
        connection.send_error(msg["id"], "invalid_code", str(err))
        return
    if store.find_by_manual_code(payload["manual_code"]):
        connection.send_error(msg["id"], "duplicate", "This code is already stored")
        return
    fields = {k: msg[k] for k in _FIELDS_KEYS if k in msg}
    if "device_type" not in fields:
        fields["device_type"] = guess_device_type(
            None, fields.get("product_name", ""), fields.get("name", "")
        )
    connection.send_result(msg["id"], store.add(payload, fields))


@websocket_api.require_admin
@websocket_api.websocket_command(
    {vol.Required("type"): PREFIX + "update", vol.Required("entry_id"): str, **_FIELDS}
)
@callback
def ws_update(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (store := _store(hass, connection, msg)) is None:
        return
    if msg["entry_id"] not in store.entries:
        connection.send_error(msg["id"], "not_found", "Entry not found")
        return
    fields = {k: msg[k] for k in _FIELDS_KEYS if k in msg}
    connection.send_result(msg["id"], store.update(msg["entry_id"], fields))


@websocket_api.require_admin
@websocket_api.websocket_command(
    {vol.Required("type"): PREFIX + "delete", vol.Required("entry_id"): str}
)
@callback
def ws_delete(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (store := _store(hass, connection, msg)) is None:
        return
    if msg["entry_id"] not in store.entries:
        connection.send_error(msg["id"], "not_found", "Entry not found")
        return
    store.delete(msg["entry_id"])
    connection.send_result(msg["id"])


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): PREFIX + "matter_devices",
        vol.Optional("entry_id"): str,
        # For a code that is not saved yet: match on these instead.
        vol.Optional("product_id"): vol.Any(None, int),
        vol.Optional("vendor_name"): str,
        vol.Optional("product_name"): str,
    }
)
@callback
def ws_matter_devices(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    if (store := _store(hass, connection, msg)) is None:
        return
    entry = store.entries.get(msg.get("entry_id", "")) or {
        k: msg.get(k) for k in ("product_id", "vendor_name", "product_name")
    }
    linked = {
        e["linked_device_id"]
        for e in store.entries.values()
        if e.get("linked_device_id") and e is not entry
    }
    connection.send_result(msg["id"], async_matter_devices(hass, entry, linked))

