"""Tests for matter_payload (no Home Assistant needed)."""

import importlib.util
import sys
from pathlib import Path

import pytest

# Load the module directly so the package __init__ (which imports HA) is skipped.
_PATH = (
    Path(__file__).parent.parent
    / "custom_components"
    / "matter_code_vault"
    / "matter_payload.py"
)
_spec = importlib.util.spec_from_file_location("matter_payload", _PATH)
mp = importlib.util.module_from_spec(_spec)
sys.modules["matter_payload"] = mp
_spec.loader.exec_module(mp)

# Reference vector from the Matter SDK (connectedhomeip) test suite.
REF_QR = "MT:Y.K9042C00KA0648G00"
REF_MANUAL = "34970112332"


def test_qr_reference_vector():
    p = mp.parse_qr_payload(REF_QR)
    assert p.vendor_id == 0xFFF1
    assert p.product_id == 0x8000
    assert p.discriminator == 3840
    assert p.short_discriminator == 15
    assert p.passcode == 20202021
    assert p.commissioning_flow == 0
    assert p.manual_code == REF_MANUAL
    assert p.qr_payload == REF_QR


def test_manual_reference_vector():
    p = mp.parse_manual_code("3497-011-2332")
    assert p.passcode == 20202021
    assert p.short_discriminator == 15
    assert p.discriminator is None
    assert p.vendor_id is None
    assert p.manual_code == REF_MANUAL


def test_manual_round_trip():
    code = mp.generate_manual_code(12345679, 7)
    p = mp.parse_manual_code(code)
    assert p.passcode == 12345679
    assert p.short_discriminator == 7


def test_long_manual_code_round_trip():
    code = mp.generate_manual_code(20202021, 15, 0xFFF1, 0x8000)
    assert len(code) == 21
    p = mp.parse_manual_code(code)
    assert (p.vendor_id, p.product_id) == (0xFFF1, 0x8000)
    assert p.passcode == 20202021


def test_bad_check_digit():
    with pytest.raises(mp.PayloadError):
        mp.parse_manual_code("34970112333")


def test_wrong_length():
    with pytest.raises(mp.PayloadError):
        mp.parse_manual_code("1234")


def test_invalid_passcode_rejected():
    code = mp.generate_manual_code(12345678, 0)
    with pytest.raises(mp.PayloadError):
        mp.parse_manual_code(code)


def test_not_a_matter_qr():
    with pytest.raises(mp.PayloadError):
        mp.parse_qr_payload("https://example.com")


def test_bad_base38():
    with pytest.raises(mp.PayloadError):
        mp.parse_qr_payload("MT:abc!")


def test_parse_any_dispatch():
    assert mp.parse_any(REF_QR).vendor_id == 0xFFF1
    assert mp.parse_any(" 3497 011 2332 ").passcode == 20202021


def test_format_manual_code():
    assert mp.format_manual_code(REF_MANUAL) == "3497-011-2332"
