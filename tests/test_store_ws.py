"""WebSocket API tests (needs pytest-homeassistant-custom-component)."""

from unittest.mock import AsyncMock, patch

import pytest

from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.matter_code_vault.const import DOMAIN, PANEL_URL_PATH

REF_QR = "MT:Y.K9042C00KA0648G00"
REF_MANUAL = "34970112332"


@pytest.fixture
async def setup_vault(hass: HomeAssistant):
    # The test environment has no built frontend (hass_frontend package), so
    # mark frontend/panel_custom as loaded and stub the panel registration.
    hass.config.components.add("frontend")
    hass.config.components.add("panel_custom")
    # Patch HA's modules, not "custom_components.matter_code_vault.frontend",
    # which would resolve to our static frontend/ folder.
    with (
        patch(
            "homeassistant.components.panel_custom.async_register_panel",
            new=AsyncMock(),
        ) as register_panel,
        patch("homeassistant.components.frontend.async_remove_panel"),
    ):
        entry = MockConfigEntry(domain=DOMAIN, data={})
        entry.add_to_hass(hass)
        assert await hass.config_entries.async_setup(entry.entry_id)
        await hass.async_block_till_done()
        assert register_panel.await_args.kwargs["frontend_url_path"] == PANEL_URL_PATH
        yield entry
        # Unloading flushes the delayed save, so no timer lingers after the test.
        assert await hass.config_entries.async_unload(entry.entry_id)
        await hass.async_block_till_done()


async def test_crud(hass: HomeAssistant, setup_vault, hass_ws_client):
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": f"{DOMAIN}/decode", "code": REF_QR})
    res = await client.receive_json()
    assert res["success"]
    assert res["result"]["payload"]["manual_code"] == REF_MANUAL
    assert res["result"]["existing_id"] is None

    await client.send_json_auto_id(
        {
            "type": f"{DOMAIN}/add",
            "code": REF_QR,
            "name": "Test lamp",
            "device_type": "lamp",
            "room": "Kitchen",
        }
    )
    res = await client.receive_json()
    assert res["success"]
    entry_id = res["result"]["id"]
    assert res["result"]["vendor_id"] == 0xFFF1

    # Same code again via the manual form is a duplicate.
    await client.send_json_auto_id({"type": f"{DOMAIN}/add", "code": "3497-011-2332"})
    res = await client.receive_json()
    assert not res["success"]
    assert res["error"]["code"] == "duplicate"

    await client.send_json_auto_id(
        {"type": f"{DOMAIN}/update", "entry_id": entry_id, "room": "Bedroom"}
    )
    res = await client.receive_json()
    assert res["result"]["room"] == "Bedroom"
    assert res["result"]["name"] == "Test lamp"

    await client.send_json_auto_id({"type": f"{DOMAIN}/list"})
    res = await client.receive_json()
    assert len(res["result"]["entries"]) == 1

    await client.send_json_auto_id({"type": f"{DOMAIN}/delete", "entry_id": entry_id})
    assert (await client.receive_json())["success"]

    await client.send_json_auto_id({"type": f"{DOMAIN}/list"})
    res = await client.receive_json()
    assert res["result"]["entries"] == []


async def test_invalid_code(hass: HomeAssistant, setup_vault, hass_ws_client):
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": f"{DOMAIN}/add", "code": "1234-567-8900"})
    res = await client.receive_json()
    assert not res["success"]
    assert res["error"]["code"] == "invalid_code"


async def test_non_admin_rejected(
    hass: HomeAssistant, setup_vault, hass_ws_client, hass_read_only_access_token
):
    client = await hass_ws_client(hass, hass_read_only_access_token)
    await client.send_json_auto_id({"type": f"{DOMAIN}/list"})
    res = await client.receive_json()
    assert not res["success"]
    assert res["error"]["code"] == "unauthorized"
