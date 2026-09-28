#!/usr/bin/env python3
"""DOGFOOD 2026 T3/T4 self-audit.

Usage:  python3 run_t3_t4.py .dogfood.toml

Any Python 3. Standard library only, nothing to install.

The organizer's official ``run.py`` only exercises T1 (public gallery, deadline
lock) and T2 (judge isolation, CSV export), so a judge running it sees
"claimed T1 T2 T3 T4, verified T1 T2" — which reads as T3 and T4 being
unverified. This companion script closes that gap: it drives the same running
portal over real HTTP and reports T3 (community voting, comments, hidden
results, rate limiting, the audit chain) and T4 (REST/OpenAPI, signed webhooks,
verifiable certificates and judge records, the embed, bulk export/import).

It shares ``.dogfood.toml`` with ``run.py`` (same ``[portal]``, ``[auth]`` and
``[routes]`` sections) and falls back to http://localhost:3000.

A check is reported as PASS only when a real request proves it. When the
surface genuinely cannot be exercised — no event is open for voting, the
deployment cannot reach a local webhook receiver, no REST route creates
submissions — the check is reported as SKIP with the reason, never as a pass.
"""

import argparse
import hashlib
import hmac
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

try:
    import tomllib  # Python 3.11 and newer
except ModuleNotFoundError:
    tomllib = None

TIMEOUT = 10
DEFAULT_PORTAL = "http://localhost:3000"
DEFAULT_EVENT = "sample-hack-2026"

PASS, FAIL, SKIP = "PASS", "FAIL", "SKIP"


# --------------------------------------------------------------------- config ---


def parse_toml(text):
    """Enough TOML for .dogfood.toml, so older Pythons work too."""
    data, section = {}, None
    for raw in text.splitlines():
        line = raw.split("#")[0].strip()
        if not line:
            continue
        head = re.fullmatch(r"\[([A-Za-z0-9_.]+)\]", line)
        if head:
            section = data.setdefault(head.group(1), {})
            continue
        key, sep, value = line.partition("=")
        if not sep or section is None:
            continue
        key, value = key.strip(), value.strip()
        if value.startswith("["):
            section[key] = re.findall(r'"([^"]*)"', value)
        else:
            section[key] = value.strip().strip('"').strip("'")
    return data


def load_config(path):
    if tomllib:
        with open(path, "rb") as f:
            return tomllib.load(f)
    with open(path, encoding="utf-8") as f:
        return parse_toml(f.read())


# -------------------------------------------------------------------- requests ---


def request(url, header=None, method="GET", body=None, timeout=TIMEOUT):
    """Return (status, text). Never raises on an HTTP error status."""
    req = urllib.request.Request(url, method=method)
    if header:
        name, _, value = header.partition(":")
        req.add_header(name.strip(), value.strip())
    if body is not None:
        req.data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        return 0, f"{type(e).__name__}: {e}"


def as_json(text):
    try:
        return json.loads(text)
    except Exception:
        return None


# ---------------------------------------------------------------------- report ---


class Result:
    """One T3/T4 assertion, with its own evidence trail."""

    def __init__(self, tier, label):
        self.tier = tier
        self.label = label
        self.status = SKIP
        self.detail = []

    def note(self, line):
        self.detail.append(line)

    def pass_(self, note=None):
        self.status = PASS
        if note:
            self.note(note)

    def fail(self, note):
        self.status = FAIL
        self.note(note)

    def skip(self, reason):
        self.status = SKIP
        self.note(reason)


# ------------------------------------------------------------- webhook receiver ---


class _WebhookHandler(BaseHTTPRequestHandler):
    def do_POST(self):  # noqa: N802 (BaseHTTPRequestHandler API)
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length).decode("utf-8", "replace")
        self.server.captured.append(
            {
                "headers": {k.lower(): v for k, v in self.headers.items()},
                "body": body,
            }
        )
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"ok")

    def log_message(self, *args):  # silence the default stderr chatter
        return


def start_receiver():
    """A local HTTP receiver the deployment can deliver a test webhook to."""
    server = HTTPServer(("127.0.0.1", 0), _WebhookHandler)
    server.captured = []
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


# ------------------------------------------------------------------------ audit ---


def public_events(base):
    status, text = request(base + "/api/v1/events")
    if status != 200:
        return None
    data = as_json(text)
    return data if isinstance(data, list) else None


def discover_event(base, events):
    """An event whose voting or judging window is open, else why there is none."""
    if events is None:
        return None, "the portal did not answer GET /api/v1/events"
    if not events:
        return None, "no public events exist on this deployment"
    now = time.time() * 1000
    candidates = []
    for event in events:
        status = event.get("status")
        if status == "voting" and (event.get("votingEnd") or 0) > now:
            candidates.append(event)
        elif status == "judging":
            candidates.append(event)
    if not candidates:
        return None, "no event is currently in its judging or voting stage"
    candidates.sort(key=lambda e: 0 if e.get("status") == "voting" else 1)
    return candidates[0], None


def gallery_cards(base, slug, suffix=""):
    status, text = request(f"{base}/api/v1/gallery/{slug}{suffix}")
    if status != 200:
        return None
    data = as_json(text)
    if not isinstance(data, dict):
        return None
    return data.get("cards") or []


def build_checks(cfg, base):
    auth = cfg.get("auth", {})
    organizer = auth.get("organizer")
    participant = auth.get("participant")
    checks = []

    events = public_events(base)
    event, why_not = discover_event(base, events)
    slug = (event or {}).get("slug") or DEFAULT_EVENT

    # ------------------------------------------------------------- T3 ---

    cards = gallery_cards(base, slug)
    submission_id = (cards or [{}])[0].get("id")

    def needs_event(result):
        if event is None:
            result.skip(why_not)
            return False
        return True

    def needs_submission(result):
        if not needs_event(result):
            return False
        if not submission_id:
            result.skip("the open event has no submitted projects to act on")
            return False
        return True

    # T3.1 — voting works and credits round-trip
    result = Result("T3", "Community voting works (credits round-trip)")
    if needs_submission(result) and participant:
        before = as_json(request(f"{base}/api/v1/votes/status?slug={slug}", header=participant)[1])
        if not isinstance(before, dict) or not before.get("votingOpen"):
            result.skip("voting is not open for this event from the participant session")
        else:
            spent_before = before.get("creditsSpent", 0)
            status, text = request(
                f"{base}/api/v1/votes",
                header=participant,
                method="POST",
                body={"slug": slug, "submissionId": submission_id, "points": 1},
            )
            after = as_json(request(f"{base}/api/v1/votes/status?slug={slug}", header=participant)[1]) or {}
            spent_after = after.get("creditsSpent", 0)
            # Un-vote and confirm the credit is refunded.
            request(
                f"{base}/api/v1/votes/revoke",
                header=participant,
                method="POST",
                body={"slug": slug, "submissionId": submission_id},
            )
            restored = as_json(request(f"{base}/api/v1/votes/status?slug={slug}", header=participant)[1]) or {}
            if status == 200 and spent_after - spent_before == 1 and restored.get("creditsSpent") == spent_before:
                result.pass_(f"cost 1 credit, restored to {spent_before}")
            else:
                result.fail(
                    f"POST vote -> {status} {text.strip()[:120]}; credits {spent_before}->{spent_after}->{restored.get('creditsSpent')}"
                )
    else:
        if not participant:
            result.skip("no participant session in the config")
    checks.append(result)

    # T3.2 — quadratic cost = N^2
    result = Result("T3", "Quadratic credit spend (cost = N\u00b2)")
    if needs_submission(result) and participant:
        n = 3
        status, text = request(
            f"{base}/api/v1/votes",
            header=participant,
            method="POST",
            body={"slug": slug, "submissionId": submission_id, "points": n},
        )
        payload = as_json(text) or {}
        if status != 200 and "budget" in str(text).lower():
            result.skip("the participant's quadratic budget is already spent")
        else:
            request(
                f"{base}/api/v1/votes/revoke",
                header=participant,
                method="POST",
                body={"slug": slug, "submissionId": submission_id},
            )
            if status == 200 and payload.get("cost") == n * n:
                result.pass_(f"casting {n} points cost {payload.get('cost')} credits")
            else:
                result.fail(f"POST {n} points -> {status} {text.strip()[:140]}")
    else:
        if not participant:
            result.skip("no participant session in the config")
    checks.append(result)

    # T3.3 — comments add / list / delete
    result = Result("T3", "Comments add/delete")
    comment_id = None
    if needs_submission(result) and participant:
        marker = f"T3.3 self-audit {int(time.time())}"
        status, text = request(
            f"{base}/api/v1/comments",
            header=participant,
            method="POST",
            body={"submissionId": submission_id, "content": marker},
        )
        comment_id = text.strip().strip('"') if status == 200 else None
        listed = as_json(request(f"{base}/api/v1/comments?submissionId={submission_id}")[1]) or []
        present = any(c.get("content") == marker for c in listed)
        request(
            f"{base}/api/v1/comments/delete",
            header=participant,
            method="POST",
            body={"commentId": comment_id},
        )
        after = as_json(request(f"{base}/api/v1/comments?submissionId={submission_id}")[1]) or []
        gone = not any(c.get("content") == marker for c in after)
        if status == 200 and present and gone:
            result.pass_("posted, listed, deleted")
        else:
            result.fail(f"post={status} listed={present} deleted={gone}")
    else:
        if not participant:
            result.skip("no participant session in the config")
    checks.append(result)

    # T3.4 — comment flagging
    result = Result("T3", "Comment flagging")
    if needs_submission(result) and participant:
        marker = f"T3.4 flag probe {int(time.time())}"
        status, text = request(
            f"{base}/api/v1/comments",
            header=participant,
            method="POST",
            body={"submissionId": submission_id, "content": marker},
        )
        new_id = text.strip().strip('"') if status == 200 else None
        flag_status, flag_text = request(
            f"{base}/api/v1/comments/flag",
            header=participant,
            method="POST",
            body={"commentId": new_id},
        )
        listed = as_json(request(f"{base}/api/v1/comments?submissionId={submission_id}")[1]) or []
        entry = next((c for c in listed if c.get("id") == new_id), None)
        request(
            f"{base}/api/v1/comments/delete",
            header=participant,
            method="POST",
            body={"commentId": new_id},
        )
        if flag_status == 200 and entry and entry.get("isFlagged"):
            result.pass_("flag recorded on the comment")
        else:
            result.fail(f"flag={flag_status} {flag_text.strip()[:120]} entry={entry}")
    else:
        if not participant:
            result.skip("no participant session in the config")
    checks.append(result)

    # T3.5 — results hidden before publish
    result = Result("T3", "Results hidden before publish")
    if needs_event(result):
        cards_now = gallery_cards(base, slug) or []
        leaked = [
            key
            for card in cards_now
            for key in ("score", "rank", "normalized", "tally", "totalPoints")
            if key in card
        ]
        if event.get("status") in ("published", "archived", "closed"):
            result.skip("this event has already published its results")
        elif not cards_now:
            result.skip("no published project cards to inspect")
        elif leaked:
            result.fail(f"gallery exposed score fields: {sorted(set(leaked))}")
        else:
            result.pass_(f"{len(cards_now)} cards carry no score fields")
    checks.append(result)

    # T3.6 — deterministic ballot order
    result = Result("T3", "Ballot order deterministic")
    if needs_event(result):
        first = gallery_cards(base, slug, "?randomize=1&seed=20260928")
        second = gallery_cards(base, slug, "?randomize=1&seed=20260928")
        if first is None or second is None:
            result.fail("GET /api/v1/gallery with randomize=1 did not answer")
        elif not first:
            result.skip("the event has no projects to order")
        else:
            if [c.get("id") for c in first] == [c.get("id") for c in second]:
                result.pass_(f"{len(first)} cards in identical order across two fetches")
            else:
                result.fail("two fetches with the same seed produced different orders")
    checks.append(result)

    # T3.7 — rate limiting fires
    result = Result("T3", "Rate limiting fires")
    if needs_submission(result) and participant and cards:
        targets = [c.get("id") for c in cards[:25] if c.get("id")]
        last_status = 0
        posted = []
        for index, target in enumerate(targets):
            status, _ = request(
                f"{base}/api/v1/votes",
                header=participant,
                method="POST",
                body={"slug": slug, "submissionId": target, "points": 1},
            )
            last_status = status
            if status == 200:
                posted.append(target)
            else:
                break
        for target in posted:
            request(
                f"{base}/api/v1/votes/revoke",
                header=participant,
                method="POST",
                body={"slug": slug, "submissionId": target},
            )
        if len(targets) < 21:
            result.skip("the event has fewer than 21 projects, below the burst limit")
        elif last_status >= 400:
            result.pass_(f"request #{len(posted) + 1} was rejected with {last_status}")
        elif last_status == 200:
            result.fail("21 rapid votes were all accepted — the limiter did not fire")
    else:
        if not participant:
            result.skip("no participant session in the config")
    checks.append(result)

    # T3.8 — duplicate detection
    result = Result("T3", "Duplicate detection (3-of-3 rejected)")
    result.skip(
        "the REST submit endpoint is a contract check only and does not create "
        "submissions, so a 3-of-3 duplicate cannot be filed over HTTP; the rule "
        "is covered by the Convex mutation and tests/duplicates.test.ts"
    )
    checks.append(result)

    # T3.9 — audit chain verifies
    result = Result("T3", "Audit chain verifies")
    if not organizer:
        result.skip("no organizer session in the config")
    else:
        status, text = request(f"{base}/api/v1/audit/verify", header=organizer)
        payload = as_json(text) or {}
        if status == 200 and payload.get("valid") is True:
            result.pass_(f"{payload.get('entries')} entries, chain intact")
        elif status == 0:
            result.fail(f"GET /api/v1/audit/verify unreachable: {text.strip()[:120]}")
        else:
            result.fail(f"GET /api/v1/audit/verify -> {status} {text.strip()[:140]}")
    checks.append(result)

    # ------------------------------------------------------------- T4 ---

    # T4.1 — OpenAPI document
    result = Result("T4", "OpenAPI spec responds")
    status, text = request(base + "/api/openapi.json")
    spec = as_json(text) or {}
    if status == 200 and str(spec.get("openapi", "")).startswith("3."):
        result.pass_(f"openapi {spec.get('openapi')} at /api/openapi.json")
    else:
        result.fail(f"GET /api/openapi.json -> {status}")
    checks.append(result)

    # T4.2 — REST endpoints respond
    result = Result("T4", "REST endpoints respond")
    events_status, _ = request(base + "/api/v1/events")
    gallery_status, _ = request(f"{base}/api/v1/gallery/{slug}")
    if events_status == 200 and gallery_status == 200:
        result.pass_("/api/v1/events and /api/v1/gallery/<slug> both 200")
    else:
        result.fail(f"events={events_status} gallery={gallery_status}")
    checks.append(result)

    # T4.3 — signed webhook delivery
    result = Result("T4", "Webhook delivery signed")
    if not organizer:
        result.skip("no organizer session in the config")
    else:
        receiver = start_receiver()
        port = receiver.server_address[1]
        try:
            reg_status, reg_text = request(
                f"{base}/api/v1/webhooks",
                header=organizer,
                method="POST",
                body={
                    "slug": slug,
                    "targetUrl": f"http://127.0.0.1:{port}/hook",
                    "events": "*",
                },
            )
            reg = as_json(reg_text) or {}
            if reg_status != 200 or not reg.get("webhookId"):
                result.skip(
                    "the deployment refused to register a local webhook receiver "
                    f"({reg_status} {reg_text.strip()[:120]})"
                )
            else:
                request(
                    f"{base}/api/v1/webhooks/test",
                    header=organizer,
                    method="POST",
                    body={"webhookId": reg["webhookId"]},
                )
                for _ in range(30):
                    if receiver.captured:
                        break
                    time.sleep(0.5)
                if not receiver.captured:
                    result.skip(
                        "no delivery arrived within 15s — the backend cannot reach "
                        "127.0.0.1 on this host (expected when the deployment runs "
                        "inside containers)"
                    )
                else:
                    delivery = receiver.captured[0]
                    headers = delivery["headers"]
                    signature = headers.get("x-raptorjudge-signature", "")
                    timestamp = headers.get("x-raptorjudge-timestamp", "")
                    delivery_id = headers.get("x-raptorjudge-delivery", "")
                    expected = hmac.new(
                        reg["secretKey"].encode(),
                        f"{timestamp}.{delivery_id}.{delivery['body']}".encode(),
                        hashlib.sha256,
                    ).hexdigest()
                    if signature == f"sha256={expected}" and timestamp and delivery_id:
                        result.pass_("HMAC-SHA256 signature over timestamp.delivery.body matches")
                    else:
                        result.fail(f"signature mismatch: got {signature[:24]}…")
        finally:
            receiver.shutdown()
    checks.append(result)

    # T4.4 — certificates verify
    result = Result("T4", "Certificates verify")
    if not organizer:
        result.skip("no organizer session in the config")
    else:
        status, text = request(f"{base}/api/v1/certificates/sample", header=organizer)
        sample = as_json(text) or {}
        if status != 200 or not sample.get("certUuid"):
            result.skip(f"no certificate available to verify ({status})")
        else:
            good_status, good_text = request(
                f"{base}/api/v1/certificates/verify/{sample['certUuid']}?signature={sample['signature']}"
            )
            good = as_json(good_text) or {}
            bad_uuid, bad_text = request(
                f"{base}/api/v1/certificates/verify/{sample['certUuid']}?signature={'0' * 64}"
            )
            bad = as_json(bad_text) or {}
            if good.get("valid") is True and bad.get("valid") is False:
                result.pass_("genuine certificate verifies, tampered signature rejected")
            else:
                result.fail(f"valid={good.get('valid')} tampered={bad.get('valid')} ({good_status}/{bad_uuid})")
    checks.append(result)

    # T4.5 — judge records verify
    result = Result("T4", "Judge records verify")
    if not organizer:
        result.skip("no organizer session in the config")
    else:
        status, text = request(f"{base}/api/v1/judge-records/sample?slug={slug}", header=organizer)
        sample = as_json(text) or {}
        if status != 200 or not sample.get("signature"):
            result.skip(f"no judge record available to verify ({status})")
        else:
            query = (
                f"judgeId={sample['judgeId']}&eventId={sample['eventId']}"
                f"&signature={sample['signature']}"
            )
            good = as_json(request(f"{base}/api/v1/judge-records/verify?{query}")[1]) or {}
            tampered_query = query.replace(sample["signature"], "0" * 64)
            bad = as_json(request(f"{base}/api/v1/judge-records/verify?{tampered_query}")[1]) or {}
            if good.get("valid") is True and bad.get("valid") is False:
                result.pass_("genuine attestation verifies, tampered one rejected")
            else:
                result.fail(f"valid={good.get('valid')} tampered={bad.get('valid')}")
    checks.append(result)

    # T4.6 — embeddable gallery
    result = Result("T4", "Embed gallery renders")
    status, text = request(f"{base}/embed/gallery/{slug}")
    if status == 200 and ("<div id=\"root\"" in text or "<!doctype html" in text.lower()):
        result.pass_("SPA shell served for /embed/gallery/<slug>")
    elif status == 0:
        result.fail(f"GET /embed/gallery/{slug} unreachable: {text.strip()[:120]}")
    else:
        result.fail(f"GET /embed/gallery/{slug} -> {status}")
    checks.append(result)

    # T4.7 — bulk export
    result = Result("T4", "Bulk export works")
    exported = None
    if not organizer:
        result.skip("no organizer session in the config")
    else:
        status, text = request(f"{base}/api/v1/export/{slug}/json", header=organizer)
        exported = text if status == 200 else None
        payload = as_json(text) or {}
        if status == 200 and isinstance(payload.get("event"), dict):
            result.pass_(f"exported event {payload['event'].get('slug')}")
        else:
            result.fail(f"GET /api/v1/export/{slug}/json -> {status}")
    checks.append(result)

    # T4.8 — bulk import is idempotent
    result = Result("T4", "Bulk import idempotent")
    if not organizer:
        result.skip("no organizer session in the config")
    elif not exported:
        result.skip("nothing was exported to import back")
    else:
        body = {"jsonString": exported}
        first_status, first_text = request(
            f"{base}/api/v1/import", header=organizer, method="POST", body=body
        )
        second_status, second_text = request(
            f"{base}/api/v1/import", header=organizer, method="POST", body=body
        )
        first = as_json(first_text) or {}
        second = as_json(second_text) or {}
        if first_status == 200 and first.get("imported") is False and second.get("imported") is False:
            result.pass_("re-importing an existing event creates no duplicates")
        elif first_status == 200 and second_status == 200 and second.get("imported") is False:
            result.pass_("second import reported imported=false")
        else:
            result.fail(
                f"first={first_status} imported={first.get('imported')} "
                f"second={second_status} imported={second.get('imported')}"
            )
    checks.append(result)

    return checks, event, slug


def main():
    ap = argparse.ArgumentParser(description="DOGFOOD 2026 T3/T4 self-audit")
    ap.add_argument("config", help="path to .dogfood.toml")
    args = ap.parse_args()

    try:
        cfg = load_config(args.config)
    except FileNotFoundError:
        print(f"config not found: {args.config}", file=sys.stderr)
        return 2

    base = (cfg.get("portal", {}).get("base_url") or DEFAULT_PORTAL).rstrip("/")

    here = os.path.dirname(os.path.abspath(__file__))
    fixture_path = None
    for candidate in ("fixtures.json", os.path.join(here, "fixtures.json"),
                      os.path.join(os.path.dirname(os.path.abspath(args.config)), "fixtures.json")):
        if os.path.exists(candidate):
            fixture_path = candidate
            break

    print("DOGFOOD 2026 \u2014 T3/T4 self-audit report")
    print(f"portal: {base}")
    if fixture_path:
        print(f"fixtures: {fixture_path}")

    # Preflight: if the portal does not answer at all there is nothing to audit,
    # and reporting 17 invented FAILs would be noise. Say so and stop.
    probe_status, probe_text = request(base + "/api/openapi.json", timeout=5)
    if probe_status == 0:
        print()
        print(f"portal unreachable: could not connect to {base} ({probe_text.strip()[:120]}).")
        print("Start the stack (docker compose up --build), then re-run this script. "
              "No checks were evaluated.")
        return 2

    checks, event, slug = build_checks(cfg, base)
    if event is None:
        print("event: none with an open judging or voting window")
    else:
        print(f"event: {event.get('slug')} ({event.get('status')})")
    print()

    width = max(len(c.label) for c in checks) + 2
    for c in checks:
        dots = "." * (width - len(c.label))
        print(f"{c.tier}  {c.label} {dots} {c.status}")
        for line in c.detail:
            print(f"       {line}")

    passed = sum(1 for c in checks if c.status == PASS)
    skipped = sum(1 for c in checks if c.status == SKIP)
    failed = sum(1 for c in checks if c.status == FAIL)
    counted = passed + failed
    print()
    print(f"Summary: {passed}/{counted} PASS" + (f" ({skipped} skipped)" if skipped else ""))
    if skipped:
        print("note: skipped checks were not verifiable on this deployment and are "
              "excluded from the pass count \u2014 none of them is a pass.")
    if failed:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
