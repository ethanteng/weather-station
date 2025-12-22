#!/usr/bin/env python3
import os
import json
import time
import requests
from flask import Flask, jsonify
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()

EMAIL = os.getenv("EBMUD_EMAIL")
PASSWORD = os.getenv("EBMUD_PASSWORD")
PORT = int(os.getenv("PORT", 8081))

LOGIN_URL = "https://www.ebmud.com/user/login"
USAGE_URL = "https://www.ebmud.com/my-account/water-usage"

CACHE_FILE = "/tmp/ebmud_cache.json"
CACHE_TTL = 23 * 3600  # once per day, not suspicious

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

def scrape_ebmud():
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (local water usage service)"
    })

    # Fetch login page for CSRF
    r = session.get(LOGIN_URL)
    r.raise_for_status()

    soup = BeautifulSoup(r.text, "html.parser")
    csrf = soup.find("input", {"name": "csrf_token"})
    if not csrf:
        raise RuntimeError("CSRF token not found")

    payload = {
        "email": EMAIL,
        "password": PASSWORD,
        "csrf_token": csrf["value"],
    }

    r = session.post(LOGIN_URL, data=payload)
    r.raise_for_status()

    if "logout" not in r.text.lower():
        raise RuntimeError("Login failed")

    # Fetch usage page
    r = session.get(USAGE_URL)
    r.raise_for_status()

    soup = BeautifulSoup(r.text, "html.parser")

    usage_el = soup.select_one(".daily-usage .value")
    if not usage_el:
        raise RuntimeError("Usage element not found")

    gallons = float(
        usage_el.text.lower().replace("gallons", "").strip()
    )

    return {
        "source": "ebmud",
        "daily_gallons": gallons,
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
        data = scrape_ebmud()
        save_cache(data)
        return jsonify(data | {"cached": False})
    except Exception as e:
        return jsonify({
            "error": str(e),
            "cached": False
        }), 500

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=PORT)
