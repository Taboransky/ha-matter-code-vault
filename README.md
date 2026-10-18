# Matter Code Vault

Keep the QR codes and pairing codes of your Matter devices in Home Assistant, so you can throw away the boxes and paper inserts.

You need these codes again after a factory reset, which is usually long after the box is gone.

## Features

- **Matter Codes** sidebar page (admins only), with a list showing for each device:
  - its QR code
  - its 11-digit code
  - its name, type, room and brand
- **Search** by name, room, brand, notes or code digits. **Filter** by device type and room.
- **Scan with your phone**: tap *Scan QR*.
  - In the HA Companion app (Android/iOS), the app's own camera scanner opens, the same one HA uses to add Matter devices.
  - In a browser over HTTPS, a live camera view opens in the page.
  - Otherwise, take a photo, or pick one with *From image*. The code is read on the device.
- **Automatic product lookup**: the official Matter certification database (CSA DCL) fills in the brand, product and type, e.g. *IKEA of Sweden · KAJPLATS E27 WS globe 470lm · Lamp*.
- **Type a code** when the label has only the number. The check digit catches typos.
- **Link to paired devices**: shows *Paired as …* and suggests likely matches from HA's Matter integration.
- The QR code is re-drawn from the stored code text, so any Matter app can scan it straight off your screen.
- Data is stored in `.storage/matter_code_vault` and is included in Home Assistant backups.

### QR code vs. number code

Every Matter controller accepts either one for pairing. The QR code also contains the vendor and product ID, which makes the automatic lookup possible. Codes added from the number alone are shown without a QR code, because the full QR code can't be rebuilt from the number.

## Installation (HACS)

1. HACS → ⋮ → *Custom repositories* → add `https://github.com/Taboransky/ha-matter-code-vault`, category **Integration**.
2. Install **Matter Code Vault** and restart Home Assistant.
3. *Settings → Devices & services → Add integration → Matter Code Vault*.
4. The **Matter Codes** page now appears in the sidebar.

### Manual installation

Copy `custom_components/matter_code_vault` into your `config/custom_components/` folder and restart.

## Privacy and security

- The pairing codes are secrets: anyone on your network with a code could pair the device while it's in pairing mode. So the page and its API are limited to admin users.
- The only network request leaves your home for the DCL product lookup. It sends just the vendor and product ID to `on.dcl.csa-iot.org`, never the pairing code.

## Development

```bash
pip install -r requirements_test.txt   # needs Python 3.13
pytest
```

`pytest tests/test_matter_payload.py --noconftest` runs the code-parsing tests on any Python 3.10+ without Home Assistant installed.

## License

MIT, see [LICENSE](LICENSE). Bundled QR libraries keep their own licenses, see `custom_components/matter_code_vault/frontend/lib/THIRD_PARTY_NOTICES.md`.
