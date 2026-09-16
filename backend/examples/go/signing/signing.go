// Package signing signs HeimUI screens: ES256, in the JWS format the SDK verifies.
//
// One signature, two ways to deliver it:
//
//   - SignDetached(body) is the X-Heim-Signature header for a response whose body is exactly body.
//     What a service that answers the device sends.
//   - Seal(body) is the screen with its signature wrapped around it. What goes in a bucket or on a
//     CDN, which cannot send a header of its own.
//
// Sign last. Whatever produces the bytes -- hydration, localisation, serialisation -- runs first, and
// nothing touches the body afterwards: the app verifies the bytes it receives, one by one.
//
// VerifyDetached and OpenSealed are the checks the SDK makes, for your tests.
//
// Standard library only.
package signing

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"math/big"
	"strings"
)

var b64 = base64.RawURLEncoding

// Signer signs with one P-256 private key.
type Signer struct {
	key             *ecdsa.PrivateKey
	protectedHeader string

	// KeyID is the RFC 7638 thumbprint the SDK derives from the public key.
	KeyID string
	// PublicKeyPEM is what the app puts in HeimConfig.trustedSigningKeys.
	PublicKeyPEM string
}

// NewSigner reads a PKCS#8 private key (-----BEGIN PRIVATE KEY-----).
func NewSigner(privateKeyPEM []byte) (*Signer, error) {
	block, _ := pem.Decode(privateKeyPEM)
	if block == nil || block.Type != "PRIVATE KEY" {
		return nil, errors.New("signing: expected a PKCS#8 PRIVATE KEY block")
	}
	parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("signing: %w", err)
	}
	key, ok := parsed.(*ecdsa.PrivateKey)
	if !ok || key.Curve != elliptic.P256() {
		return nil, errors.New("signing: ES256 needs a P-256 key")
	}
	kid, err := KeyID(&key.PublicKey)
	if err != nil {
		return nil, err
	}
	spki, err := x509.MarshalPKIXPublicKey(&key.PublicKey)
	if err != nil {
		return nil, fmt.Errorf("signing: %w", err)
	}
	header, _ := json.Marshal(map[string]string{"alg": "ES256", "kid": kid})
	return &Signer{
		key:             key,
		protectedHeader: b64.EncodeToString(header),
		KeyID:           kid,
		PublicKeyPEM:    string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: spki})),
	}, nil
}

// KeyID is the RFC 7638 thumbprint of a P-256 public key: the kid a signature names. Computed, never
// chosen, so it cannot disagree with the key the app trusts.
func KeyID(key *ecdsa.PublicKey) (string, error) {
	if key.Curve != elliptic.P256() {
		return "", errors.New("signing: ES256 needs a P-256 key")
	}
	point, err := key.ECDH()
	if err != nil {
		return "", fmt.Errorf("signing: %w", err)
	}
	raw := point.Bytes() // 0x04 || X || Y
	canonical := fmt.Sprintf(`{"crv":"P-256","kty":"EC","x":"%s","y":"%s"}`, b64.EncodeToString(raw[1:33]), b64.EncodeToString(raw[33:65]))
	sum := sha256.Sum256([]byte(canonical))
	return b64.EncodeToString(sum[:]), nil
}

func (s *Signer) sign(signingInput string) (string, error) {
	digest := sha256.Sum256([]byte(signingInput))
	r, sv, err := ecdsa.Sign(rand.Reader, s.key, digest[:])
	if err != nil {
		return "", fmt.Errorf("signing: %w", err)
	}
	// JWS defines ES256 as r || s, 32 bytes each. ecdsa.SignASN1 would give DER, which the SDK refuses.
	raw := make([]byte, 64)
	r.FillBytes(raw[:32])
	sv.FillBytes(raw[32:])
	return b64.EncodeToString(raw), nil
}

// SignDetached returns the X-Heim-Signature value for a response whose body is exactly body.
func (s *Signer) SignDetached(body []byte) (string, error) {
	signature, err := s.sign(s.protectedHeader + "." + b64.EncodeToString(body))
	if err != nil {
		return "", err
	}
	return s.protectedHeader + ".." + signature, nil
}

// Seal returns body with its signature wrapped around it, for a bucket or a CDN.
func (s *Signer) Seal(body []byte) ([]byte, error) {
	payload := b64.EncodeToString(body)
	signature, err := s.sign(s.protectedHeader + "." + payload)
	if err != nil {
		return nil, err
	}
	return json.Marshal(map[string]string{"protected": s.protectedHeader, "payload": payload, "signature": signature})
}

// decodeCanonical accepts unpadded base64url with zero trailing bits only. Two spellings of one
// payload must not both verify, and Go's decoder alone would skip newlines inside the text.
func decodeCanonical(text string) ([]byte, bool) {
	raw, err := b64.Strict().DecodeString(text)
	if err != nil || b64.EncodeToString(raw) != text {
		return nil, false
	}
	return raw, true
}

func publicKey(publicKeyPEM []byte) (*ecdsa.PublicKey, bool) {
	block, _ := pem.Decode(publicKeyPEM)
	if block == nil || block.Type != "PUBLIC KEY" {
		return nil, false
	}
	parsed, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, false
	}
	key, ok := parsed.(*ecdsa.PublicKey)
	return key, ok && key.Curve == elliptic.P256()
}

func check(publicKeyPEM []byte, protectedHeader, payload, signature string) bool {
	key, ok := publicKey(publicKeyPEM)
	if !ok {
		return false
	}
	headerBytes, ok := decodeCanonical(protectedHeader)
	if !ok {
		return false
	}
	if _, ok := decodeCanonical(payload); !ok {
		return false
	}
	var header map[string]any
	if json.Unmarshal(headerBytes, &header) != nil || header == nil {
		return false
	}
	// Exactly ES256 -- never "none", never whatever the header asks for -- and nothing half-understood.
	if alg, _ := header["alg"].(string); alg != "ES256" {
		return false
	}
	if _, has := header["crit"]; has {
		return false
	}
	if _, has := header["b64"]; has {
		return false
	}
	kid, err := KeyID(key)
	if got, _ := header["kid"].(string); err != nil || got != kid {
		return false
	}
	raw, ok := decodeCanonical(signature)
	if !ok || len(raw) != 64 {
		return false
	}
	digest := sha256.Sum256([]byte(protectedHeader + "." + payload))
	return ecdsa.Verify(key, digest[:], new(big.Int).SetBytes(raw[:32]), new(big.Int).SetBytes(raw[32:]))
}

// VerifyDetached reports whether header is a detached ES256 signature by publicKeyPEM over exactly body.
func VerifyDetached(publicKeyPEM, body []byte, header string) bool {
	parts := strings.Split(header, ".")
	if len(parts) != 3 || parts[1] != "" {
		return false
	}
	return check(publicKeyPEM, parts[0], b64.EncodeToString(body), parts[2])
}

// OpenSealed returns the screen inside a sealed copy when its signature holds.
func OpenSealed(publicKeyPEM, sealed []byte) ([]byte, bool) {
	var parts map[string]any
	if json.Unmarshal(sealed, &parts) != nil {
		return nil, false
	}
	protectedHeader, _ := parts["protected"].(string)
	payload, okPayload := parts["payload"].(string)
	signature, _ := parts["signature"].(string)
	if !okPayload || !check(publicKeyPEM, protectedHeader, payload, signature) {
		return nil, false
	}
	body, _ := decodeCanonical(payload)
	return body, true
}
