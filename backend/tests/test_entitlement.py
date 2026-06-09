from lazyupload import entitlement


def test_free_blocks_pro_features():
    assert entitlement.allows("free", "auto_upload") is False
    assert entitlement.allows("free", "batch") is False


def test_pro_unlocks_features():
    assert entitlement.allows("pro", "auto_upload") is True
    assert entitlement.allows("pro", "batch") is True


def test_dev_key_activates_pro():
    res = entitlement.activate("LC-PRO-DEMO-2026")
    assert res and res["tier"] == "pro"


def test_unknown_key_rejected():
    assert entitlement.activate("nope") is None


def test_forged_tier_falls_back_to_free():
    # A hand-edited row claiming 'pro' with a bad signature must read back as free.
    forged = {"tier": "pro", "key": "x", "instance_id": None, "sig": "deadbeef"}
    assert entitlement.verify_stored(forged) == "free"


def test_signed_tier_verifies():
    sig = entitlement.sign_tier("pro", "KEY", "iid")
    stored = {"tier": "pro", "key": "KEY", "instance_id": "iid", "sig": sig}
    assert entitlement.verify_stored(stored) == "pro"
