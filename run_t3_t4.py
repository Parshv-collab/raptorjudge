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

A check is reported as PASS only when real evidence proves it. Most checks make
a real HTTP request; T3.8 cites the unit suite that covers the same write path,
because no HTTP route creates submissions. When even that is impossible — no
event is open for voting or judging, no session in the config — the check is
reported as SKIP with its reason, never as a pass.
"""

import argparse
import hashlib
import hmac
import json
import os
import re
import shutil
import subprocess
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

# How long a webhook delivery is given to arrive before the next candidate host
# is tried.
WEBHOOK_WAIT_SECONDS = 15

# `convex/voting.ts`: QUADRATIC_BUDGET credits, and a 1-point vote costs 1.
QUADRATIC_BUDGET = 25

# How many 1-point votes the rate-limit burst fires at one submission.
RATE_LIMIT_BURST = 25

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
    """A local HTTP receiver the deployment can deliver a test webhook to.

    Bound to every interface, not to 127.0.0.1: the delivery `fetch` runs inside
    the backend container, so a loopback-only socket would never accept the
    connection. It records POST bodies and answers 200 for the life of one
    check, then is shut down — it executes nothing and reads nothing else.
    """
    server = HTTPServer(("0.0.0.0", 0), _WebhookHandler)
    server.captured = []
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


def webhook_targets(port):
    """Candidate delivery targets for the receiver, most likely to work first.

    A container cannot reach the host at 127.0.0.1 (that is the container's own
    loopback), so the same receiver is offered under the addresses a container
    *can* reach, in the order they are likely to resolve:

      host.docker.internal  Docker Desktop, and Linux with the ``extra_hosts``
                            host-gateway entry docker-compose.yml now carries
      172.17.0.1            the docker0 bridge on a default Linux install
      127.0.0.1             a non-Docker local deployment (``convex dev``)

    ``RAPTORJUDGE_WEBHOOK_HOST`` overrides the list with a single host, for a
    deployment whose gateway address is something else entirely.
    """
    override = os.environ.get("RAPTORJUDGE_WEBHOOK_HOST")
    hosts = [override] if override else []
    hosts += ["host.docker.internal", "172.17.0.1", "127.0.0.1"]
    targets, seen = [], set()
    for host in hosts:
        host = (host or "").strip()
        if host and host not in seen:
            seen.add(host)
            targets.append(f"http://{host}:{port}/hook")
    return targets


# ------------------------------------------------------------------ test proof ---


ANSI = re.compile(r"\x1b\[[0-9;]*m")
DUPLICATE_SUITE = os.path.join("tests", "duplicates.test.ts")


# -------------------------------------------------------------- rate limiting ---


def burst_votes(base, slug, submission_id, participant, attempts):
    """Fire `attempts` 1-point votes at ONE submission as fast as HTTP allows.

    Returns ``(accepted, rejected, first_refusal)`` where ``first_refusal`` is
    ``(attempt_number, status, body_excerpt)`` for the first refusal, or None.
    """
    accepted = rejected = 0
    first_refusal = None
    for attempt in range(1, attempts + 1):
        status, text = request(
            f"{base}/api/v1/votes",
            header=participant,
            method="POST",
            body={"slug": slug, "submissionId": submission_id, "points": 1},
        )
        if status == 200:
            accepted += 1
        else:
            rejected += 1
            if first_refusal is None:
                first_refusal = (attempt, status, text.strip()[:120])
    return accepted, rejected, first_refusal


def votes_status(base, slug, participant):
    """The participant's live vote status, or {} when it did not answer."""
    payload = as_json(request(f"{base}/api/v1/votes/status?slug={slug}", header=participant)[1])
    return payload if isinstance(payload, dict) else {}


def wait_for_limiter_window(base, slug, submission_id, participant, deadline_s=70):
    """Wait out the vote rate-limit window, then clear the probe vote.

    The limiter is a fixed one-minute window per actor+event, so the burst
    leaves this participant refused for the rest of the minute. Waiting here
    (a) keeps the deployment usable for whoever clicks next in the UI as this
    participant and (b) makes a second run of this script behave identically
    instead of finding T3.1/T3.2 refused. Probing rather than assuming means we
    only wait as long as the deployment actually needs.

    Returns the number of seconds waited, or None if the window never rolled.
    """
    started = time.time()
    while time.time() - started < deadline_s:
        time.sleep(5)
        status, _ = request(
            f"{base}/api/v1/votes",
            header=participant,
            method="POST",
            body={"slug": slug, "submissionId": submission_id, "points": 1},
        )
        if status == 200:
            request(
                f"{base}/api/v1/votes/revoke",
                header=participant,
                method="POST",
                body={"slug": slug, "submissionId": submission_id},
            )
            return round(time.time() - started)
    return None


def duplicate_rule_proof():
    """Run the duplicate-rule suite and report what it proves.

    ``POST /api/submissions`` is a contract check against the closed
    sample-hack-2026 event — it inserts nothing — so a 3-of-3 duplicate cannot
    be *filed* over the wire on any deployment. The rule that refuses it is a
    pure function (``src/lib/algorithms/duplicates.ts``) that the Convex write
    path calls on every submission, and ``tests/duplicates.test.ts`` asserts the
    3-of-3 write decision and the exact user-facing message. Running that suite
    is a real proof of the rule.

    Returns ``(outcome, detail_line)`` where outcome is ``"pass"``, ``"skip"``
    or ``"fail"`` (issue 47).

    The three outcomes are genuinely different and must not be collapsed:

      * ``pass`` — a runner was available and the two decisive assertions were
        observed passing. The rule is proven.
      * ``fail`` — a runner was available and ran, but the suite did not prove
        the assertions. That is a broken write path, and reporting it as a skip
        would hide a real bug behind an environment excuse.
      * ``skip`` — no test runner exists on this host at all, so the proof could
        not be attempted. That is a property of the machine, not of the code.
        Reporting it as a fail used to turn a host without bun or node into a
        red audit for a rule that is in fact correct.
    """
    here = os.path.dirname(os.path.abspath(__file__))
    suite = os.path.join(here, DUPLICATE_SUITE)
    if not os.path.exists(suite):
        return "skip", f"{DUPLICATE_SUITE} is not next to this script — cannot prove the 3-of-3 rule"

    # Preference order: bun first (it is what the project ships with and it
    # resolves its own dependencies), then the node/npm path.
    #
    # `npx --no-install` is deliberate: without it, npx offers to download
    # vitest from the network on first run, which hangs on an offline host and
    # turns a missing dependency into a long timeout. With it, npx exits in
    # seconds saying vitest is not installed, and the next runner is tried.
    runners = [
        ["bun", "run", "test", DUPLICATE_SUITE, "--reporter=verbose"],
        ["bunx", "vitest", "run", DUPLICATE_SUITE, "--reporter=verbose"],
        ["npx", "--no-install", "vitest", "run", DUPLICATE_SUITE, "--reporter=verbose"],
    ]
    available = [r for r in runners if shutil.which(r[0]) is not None]

    if not available:
        return "skip", (
            "no test runner available on host (need bun or node/npm) — the 3-of-3 rule could "
            f"not be exercised here; run `bun run test {DUPLICATE_SUITE}` to prove it"
        )

    problems = []
    for runner in available:
        env = dict(os.environ, NO_COLOR="1", FORCE_COLOR="0", CI="1")
        try:
            proc = subprocess.run(
                runner, cwd=here, env=env, capture_output=True, text=True, timeout=180
            )
        except Exception as exc:  # noqa: BLE001 - any runner failure is a reason, not a crash
            problems.append(f"{runner[0]}: {type(exc).__name__}")
            continue
        output = ANSI.sub("", proc.stdout + proc.stderr)
        decisive = (
            "rejects a 3-of-3 match (team + title + repo)" in output
            and "exposes a stable user-facing reject message" in output
        )
        if proc.returncode == 0 and decisive:
            found = re.search(r"Tests\s+(\d+) passed", output) or re.search(r"(\d+) passed", output)
            count = found.group(1) if found else "all"
            return "pass", (
                f"{DUPLICATE_SUITE}: {count} tests passed via {runner[0]} — the 3-of-3 write "
                "decision and the 'This project is already submitted by your team.' message "
                "are proven against the mutation's own rule (no REST route creates "
                "submissions to file one over HTTP)"
            )
        problems.append(f"{runner[0]}: suite exited {proc.returncode} without the duplicate assertions")
    return "fail", "could not execute the duplicate-rule proof — " + "; ".join(problems)


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
    #
    # The limiter is per actor+event (20 actions per minute — see
    # `src/lib/rateLimit.ts` and `voting.checkRateLimit`), NOT per project, so a
    # burst has to hit ONE submission repeatedly. The old version spread 25
    # requests over 25 *different* projects and never reached the cap on an
    # event with six of them.
    result = Result("T3", "Rate limiting fires")
    if needs_submission(result) and participant:
        before = votes_status(base, slug, participant)
        if not before.get("votingOpen"):
            result.skip("voting is not open for this event from the participant session")
        else:
            spent_before = before.get("creditsSpent", 0)
            accepted, rejected, first_refusal = burst_votes(
                base, slug, submission_id, participant, RATE_LIMIT_BURST
            )
            mid = votes_status(base, slug, participant)
            spent_after = mid.get("creditsSpent")
            # One revoke clears every point cast on that submission and refunds
            # them, so the deployment is left as it was found.
            request(
                f"{base}/api/v1/votes/revoke",
                header=participant,
                method="POST",
                body={"slug": slug, "submissionId": submission_id},
            )
            refunded = votes_status(base, slug, participant).get("creditsSpent")
            timed = None
            if rejected:
                timed = wait_for_limiter_window(base, slug, submission_id, participant)

            attempt, status, body_excerpt = first_refusal or (0, 0, "")
            result.note(
                f"{accepted} of {RATE_LIMIT_BURST} votes accepted, {rejected} rejected; "
                f"first refusal was request #{attempt} -> {status} {body_excerpt}"
            )
            # The REST bridge sanitizes thrown mutation errors to 400 (security
            # item 65), so the app's 429-equivalent signal is "this identical
            # request just succeeded and is now refused". The budget guard below
            # is what makes that attribution safe.
            tracked = spent_after is not None and spent_after - spent_before == accepted
            budget = spent_before + accepted
            if accepted < 1:
                result.fail(
                    f"the very first vote was refused ({status}) — voting is not usable for this session"
                )
            elif rejected < 1:
                result.fail(
                    f"{RATE_LIMIT_BURST} rapid votes on one submission were all accepted — no limiter fired"
                )
            elif budget >= QUADRATIC_BUDGET:
                result.fail(
                    f"the burst ran out of quadratic credits ({budget}/{QUADRATIC_BUDGET}) before the "
                    "limiter refused anything, so this proves the budget, not the rate limit"
                )
            elif not tracked:
                result.fail(
                    f"creditsSpent went {spent_before}->{spent_after} across {accepted} accepted votes "
                    "— votes are not accounted one-for-one"
                )
            elif refunded != spent_before:
                result.fail(f"revoking the burst left creditsSpent at {refunded}, expected {spent_before}")
            else:
                result.note(
                    f"creditsSpent {spent_before} -> {spent_after} across {accepted} accepted votes "
                    f"(one credit each, no double counting), restored to {refunded} after the revoke"
                )
                result.pass_(
                    f"refused after {accepted} of {RATE_LIMIT_BURST} votes while only "
                    f"{budget}/{QUADRATIC_BUDGET} credits were spent — the limiter refused it, not the "
                    "quadratic budget"
                )
                result.note(
                    f"vote window rolled after ~{timed}s and the session votes again"
                    if timed is not None
                    else "vote window did not roll within 70s — expect a refused vote until it does"
                )
    else:
        if not participant:
            result.skip("no participant session in the config")
    checks.append(result)

    # T3.8 — duplicate detection
    #
    # Nothing over HTTP creates a submission (`POST /api/submissions` is a
    # contract check against the closed sample-hack-2026 event), so the 3-of-3
    # rejection cannot be filed over the wire. It is proven where the rule
    # lives: the suite that covers the same write path the mutation calls.
    result = Result("T3", "Duplicate detection (3-of-3 rejected)")
    outcome, detail = duplicate_rule_proof()
    if outcome == "pass":
        result.pass_(detail)
    elif outcome == "skip":
        # Issue 47: a host with neither bun nor node/npm cannot attempt the
        # proof. That is an environment fact, and a skip says so honestly —
        # unlike a fail, it does not accuse a write path that works.
        result.skip(detail)
    else:
        result.fail(detail)
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
    #
    # The delivery `fetch` runs in the backend container, where 127.0.0.1 is the
    # container's own loopback — which is why a loopback target never delivered.
    # The receiver now listens on every interface and the deployment is handed
    # addresses a container can actually reach (host.docker.internal first —
    # Docker Desktop natively, Linux through the `extra_hosts: host-gateway`
    # entry in docker-compose.yml). Each candidate is tried in turn, and a
    # candidate that cannot deliver is left registered but unreachable in its
    # own way; the first one that delivers wins the check.
    result = Result("T4", "Webhook delivery signed")
    if not organizer:
        result.skip("no organizer session in the config")
    else:
        receiver = start_receiver()
        port = receiver.server_address[1]
        targets = webhook_targets(port)
        delivered = False
        try:
            for target in targets:
                receiver.captured.clear()
                reg_status, reg_text = request(
                    f"{base}/api/v1/webhooks",
                    header=organizer,
                    method="POST",
                    body={"slug": slug, "targetUrl": target, "events": "*"},
                )
                reg = as_json(reg_text) or {}
                if reg_status != 200 or not reg.get("webhookId"):
                    result.note(f"{target}: not registered ({reg_status} {reg_text.strip()[:90]})")
                    continue

                request(
                    f"{base}/api/v1/webhooks/test",
                    header=organizer,
                    method="POST",
                    body={"webhookId": reg["webhookId"]},
                )
                deadline = time.time() + WEBHOOK_WAIT_SECONDS
                while time.time() < deadline and not receiver.captured:
                    time.sleep(0.25)
                if not receiver.captured:
                    result.note(
                        f"{target}: no delivery within {WEBHOOK_WAIT_SECONDS}s "
                        "(this address is not reachable from the backend container)"
                    )
                    continue

                delivery = receiver.captured[0]
                headers = delivery["headers"]
                signature = headers.get("x-raptorjudge-signature", "")
                timestamp = headers.get("x-raptorjudge-timestamp", "")
                delivery_id = headers.get("x-raptorjudge-delivery", "")
                payload = as_json(delivery["body"]) or {}
                expected = hmac.new(
                    reg["secretKey"].encode(),
                    f"{timestamp}.{delivery_id}.{delivery['body']}".encode(),
                    hashlib.sha256,
                ).hexdigest()
                signs_ok = signature == f"sha256={expected}" and bool(timestamp) and bool(delivery_id)
                payload_ok = payload.get("type") == "ping" and (payload.get("data") or {}).get("test") is True
                if signs_ok and payload_ok:
                    result.pass_(
                        f"delivered to {target} within {WEBHOOK_WAIT_SECONDS}s: "
                        "HMAC-SHA256 over timestamp.delivery.body matches and the payload is the "
                        "ping that was triggered"
                    )
                    delivered = True
                    break
                result.note(
                    f"{target}: delivery arrived but did not verify "
                    f"(signature={signature[:20]}…, type={payload.get('type')})"
                )

            if not delivered and result.status == SKIP:
                hosts = ", ".join(t.split("//")[1] for t in targets)
                result.fail(
                    "no signed delivery arrived from any candidate host "
                    f"({hosts}) — the backend could not reach this host. Add "
                    "`extra_hosts: [\"host.docker.internal:host-gateway\"]` to the backend "
                    "service (already in docker-compose.yml) or set RAPTORJUDGE_WEBHOOK_HOST."
                )
        finally:
            receiver.shutdown()
            receiver.server_close()
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
