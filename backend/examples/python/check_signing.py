"""
Runs the published signing vectors against this implementation.

The vectors are cases the SDK accepts or refuses. A signer that agrees with every one of them, and
whose own signatures pass the same checks, produces screens the app will render.

    pip install cryptography
    python3 check_signing.py [path/to/es256-vectors.json]
"""
import json
import pathlib
import sys

from cryptography.hazmat.primitives import serialization

from heimui_signing import ScreenSigner, key_id_of, open_sealed, verify_detached

path = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "../../signing/es256-vectors.json")
vectors = json.loads(path.read_text(encoding="utf-8"))
public_key_pem = vectors["publicKeyPem"]

checks = 0
failures = []


def expect(name, ok):
    global checks
    checks += 1
    print(("  ok   " if ok else "  FAIL ") + name)
    if not ok:
        failures.append(name)


expect(
    "the key id is the RFC 7638 thumbprint",
    key_id_of(serialization.load_pem_public_key(public_key_pem.encode("ascii"))) == vectors["keyId"],
)

for case in vectors["cases"]:
    if case["delivery"] == "header":
        verdict = verify_detached(public_key_pem, case["body"].encode("utf-8"), case["signature"])
    else:
        verdict = open_sealed(public_key_pem, case["body"]) is not None
    expect(("accepts " if case["valid"] else "refuses ") + case["name"], verdict == case["valid"])

# What this implementation signs has to pass the same checks.
signer = ScreenSigner(vectors["privateKeyPem"])
screen = '{"id":"home","root":{"id":"r","type":"text","text":"Hola, María"}}'.encode("utf-8")
header = signer.sign_detached(screen)

expect("signs under the key id the SDK derives", signer.key_id == vectors["keyId"])
expect("a detached signature holds over the exact bytes", verify_detached(public_key_pem, screen, header))
expect(
    "and not over the same screen serialised again",
    not verify_detached(public_key_pem, json.dumps(json.loads(screen), indent=2).encode("utf-8"), header),
)
expect("a sealed copy opens to the exact bytes", open_sealed(public_key_pem, signer.seal(screen)) == screen)

print()
if failures:
    sys.exit("%d of %d checks failed" % (len(failures), checks))
print("%d/%d checks pass." % (checks, checks))
