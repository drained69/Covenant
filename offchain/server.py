#!/usr/bin/env python3
"""
Minimal API server that bridges the Covenant frontend to the Cleanverse Cooperate API.

Runs on port 3001. The Vite dev server proxies /api/* here.

Usage:
    python3 offchain/server.py
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from cleanverse_client import CleanverseClient, CleanverseError  # noqa: E402

CHAIN = os.environ.get("CLEANVERSE_CHAIN", "monad")


class Handler(BaseHTTPRequestHandler):
    client: CleanverseClient | None = None

    @classmethod
    def get_client(cls) -> CleanverseClient:
        if cls.client is None:
            cls.client = CleanverseClient.from_env()
        return cls.client

    def _send_json(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        if self.path == "/api/offers":
            self._handle_offers()
        else:
            self._send_json(404, {"ok": False, "message": "Not found"})

    def do_POST(self) -> None:
        if self.path == "/api/generate-apass":
            self._handle_generate_apass()
        elif self.path == "/api/query-apass":
            self._handle_query_apass()
        else:
            self._send_json(404, {"ok": False, "message": "Not found"})

    def _read_body(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(length)) if length else {}

    def _handle_generate_apass(self) -> None:
        body = self._read_body()
        wallet = body.get("wallet", "").strip()
        country = body.get("issuingCountry", "").strip().upper()

        if not wallet or not wallet.startswith("0x"):
            return self._send_json(400, {"ok": False, "message": "Missing or invalid wallet address."})

        # Map frontend document type to Cleanverse API id_type
        doc_type_map = {
            "passport": "PASSPORT",
            "national_id": "ID_CARD",
            "drivers_license": "DRIVERS_LICENSE",
        }
        id_type = doc_type_map.get(body.get("documentType", ""), "ID_CARD")

        try:
            client = self.get_client()
            resp = client.generate_apass(
                chain=CHAIN,
                wallet_address=wallet,
                country=country,
                full_name=body.get("fullName", ""),
                id_type=id_type,
                override=body.get("override", False),
            )
            if resp.ok:
                self._send_json(200, {"ok": True, "message": "A-Pass issued successfully.", "data": resp.data})
            else:
                self._send_json(200, {"ok": False, "message": resp.message or f"Cleanverse error: code {resp.code}", "code": resp.code})
        except CleanverseError as exc:
            self._send_json(502, {"ok": False, "message": str(exc)})
        except Exception as exc:
            self._send_json(500, {"ok": False, "message": f"Internal error: {exc}"})

    def _handle_offers(self) -> None:
        """Generate fresh signed offers by invoking sign_offer.js."""
        script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sign_offer.js")
        offers = []
        try:
            for side_flag, offer_id, label, side, max_units in [
                ([], "lender-100k-par", "Fixed-rate lend · 100k @ par", "lend", "100000000000"),
                (["--sell"], "borrower-25k-par", "Fixed-rate borrow · 25k @ par", "borrow", "25000000000"),
            ]:
                result = subprocess.run(
                    ["node", script, "--json"] + side_flag + ["--units", max_units, "--expiry", "7200"],
                    capture_output=True, text=True, timeout=15,
                    env={**os.environ},
                )
                if result.returncode != 0:
                    return self._send_json(500, {"ok": False, "message": f"sign_offer.js failed: {result.stderr[:300]}"})
                data = json.loads(result.stdout)
                offers.append({
                    "id": offer_id,
                    "label": label,
                    "side": side,
                    "rateBps": 0,
                    "maker": data["maker"],
                    "maxUnits": max_units,
                    "expiry": int(data["expiry"]),
                    "offer": data["offer"],
                    "notaryData": data["notaryData"],
                })
            self._send_json(200, {"ok": True, "offers": offers})
        except FileNotFoundError:
            self._send_json(500, {"ok": False, "message": "node not found. Install Node.js to sign offers."})
        except subprocess.TimeoutExpired:
            self._send_json(500, {"ok": False, "message": "sign_offer.js timed out."})
        except Exception as exc:
            self._send_json(500, {"ok": False, "message": f"Offer signing error: {exc}"})

    def _handle_query_apass(self) -> None:
        body = self._read_body()
        wallet = body.get("wallet", "").strip()

        if not wallet or not wallet.startswith("0x"):
            return self._send_json(400, {"ok": False, "message": "Missing or invalid wallet address."})

        try:
            client = self.get_client()
            resp = client.query_apass(chain=CHAIN, wallet_address=wallet)
            self._send_json(200, {"ok": resp.ok, "message": resp.message, "data": resp.data, "code": resp.code})
        except CleanverseError as exc:
            self._send_json(502, {"ok": False, "message": str(exc)})

    def log_message(self, fmt: str, *args) -> None:
        print(f"[api] {fmt % args}")


def main() -> None:
    port = int(os.environ.get("API_PORT", "3001"))
    server = HTTPServer(("0.0.0.0", port), Handler)
    print(f"Covenant API server listening on http://localhost:{port}")
    print(f"  chain: {CHAIN}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        server.server_close()


if __name__ == "__main__":
    main()
