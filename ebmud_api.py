#!/usr/bin/env python3
import os
import csv
import json
import time
from flask import Flask, jsonify
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright

load_dotenv()

EMAIL = os.getenv("EBMUD_EMAIL")
PASSWORD = os.getenv("EBMUD_PASSWORD")
PORT = int(os.getenv("PORT", 8081))

CSV_URL = "https://ebmud.watersmart.com/index.php/accountPreferences/download"

CACHE_FILE = "/tmp/ebmud_cache.json"
CACHE_TTL = 23 * 3600  # once per day, politely

app = Flask(__name__)

def cached():
    if not os.path.exists(CACHE_FILE):
        return None
    if time.time() - os.path.getmtime(CACHE_FILE) > CACHE_TTL:
        return None
    with open(CACHE_FILE) as f:
        return json.load(f)

def save_cache(data):
    with open(CACHE_FILE, "w") as f:
        json.dump(data, f)

def fetch_csv_via_browser():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()

        # 1) Go to CSV URL — this will trigger SAML login
        page.goto(CSV_URL, wait_until="networkidle")

        # 2) Login form (CAS)
        page.fill('input[name="username"]', EMAIL)
        page.fill('input[name="password"]', PASSWORD)
        page.click('button[type="submit"]')

        # 3) Wait for redirect back to WaterSmart
        page.wait_for_url("**watersmart.com/**", timeout=60000)

        # 4) Trigger CSV download again (now authenticated)
        with page.expect_download() as download_info:
            page.goto(CSV_URL)

        download = download_info.value
        csv_path = download.path()

        browser.close()

    # 5) Parse CSV
    with open(csv_path, newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    if not rows:
        raise RuntimeError("CSV contained no rows")

    latest = rows[-1]

    usage = (
        latest.get("Usage")
        or latest.get("Usage (Gallons)")
        or latest.get("Gallons")
    )

    if usage is None:
        raise RuntimeError(f"Unknown CSV schema: {latest.keys()}")

    return {
        "source": "ebmud_watersmart_playwright",
        "latest_usage_gallons": float(usage),
        "rows": len(rows),
        "timestamp": int(time.time())
    }

@app.route("/health")
def health():
    return {"status": "ok"}

@app.route("/water/daily")
def daily_water():
    data = cached()
    if data:
        return jsonify(data | {"cached": True})

    try:
        data = fetch_csv_via_browser()
        save_cache(data)
        return jsonify(data | {"cached": False})
    except Exception as e:
        return jsonify({
            "error": str(e),
            "cached": False
        }), 500

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=PORT)