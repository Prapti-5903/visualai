"""
VisualAI — Flask Backend (Pollinations.ai — free, no API key)
"""
from flask import Flask, request, jsonify
from flask_cors import CORS
import os, time, hashlib, logging, requests, base64, urllib.parse
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

app = Flask(__name__)

# ✅ Allow all origins during development
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=False)

# ✅ Pollinations.ai — completely free, no API key, powered by FLUX
POLLINATIONS_URL = "https://image.pollinations.ai/prompt/{prompt}?width=768&height=768&model=flux&nologo=true&enhance=false&seed={seed}"

_cache = {}

def _hash(t):
    return hashlib.md5(t.strip().lower().encode()).hexdigest()

def _enhance(p):
    p = p.strip()
    if not p:
        raise ValueError("Prompt cannot be empty.")
    return p + ", highly detailed, cinematic lighting, ultra realistic"

def _seed(cache_key):
    """Deterministic seed from cache key so same prompt = same image."""
    return int(cache_key[:8], 16) % 2147483647

@app.before_request
def handle_options():
    if request.method == "OPTIONS":
        response = app.make_default_options_response()
        response.headers["Access-Control-Allow-Origin"]  = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        return response

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "provider": "pollinations.ai", "model": "flux"})

@app.route("/generate", methods=["POST", "OPTIONS"])
def generate():
    data       = request.get_json(silent=True) or {}
    raw_prompt = data.get("prompt", "").strip()
    source     = data.get("source", "text")

    if source not in {"text", "speech", "sign"}:
        source = "text"

    if not raw_prompt:
        return jsonify({"error": "Prompt is required."}), 400

    try:
        enhanced  = _enhance(raw_prompt)
        cache_key = _hash(enhanced)

        if cache_key in _cache:
            return jsonify({
                "image_url":          _cache[cache_key],
                "prompt_used":        enhanced,
                "raw_prompt":         raw_prompt,
                "source":             source,
                "cached":             True,
                "generation_time_ms": 0
            })

        logger.info("Generating [%s]: %s...", source, raw_prompt[:60])
        t0 = time.time()

        encoded_prompt = urllib.parse.quote(enhanced)
        seed           = _seed(cache_key)
        url            = POLLINATIONS_URL.format(prompt=encoded_prompt, seed=seed)

        logger.info("Requesting: %s", url[:120])

        resp = requests.get(url, timeout=120, headers={"User-Agent": "VisualAI/1.0"})

        if resp.status_code != 200:
            err = f"Image generation failed (HTTP {resp.status_code}). Try again."
            logger.error("Pollinations Error %d: %s", resp.status_code, resp.text[:200])
            return jsonify({"error": err}), 502

        if not resp.content:
            return jsonify({"error": "Empty image response. Try again."}), 500

        content_type = resp.headers.get("Content-Type", "image/jpeg").split(";")[0].strip()
        image_url    = f"data:{content_type};base64," + base64.b64encode(resp.content).decode()
        elapsed      = int((time.time() - t0) * 1000)

        _cache[cache_key] = image_url
        logger.info("✓ Generated in %dms", elapsed)

        return jsonify({
            "image_url":          image_url,
            "prompt_used":        enhanced,
            "raw_prompt":         raw_prompt,
            "source":             source,
            "cached":             False,
            "generation_time_ms": elapsed
        })

    except requests.Timeout:
        return jsonify({"error": "Request timed out. Try again in a few seconds."}), 504

    except Exception as e:
        logger.error("Unexpected error: %s", str(e))
        return jsonify({"error": str(e)}), 500

@app.route("/cache/clear", methods=["POST"])
def clear_cache():
    _cache.clear()
    return jsonify({"message": "Cache cleared."})

if __name__ == "__main__":
    logger.info("🚀 Starting VisualAI backend on http://localhost:5001")
    logger.info("🎨 Image provider: Pollinations.ai (FLUX model) — no API key required")
    app.run(debug=True, port=5001, host="0.0.0.0")