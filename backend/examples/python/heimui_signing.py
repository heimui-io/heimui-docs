"""
Signs HeimUI screens: ES256, in the JWS format the SDK verifies.

One signature, two ways to deliver it:

- ``sign_detached(body)`` is the ``X-Heim-Signature`` header for a response whose body is exactly
  ``body``. What a service that answers the device sends.
- ``seal(body)`` is the screen with its signature wrapped around it. What goes in a bucket or on a
  CDN, which cannot send a header of its own.

Sign last. Whatever produces the bytes -- hydration, localisation, serialisation -- runs first, and
nothing touches the body afterwards: the app verifies the bytes it receives, one by one.

``verify_detached`` and ``open_sealed`` are the checks the SDK makes, for your tests.

Needs ``cryptography`` (``pip install cryptography``). Unlike hydration, this is not written from
scratch on purpose: elliptic-curve arithmetic is exactly the code to take from a library that has
been audited for it.
"""
from __future__ import annotations

import base64
import hashlib
import json
import string
from typing import Optional, Union

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature, encode_dss_signature

_ALPHABET = set(string.ascii_letters + string.digits + "-_")


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _decode_canonical(text: object) -> Optional[bytes]:
    """Canonical, unpadded base64url, or None. Two spellings of one payload must not both verify."""
    if not isinstance(text, str) or any(c not in _ALPHABET for c in text) or len(text) % 4 == 1:
        return None
    raw = base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))
    return raw if _b64url(raw) == text else None


def _as_bytes(pem: Union[str, bytes]) -> bytes:
    return pem.encode("ascii") if isinstance(pem, str) else pem


def key_id_of(public_key: ec.EllipticCurvePublicKey) -> str:
    """
    The RFC 7638 thumbprint of a P-256 public key: the ``kid`` a signature names, and the value the
    SDK derives from the key the app trusts. Computed, never chosen, so the two cannot disagree.
    """
    if not isinstance(public_key.curve, ec.SECP256R1):
        raise ValueError("ES256 needs a P-256 key")
    numbers = public_key.public_numbers()
    x = _b64url(numbers.x.to_bytes(32, "big"))
    y = _b64url(numbers.y.to_bytes(32, "big"))
    canonical = '{"crv":"P-256","kty":"EC","x":"%s","y":"%s"}' % (x, y)
    return _b64url(hashlib.sha256(canonical.encode("ascii")).digest())


class ScreenSigner:
    """A signer for one PKCS#8 private key (``-----BEGIN PRIVATE KEY-----``)."""

    def __init__(self, private_key_pem: Union[str, bytes]):
        key = serialization.load_pem_private_key(_as_bytes(private_key_pem), password=None)
        if not isinstance(key, ec.EllipticCurvePrivateKey) or not isinstance(key.curve, ec.SECP256R1):
            raise ValueError("ES256 needs a P-256 private key")
        self._key = key
        self.key_id = key_id_of(key.public_key())
        #: What the app puts in ``HeimConfig.trustedSigningKeys``.
        self.public_key_pem = key.public_key().public_bytes(
            serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
        ).decode("ascii")
        header = json.dumps({"alg": "ES256", "kid": self.key_id}, separators=(",", ":"))
        self._protected = _b64url(header.encode("ascii"))

    def _sign(self, signing_input: str) -> str:
        # cryptography returns DER; JWS defines ES256 as r || s, 32 bytes each, and the SDK refuses DER.
        r, s = decode_dss_signature(self._key.sign(signing_input.encode("ascii"), ec.ECDSA(hashes.SHA256())))
        return _b64url(r.to_bytes(32, "big") + s.to_bytes(32, "big"))

    def sign_detached(self, body: bytes) -> str:
        return "%s..%s" % (self._protected, self._sign("%s.%s" % (self._protected, _b64url(body))))

    def seal(self, body: bytes) -> str:
        payload = _b64url(body)
        signature = self._sign("%s.%s" % (self._protected, payload))
        return json.dumps({"protected": self._protected, "payload": payload, "signature": signature}, separators=(",", ":"))


def _check(public_key_pem: Union[str, bytes], protected: object, payload: object, signature: object) -> bool:
    header_bytes = _decode_canonical(protected)
    if header_bytes is None or _decode_canonical(payload) is None:
        return False
    try:
        header = json.loads(header_bytes)
    except ValueError:
        return False
    # Exactly ES256 -- never "none", never whatever the header asks for -- and nothing half-understood.
    if not isinstance(header, dict) or header.get("alg") != "ES256" or "crit" in header or "b64" in header:
        return False
    public_key = serialization.load_pem_public_key(_as_bytes(public_key_pem))
    if header.get("kid") != key_id_of(public_key):
        return False
    raw = _decode_canonical(signature)
    if raw is None or len(raw) != 64:
        return False
    der = encode_dss_signature(int.from_bytes(raw[:32], "big"), int.from_bytes(raw[32:], "big"))
    try:
        public_key.verify(der, ("%s.%s" % (protected, payload)).encode("ascii"), ec.ECDSA(hashes.SHA256()))
        return True
    except InvalidSignature:
        return False


def verify_detached(public_key_pem: Union[str, bytes], body: bytes, header: Optional[str]) -> bool:
    """Whether ``header`` is a detached ES256 signature by ``public_key_pem`` over exactly ``body``."""
    if not isinstance(header, str):
        return False
    parts = header.split(".")
    if len(parts) != 3 or parts[1] != "":
        return False
    return _check(public_key_pem, parts[0], _b64url(body), parts[2])


def open_sealed(public_key_pem: Union[str, bytes], text: str) -> Optional[bytes]:
    """The screen inside a sealed copy when its signature holds, otherwise None."""
    try:
        sealed = json.loads(text)
    except ValueError:
        return None
    if not isinstance(sealed, dict):
        return None
    protected, payload, signature = sealed.get("protected"), sealed.get("payload"), sealed.get("signature")
    if not _check(public_key_pem, protected, payload, signature):
        return None
    return base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4))
