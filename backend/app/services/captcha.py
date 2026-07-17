"""CAPTCHA service — SVG-based verification codes."""

import random
import time
import hashlib
import string

# ─── In-memory store ───────────────────────────────────────
# token -> { text, expires_at }
_store: dict[str, dict] = {}

# ─── Cleanup ────────────────────────────────────────────────
_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # No 0/O/1/I to avoid confusion


def _cleanup():
    """Remove expired entries."""
    now = time.time()
    expired = [k for k, v in _store.items() if v["expires_at"] < now]
    for k in expired:
        _store.pop(k, None)


def generate() -> tuple[str, str]:
    """Generate a CAPTCHA.

    Returns (token, svg_content).
    The token maps to the expected text in the in-memory store (5 min TTL).
    """
    _cleanup()
    text = "".join(random.choices(_CHARS, k=4))
    token = hashlib.sha256(
        f"{text}_{time.time()}_{random.random()}".encode()
    ).hexdigest()[:16]
    _store[token] = {"text": text, "expires_at": time.time() + 300}
    return token, _render_svg(text)


def verify(token: str, user_input: str) -> bool:
    """Verify a CAPTCHA token + user input (one-time use)."""
    entry = _store.pop(token, None)
    if not entry:
        return False
    if time.time() > entry["expires_at"]:
        return False
    return entry["text"].upper() == user_input.strip().upper()


# ─── SVG rendering ─────────────────────────────────────────

def _rand_color(min_v: int = 40, max_v: int = 200) -> str:
    return f"rgb({random.randint(min_v,max_v)},{random.randint(min_v,max_v)},{random.randint(min_v,max_v)})"


def _render_svg(text: str) -> str:
    """Render CAPTCHA text as a noisy SVG image."""
    w, h = 160, 56
    chars = list(text)
    n = len(chars)

    # Build paths
    lines: list[str] = []
    # Background
    bg_color = _rand_color(230, 250)
    lines.append(
        f'<rect width="{w}" height="{h}" rx="8" fill="{bg_color}" />'
    )

    # Noise lines (3-5 random lines crossing the image)
    for _ in range(random.randint(3, 5)):
        x1 = random.randint(0, w // 2)
        y1 = random.randint(0, h)
        x2 = random.randint(w // 2, w)
        y2 = random.randint(0, h)
        color = _rand_color(100, 200)
        lines.append(
            f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" '
            f'stroke="{color}" stroke-width="{random.uniform(1, 2.5):.1f}" '
            f'stroke-linecap="round" opacity="0.5" />'
        )

    # Noise dots (20-40 small dots)
    for _ in range(random.randint(20, 40)):
        cx = random.randint(0, w)
        cy = random.randint(0, h)
        r = random.randint(1, 3)
        color = _rand_color(120, 210)
        lines.append(
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{color}" opacity="0.4" />'
        )

    # Characters with random transforms
    spacing = w // (n + 1)
    start_x = spacing
    for i, ch in enumerate(chars):
        x = start_x + i * spacing + random.randint(-4, 4)
        y = random.randint(32, 42)
        angle = random.uniform(-25, 25)
        color = _rand_color(20, 80)
        font_size = random.randint(28, 36)
        lines.append(
            f'<text x="{x}" y="{y}" '
            f'transform="rotate({angle:.0f},{x},{y})" '
            f'font-size="{font_size}" '
            f'font-family="monospace, sans-serif" '
            f'font-weight="bold" '
            f'fill="{color}" '
            f'text-anchor="middle" '
            f'dominant-baseline="central">'
            f'{ch}</text>'
        )

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
        f'{"".join(lines)}'
        f'</svg>'
    )
    return svg
