"""
Regression test for the confirmed race: scripts/sync_manager.py's background
thread and live Flask request threads both read/write the same JSON files
with no coordination. utils/json_helpers.py's _safe_json_load/_safe_json_dump
are now wrapped in a per-path lock (utils/file_write_lock.py) -- this proves
concurrent writers never produce a corrupted/interleaved file and a
concurrent reader never observes a torn intermediate write.
"""
import json
import threading

from utils.json_helpers import _safe_json_dump, _safe_json_load


def test_concurrent_writes_never_corrupt_the_file(tmp_path):
    target = str(tmp_path / "concurrent.json")
    n_threads = 20
    barrier = threading.Barrier(n_threads)
    errors = []

    def writer(i: int):
        try:
            barrier.wait()  # maximize actual concurrent overlap
            payload = {"writer": i, "data": list(range(500))}
            assert _safe_json_dump(target, payload) is True
        except Exception as e:  # pragma: no cover - surfaced via `errors`
            errors.append(e)

    threads = [threading.Thread(target=writer, args=(i,)) for i in range(n_threads)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not errors

    # The file must always be valid, complete JSON -- never truncated or
    # interleaved -- and must exactly equal exactly one writer's payload
    # (whichever ran last), never a hybrid of two.
    with open(target, "r", encoding="utf-8") as f:
        raw = f.read()
    result = json.loads(raw)  # raises if truncated/interleaved

    assert set(result.keys()) == {"writer", "data"}
    assert 0 <= result["writer"] < n_threads
    assert result["data"] == list(range(500))


def test_concurrent_readers_never_see_a_torn_write(tmp_path):
    target = str(tmp_path / "read_during_write.json")
    _safe_json_dump(target, {"version": 0, "data": list(range(2000))})

    stop = threading.Event()
    errors = []

    def writer():
        version = 1
        while not stop.is_set():
            _safe_json_dump(target, {"version": version, "data": list(range(2000))})
            version += 1

    def reader():
        for _ in range(200):
            try:
                data = _safe_json_load(target, None)
                assert data is not None
                assert set(data.keys()) == {"version", "data"}
                assert data["data"] == list(range(2000))
            except Exception as e:  # pragma: no cover
                errors.append(e)

    writer_thread = threading.Thread(target=writer)
    writer_thread.start()
    try:
        reader()
    finally:
        stop.set()
        writer_thread.join()

    assert not errors


def test_write_then_read_back_round_trips(tmp_path):
    target = str(tmp_path / "roundtrip.json")
    payload = [{"id": "a", "n": 1}, {"id": "b", "n": 2}]
    assert _safe_json_dump(target, payload) is True
    assert _safe_json_load(target, []) == payload
