// Command checksigning runs the published signing vectors against this implementation.
//
// The vectors are cases the SDK accepts or refuses. A signer that agrees with every one of them, and
// whose own signatures pass the same checks, produces screens the app will render.
//
//	go run ./checksigning [path/to/es256-vectors.json]
package main

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"os"

	"heimui.io/hydration/signing"
)

type vectors struct {
	PublicKeyPEM  string `json:"publicKeyPem"`
	PrivateKeyPEM string `json:"privateKeyPem"`
	KeyID         string `json:"keyId"`
	Cases         []struct {
		Name      string  `json:"name"`
		Delivery  string  `json:"delivery"`
		Body      string  `json:"body"`
		Signature *string `json:"signature"`
		Valid     bool    `json:"valid"`
	} `json:"cases"`
}

func main() {
	file := "../../signing/es256-vectors.json"
	if len(os.Args) > 1 {
		file = os.Args[1]
	}
	raw, err := os.ReadFile(file)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	var v vectors
	if err := json.Unmarshal(raw, &v); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	publicKey := []byte(v.PublicKeyPEM)

	checks, failures := 0, 0
	expect := func(name string, ok bool) {
		checks++
		mark := "ok  "
		if !ok {
			mark = "FAIL"
			failures++
		}
		fmt.Printf("  %s %s\n", mark, name)
	}

	kid := ""
	if block, _ := pem.Decode(publicKey); block != nil {
		if parsed, err := x509.ParsePKIXPublicKey(block.Bytes); err == nil {
			if key, ok := parsed.(*ecdsa.PublicKey); ok {
				kid, _ = signing.KeyID(key)
			}
		}
	}
	expect("the key id is the RFC 7638 thumbprint", kid == v.KeyID)

	for _, c := range v.Cases {
		var verdict bool
		if c.Delivery == "header" {
			verdict = c.Signature != nil && signing.VerifyDetached(publicKey, []byte(c.Body), *c.Signature)
		} else {
			_, verdict = signing.OpenSealed(publicKey, []byte(c.Body))
		}
		label := "refuses "
		if c.Valid {
			label = "accepts "
		}
		expect(label+c.Name, verdict == c.Valid)
	}

	// What this implementation signs has to pass the same checks.
	signer, err := signing.NewSigner([]byte(v.PrivateKeyPEM))
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	screen := []byte(`{"id":"home","root":{"id":"r","type":"text","text":"Hola, María"}}`)
	header, err := signer.SignDetached(screen)
	expect("signs under the key id the SDK derives", signer.KeyID == v.KeyID)
	expect("a detached signature holds over the exact bytes", err == nil && signing.VerifyDetached(publicKey, screen, header))

	var reparsed any
	_ = json.Unmarshal(screen, &reparsed)
	reformatted, _ := json.MarshalIndent(reparsed, "", "  ")
	expect("and not over the same screen serialised again", !signing.VerifyDetached(publicKey, reformatted, header))

	sealed, err := signer.Seal(screen)
	opened, ok := signing.OpenSealed(publicKey, sealed)
	expect("a sealed copy opens to the exact bytes", err == nil && ok && bytes.Equal(opened, screen))

	fmt.Println()
	if failures > 0 {
		fmt.Fprintf(os.Stderr, "%d of %d checks failed\n", failures, checks)
		os.Exit(1)
	}
	fmt.Printf("%d/%d checks pass.\n", checks, checks)
}
