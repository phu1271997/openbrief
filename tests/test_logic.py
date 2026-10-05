"""Offline tests for OpenBrief's deterministic helper logic."""
import importlib.util
import os

import pytest

_PATH = os.path.join(os.path.dirname(__file__), "..", "contracts", "open_brief.py")
_spec = importlib.util.spec_from_file_location("open_brief", _PATH)
ob = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ob)

AUTHOR = "0x" + "ab" * 20
COAUTHOR = "0x" + "cd" * 20


# --------------------------------------------------------------------- verdict
def test_strong_tier_credits_author_case_insensitively():
    # Model keys the role by a CHECKSUMMED address; author tracked lowercased.
    raw = {
        "tier": "PUBLISHED_STRONG",
        "confidence": 90,
        "roles": {AUTHOR.upper(): "LEAD", COAUTHOR: "MAJOR"},
        "reason": "meets all criteria",
    }
    v = ob._normalize_verdict(raw, [AUTHOR, COAUTHOR])
    assert v["tier"] == "PUBLISHED_STRONG"
    assert v["roles"][AUTHOR] == "LEAD"
    assert v["roles"][COAUTHOR] == "MAJOR"


def test_on_brief_with_no_roles_defaults_submitter_to_lead():
    raw = {"tier": "PUBLISHED_PARTIAL", "confidence": 50, "roles": {}, "reason": "ok"}
    v = ob._normalize_verdict(raw, [AUTHOR, COAUTHOR])
    assert v["roles"][AUTHOR] == "LEAD"
    assert v["roles"][COAUTHOR] == "NONE"


def test_off_brief_credits_nobody():
    raw = {"tier": "OFF_BRIEF", "confidence": 99, "roles": {AUTHOR: "LEAD"}, "reason": "x"}
    v = ob._normalize_verdict(raw, [AUTHOR])
    assert all(r == "NONE" for r in v["roles"].values())


def test_unknown_tier_falls_back_to_off_brief():
    v = ob._normalize_verdict({"tier": "GREAT", "roles": {}}, [AUTHOR])
    assert v["tier"] == "OFF_BRIEF"


def test_bad_llm_json_raises():
    with pytest.raises(ob.gl.vm.UserError):
        ob._normalize_verdict("not json", [AUTHOR])


def test_confidence_clamped():
    v = ob._normalize_verdict({"tier": "OFF_BRIEF", "confidence": 500, "roles": {}}, [AUTHOR])
    assert 0 <= v["confidence"] <= 100


# ------------------------------------------------------------------------- urls
def test_https_public_url_ok():
    assert ob._validate_url("https://example.com/a", "x") == "https://example.com/a"


@pytest.mark.parametrize(
    "bad",
    ["http://example.com", "https://localhost/x", "https://127.0.0.1/x", "ftp://example.com"],
)
def test_bad_urls_rejected(bad):
    with pytest.raises(ob.gl.vm.UserError):
        ob._validate_url(bad, "x")


# -------------------------------------------------------------------- economics
def test_payout_bands_are_monotonic():
    assert ob.TIER_PAYOUT_BPS["PUBLISHED_STRONG"] == 10000
    assert ob.TIER_PAYOUT_BPS["PUBLISHED_PARTIAL"] == 5000
    assert ob.TIER_PAYOUT_BPS["OFF_BRIEF"] == 0


def test_role_weights_rank_contribution():
    w = ob.ROLE_WEIGHT
    assert w["LEAD"] > w["MAJOR"] > w["SUPPORTING"] > w["NONE"] == 0
