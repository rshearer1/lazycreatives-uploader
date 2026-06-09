"""At-rest encryption for sensitive values (SoundCloud OAuth tokens).

On Windows we use **DPAPI** (CryptProtectData) so the ciphertext is bound to the
current user account — another user on the same machine can't read the tokens, and
the key never lives in our code. On non-Windows we fall back to a base64 envelope
(clearly marked `plain:`) so the app still runs; those platforms should move to the
OS keychain before release (tracked in the audit).

Storage format is a self-describing string: `dpapi:<b64>` or `plain:<b64>`. `decrypt`
also accepts a raw legacy plaintext (for catalogs written before encryption shipped).
"""
import base64
import sys

_WIN = sys.platform == "win32"
_DPAPI = "dpapi:"
_PLAIN = "plain:"

if _WIN:
    import ctypes
    from ctypes import wintypes

    class _BLOB(ctypes.Structure):
        _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]

    _crypt32 = ctypes.windll.crypt32
    _kernel32 = ctypes.windll.kernel32

    def _blob_in(data: bytes) -> _BLOB:
        buf = ctypes.create_string_buffer(data, len(data))
        return _BLOB(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))

    def _blob_out(blob: _BLOB) -> bytes:
        return ctypes.string_at(blob.pbData, blob.cbData)

    def _dpapi(fn, data: bytes) -> bytes:
        out = _BLOB()
        din = _blob_in(data)
        if not fn(ctypes.byref(din), None, None, None, None, 0, ctypes.byref(out)):
            raise OSError("DPAPI call failed")
        try:
            return _blob_out(out)
        finally:
            _kernel32.LocalFree(out.pbData)


def encrypt(plaintext: str) -> str:
    """Encrypt a string for local storage. Never raises — falls back to a marked
    plaintext envelope if DPAPI is unavailable, so token storage can't hard-fail."""
    raw = plaintext.encode("utf-8")
    if _WIN:
        try:
            blob = _dpapi(_crypt32.CryptProtectData, raw)
            return _DPAPI + base64.b64encode(blob).decode("ascii")
        except OSError:
            pass
    return _PLAIN + base64.b64encode(raw).decode("ascii")


def decrypt(token: str) -> str:
    """Inverse of encrypt. Accepts dpapi:/plain: envelopes and raw legacy plaintext."""
    if not isinstance(token, str):
        raise ValueError("not an encrypted token")
    if token.startswith(_DPAPI):
        if not _WIN:
            raise OSError("DPAPI ciphertext can't be read off Windows")
        blob = base64.b64decode(token[len(_DPAPI):])
        return _dpapi(_crypt32.CryptUnprotectData, blob).decode("utf-8")
    if token.startswith(_PLAIN):
        return base64.b64decode(token[len(_PLAIN):]).decode("utf-8")
    return token  # legacy: stored before encryption existed


def is_encrypted(token: str) -> bool:
    return isinstance(token, str) and token.startswith((_DPAPI, _PLAIN))
