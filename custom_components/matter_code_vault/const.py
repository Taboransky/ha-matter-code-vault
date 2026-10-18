"""Constants for Matter Code Vault."""

from __future__ import annotations

DOMAIN = "matter_code_vault"
VERSION = "0.1.1"

STORAGE_KEY = DOMAIN
STORAGE_VERSION = 1

PANEL_URL_PATH = "matter-code-vault"
PANEL_TITLE = "Matter Codes"
PANEL_ICON = "mdi:qrcode"
PANEL_COMPONENT = "matter-code-vault-panel"
STATIC_URL = "/matter_code_vault_static"

DCL_BASE_URL = "https://on.dcl.csa-iot.org/dcl"

DEVICE_TYPES = [
    "lamp",
    "plug",
    "switch",
    "sensor",
    "lock",
    "thermostat",
    "blind",
    "fan",
    "air_purifier",
    "media",
    "bridge",
    "other",
]

# Matter device type IDs (Device Library spec) -> our device types.
MATTER_DEVICE_TYPE_MAP: dict[int, str] = {
    0x0100: "lamp",  # On/Off Light
    0x0101: "lamp",  # Dimmable Light
    0x010C: "lamp",  # Color Temperature Light
    0x010D: "lamp",  # Extended Color Light
    0x010A: "plug",  # On/Off Plug-in Unit
    0x010B: "plug",  # Dimmable Plug-in Unit
    0x0103: "switch",  # On/Off Light Switch
    0x0104: "switch",  # Dimmer Switch
    0x0105: "switch",  # Color Dimmer Switch
    0x000F: "switch",  # Generic Switch
    0x0015: "sensor",  # Contact Sensor
    0x0106: "sensor",  # Light Sensor
    0x0107: "sensor",  # Occupancy Sensor
    0x0302: "sensor",  # Temperature Sensor
    0x0305: "sensor",  # Pressure Sensor
    0x0307: "sensor",  # Humidity Sensor
    0x002C: "sensor",  # Air Quality Sensor
    0x0076: "sensor",  # Smoke CO Alarm
    0x0043: "sensor",  # Water Leak Detector
    0x000A: "lock",  # Door Lock
    0x0301: "thermostat",  # Thermostat
    0x0202: "blind",  # Window Covering
    0x002B: "fan",  # Fan
    0x002D: "air_purifier",  # Air Purifier
    0x0022: "media",  # Speaker
    0x0023: "media",  # Casting Video Player
    0x0028: "media",  # Basic Video Player
    0x000E: "bridge",  # Aggregator
}

# Fallback keyword heuristics on product name/label (lowercase).
DEVICE_TYPE_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    ("plug", ("plug", "outlet", "socket", "uttag")),
    ("lamp", ("bulb", "lamp", "light", "led", "e27", "e14", "gu10", "lampa")),
    ("switch", ("switch", "dimmer", "remote", "button", "knapp", "brytare")),
    ("lock", ("lock", "lås")),
    ("thermostat", ("thermostat", "trv", "radiator")),
    ("blind", ("blind", "shade", "curtain", "cover", "roller", "gardin")),
    ("air_purifier", ("purifier", "luftrenare")),
    ("fan", ("fan",)),
    ("sensor", ("sensor", "detector", "motion", "contact", "leak", "smoke")),
    ("bridge", ("bridge", "hub", "gateway")),
    ("media", ("speaker", "tv", "player")),
]
