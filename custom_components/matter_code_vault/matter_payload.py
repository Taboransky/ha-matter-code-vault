"""Matter onboarding payload parsing.

Pure Python, no Home Assistant imports, so it can be unit tested on its own.

Implements the parts of the Matter Core Specification (section 5.1) needed here:
- QR code payload ("MT:" + Base38) decoding
- 11/21 digit manual pairing code generation and parsing
- Verhoeff check digit
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

QR_PREFIX = "MT:"
BASE38_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-."

# Bit widths of the packed QR payload, least significant bits first.
_QR_FIELDS = (
    ("version", 3),
    ("vendor_id", 16),
    ("product_id", 16),
    ("commissioning_flow", 2),
    ("discovery_capabilities", 8),
    ("discriminator", 12),
    ("passcode", 27),
    ("padding", 4),
)
_QR_PACKED_BYTES = 11  # 88 bits

INVALID_PASSCODES = frozenset(
    {
        0,
        11111111,
        22222222,
        33333333,
        44444444,
        55555555,
        66666666,
        77777777,
        88888888,
        99999999,
        12345678,
        87654321,
    }
)
MAX_PASSCODE = 99999998


class PayloadError(ValueError):
    """Raised when a code cannot be parsed or is invalid."""


@dataclass
class SetupPayload:
    """Decoded Matter onboarding information."""

    passcode: int
    manual_code: str
    # Full 12-bit discriminator when known (QR), otherwise None.
    discriminator: int | None
    # Upper 4 bits of the discriminator, always known.
    short_discriminator: int
    vendor_id: int | None = None
    product_id: int | None = None
    commissioning_flow: int | None = None
    discovery_capabilities: int | None = None
    qr_payload: str | None = None

    def as_dict(self) -> dict:
        """Return a JSON-serialisable dict."""
        return asdict(self)


# --- Verhoeff -------------------------------------------------------------

_VERHOEFF_D = (
    (0, 1, 2, 3, 4, 5, 6, 7, 8, 9),
    (1, 2, 3, 4, 0, 6, 7, 8, 9, 5),
    (2, 3, 4, 0, 1, 7, 8, 9, 5, 6),
    (3, 4, 0, 1, 2, 8, 9, 5, 6, 7),
    (4, 0, 1, 2, 3, 9, 5, 6, 7, 8),
    (5, 9, 8, 7, 6, 0, 4, 3, 2, 1),
    (6, 5, 9, 8, 7, 1, 0, 4, 3, 2),
    (7, 6, 5, 9, 8, 2, 1, 0, 4, 3),
    (8, 7, 6, 5, 9, 3, 2, 1, 0, 4),
    (9, 8, 7, 6, 5, 4, 3, 2, 1, 0),
)
_VERHOEFF_P = (
    (0, 1, 2, 3, 4, 5, 6, 7, 8, 9),
    (1, 5, 7, 6, 2, 8, 3, 0, 9, 4),
    (5, 8, 0, 3, 7, 9, 6, 1, 4, 2),
    (8, 9, 1, 6, 0, 4, 3, 5, 2, 7),
    (9, 4, 5, 3, 1, 2, 6, 8, 7, 0),
    (4, 2, 8, 6, 5, 7, 3, 9, 0, 1),
    (2, 7, 9, 3, 8, 0, 6, 4, 1, 5),
    (7, 0, 4, 6, 9, 1, 3, 2, 5, 8),
)
_VERHOEFF_INV = (0, 4, 3, 2, 1, 5, 6, 7, 8, 9)


def verhoeff_check_digit(digits: str) -> str:
    """Return the Verhoeff check digit for a string of digits."""
    c = 0
    for i, ch in enumerate(reversed(digits)):
        c = _VERHOEFF_D[c][_VERHOEFF_P[(i + 1) % 8][int(ch)]]
    return str(_VERHOEFF_INV[c])


def verhoeff_valid(digits: str) -> bool:
    """Return True if the last digit is a valid Verhoeff check digit."""
    return verhoeff_check_digit(digits[:-1]) == digits[-1]


# --- Base38 / QR ----------------------------------------------------------


def base38_decode(text: str) -> bytes:
    """Decode Matter Base38 text into bytes."""
    out = bytearray()
    pos = 0
    while pos < len(text):
        remaining = len(text) - pos
        if remaining >= 5:
            chunk_len, byte_len = 5, 3
        elif remaining == 4:
            chunk_len, byte_len = 4, 2
        elif remaining == 2:
            chunk_len, byte_len = 2, 1
        else:
            raise PayloadError("Invalid Base38 length")
        value = 0
        for ch in reversed(text[pos : pos + chunk_len]):
            idx = BASE38_ALPHABET.find(ch)
            if idx < 0:
                raise PayloadError(f"Invalid Base38 character {ch!r}")
            value = value * 38 + idx
        if value >= 1 << (8 * byte_len):
            raise PayloadError("Invalid Base38 chunk")
        for _ in range(byte_len):
            out.append(value & 0xFF)
            value >>= 8
        pos += chunk_len
    return bytes(out)


def _validate_passcode(passcode: int) -> None:
    if passcode < 1 or passcode > MAX_PASSCODE or passcode in INVALID_PASSCODES:
        raise PayloadError("Invalid setup passcode")


def parse_qr_payload(text: str) -> SetupPayload:
    """Parse a Matter QR code string, e.g. 'MT:Y.K9042C00KA0648G00'."""
    text = text.strip()
    if not text.upper().startswith(QR_PREFIX):
        raise PayloadError("Not a Matter QR code (missing 'MT:' prefix)")
    body = text[len(QR_PREFIX) :]
    # A QR code may hold several payloads separated by '*'; use the first.
    body = body.split("*", 1)[0]
    data = base38_decode(body)
    if len(data) < _QR_PACKED_BYTES:
        raise PayloadError("Matter QR payload too short")

    bits = int.from_bytes(data[:_QR_PACKED_BYTES], "little")
    fields: dict[str, int] = {}
    for name, width in _QR_FIELDS:
        fields[name] = bits & ((1 << width) - 1)
        bits >>= width

    if fields["version"] != 0:
        raise PayloadError(f"Unsupported payload version {fields['version']}")
    _validate_passcode(fields["passcode"])

    short_disc = fields["discriminator"] >> 8
    return SetupPayload(
        passcode=fields["passcode"],
        manual_code=generate_manual_code(fields["passcode"], short_disc),
        discriminator=fields["discriminator"],
        short_discriminator=short_disc,
        vendor_id=fields["vendor_id"],
        product_id=fields["product_id"],
        commissioning_flow=fields["commissioning_flow"],
        discovery_capabilities=fields["discovery_capabilities"],
        qr_payload=QR_PREFIX + text[len(QR_PREFIX) :],
    )


# --- Manual pairing code --------------------------------------------------


def generate_manual_code(
    passcode: int,
    short_discriminator: int,
    vendor_id: int | None = None,
    product_id: int | None = None,
) -> str:
    """Generate an 11-digit (or 21-digit with VID/PID) manual pairing code."""
    long_form = vendor_id is not None and product_id is not None
    chunk1 = (short_discriminator >> 2) | (int(long_form) << 2)
    chunk2 = ((short_discriminator & 0x3) << 14) | (passcode & 0x3FFF)
    chunk3 = passcode >> 14
    digits = f"{chunk1:01d}{chunk2:05d}{chunk3:04d}"
    if long_form:
        digits += f"{vendor_id:05d}{product_id:05d}"
    return digits + verhoeff_check_digit(digits)


def normalize_manual_code(text: str) -> str:
    """Strip separators from a typed manual code."""
    return "".join(ch for ch in text if ch.isdigit())


def parse_manual_code(text: str) -> SetupPayload:
    """Parse and validate a typed manual pairing code like '1206-433-0908'."""
    digits = normalize_manual_code(text)
    if len(digits) not in (11, 21):
        raise PayloadError("Manual code must have 11 or 21 digits")
    if not verhoeff_valid(digits):
        raise PayloadError("Check digit does not match - please re-check the code")

    first = int(digits[0])
    if first > 7:
        raise PayloadError("Invalid manual code")
    long_form = bool(first & 0x4)
    if long_form != (len(digits) == 21):
        raise PayloadError("Manual code length does not match its format flag")

    chunk2 = int(digits[1:6])
    chunk3 = int(digits[6:10])
    if chunk2 > 0xFFFF:
        raise PayloadError("Invalid manual code")
    short_disc = ((first & 0x3) << 2) | (chunk2 >> 14)
    passcode = (chunk3 << 14) | (chunk2 & 0x3FFF)
    _validate_passcode(passcode)

    vendor_id = product_id = None
    if long_form:
        vendor_id = int(digits[10:15])
        product_id = int(digits[15:20])

    return SetupPayload(
        passcode=passcode,
        manual_code=digits,
        discriminator=None,
        short_discriminator=short_disc,
        vendor_id=vendor_id,
        product_id=product_id,
    )


def parse_any(text: str) -> SetupPayload:
    """Parse either a QR string or a manual code."""
    if text.strip().upper().startswith(QR_PREFIX):
        return parse_qr_payload(text)
    return parse_manual_code(text)


def format_manual_code(digits: str) -> str:
    """Format as XXXX-XXX-XXXX (11 digits) or XXXX-XXX-XXXX-XXXXX-XXXXX."""
    if len(digits) == 11:
        return f"{digits[0:4]}-{digits[4:7]}-{digits[7:11]}"
    if len(digits) == 21:
        return f"{digits[0:4]}-{digits[4:7]}-{digits[7:11]}-{digits[11:16]}-{digits[16:21]}"
    return digits
