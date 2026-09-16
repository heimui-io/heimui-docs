package io.heimui.signing

import java.math.BigInteger
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.Signature
import java.security.interfaces.ECPrivateKey
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.security.spec.PKCS8EncodedKeySpec
import java.security.spec.X509EncodedKeySpec
import java.util.Base64

/**
 * Signs HeimUI screens: ES256, in the JWS format the SDK verifies.
 *
 * One signature, two ways to deliver it:
 *
 * - [signDetached] is the `X-Heim-Signature` header for a response whose body is exactly those bytes.
 *   What a service that answers the device sends.
 * - [seal] is the screen with its signature wrapped around it. What goes in a bucket or on a CDN,
 *   which cannot send a header of its own.
 *
 * Sign last. Whatever produces the bytes -- hydration, localisation, serialisation -- runs first, and
 * nothing touches the body afterwards: the app verifies the bytes it receives, one by one.
 *
 * [verifyDetached] and [openSealed] are the checks the SDK makes, for your tests. The device never
 * needs them from you.
 *
 * The JDK only: `java.security` has had ECDSA on P-256 since long before anything here.
 */
class HeimScreenSigner private constructor(
    private val privateKey: PrivateKey,
    val publicKey: ECPublicKey,
) {
    /** What the app puts in `HeimConfig.trustedSigningKeys`. */
    val publicKeyPem: String = pem("PUBLIC KEY", publicKey.encoded)

    /** RFC 7638 thumbprint: the `kid` a signature names. The SDK derives the same value. */
    val keyId: String = thumbprint(publicKey)

    private val protectedHeader = base64Url("""{"alg":"ES256","kid":"$keyId"}""".toByteArray())

    fun signDetached(body: ByteArray): String =
        "$protectedHeader..${sign("$protectedHeader.${base64Url(body)}")}"

    fun seal(body: ByteArray): String {
        val payload = base64Url(body)
        return """{"protected":"$protectedHeader","payload":"$payload","signature":"${sign("$protectedHeader.$payload")}"}"""
    }

    private fun sign(signingInput: String): String {
        // P1363 is r || s, which JWS defines for ES256. Plain "SHA256withECDSA" returns DER, and the
        // SDK refuses DER on purpose: two encodings of one signature must not both verify.
        val raw = Signature.getInstance("SHA256withECDSAinP1363Format").run {
            initSign(privateKey)
            update(signingInput.toByteArray(Charsets.US_ASCII))
            sign()
        }
        return base64Url(raw)
    }

    companion object {
        private val P256_ORDER =
            BigInteger("FFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551", 16)

        /** Reads a PKCS#8 private key: `-----BEGIN PRIVATE KEY-----`. */
        fun fromPem(text: String): HeimScreenSigner {
            require(!text.contains("-----BEGIN EC PRIVATE KEY-----")) {
                "the key is in SEC1 form; convert it: openssl pkcs8 -topk8 -nocrypt -in key.pem"
            }
            val der = block(text, "PRIVATE KEY")
                ?: throw IllegalArgumentException("there is no -----BEGIN PRIVATE KEY----- block")
            val factory = KeyFactory.getInstance("EC")
            val privateKey = factory.generatePrivate(PKCS8EncodedKeySpec(der)) as ECPrivateKey
            require(privateKey.params.order == P256_ORDER) { "ES256 needs a P-256 key" }

            // The public half is normally in a PUBLIC KEY block beside it. Append it once, with
            // `openssl pkey -in key.pem -pubout`, and every language reads the same file.
            val publicDer = block(text, "PUBLIC KEY")
                ?: throw IllegalArgumentException("append the public half: openssl pkey -in key.pem -pubout")
            val publicKey = factory.generatePublic(X509EncodedKeySpec(publicDer)) as ECPublicKey
            return HeimScreenSigner(privateKey, publicKey)
        }

        /** A new key. Print [publicKeyPem] once and put it in the app; keep the file to yourself. */
        fun generate(): Pair<HeimScreenSigner, String> {
            val pair = KeyPairGenerator.getInstance("EC")
                .apply { initialize(ECGenParameterSpec("secp256r1")) }
                .generateKeyPair()
            val signer = HeimScreenSigner(pair.private, pair.public as ECPublicKey)
            val file = pem("PRIVATE KEY", pair.private.encoded) + "\n" + signer.publicKeyPem
            return signer to file
        }

        /** Whether [header] is a detached ES256 signature by [publicKeyPem] over exactly [body]. */
        fun verifyDetached(publicKeyPem: String, body: ByteArray, header: String?): Boolean {
            val parts = header?.split(".") ?: return false
            if (parts.size != 3 || parts[1].isNotEmpty()) return false
            return check(publicKeyPem, parts[0], base64Url(body), parts[2])
        }

        /** The screen inside a sealed copy when its signature holds, otherwise null. */
        fun openSealed(publicKeyPem: String, sealed: String): ByteArray? {
            fun field(name: String): String? =
                Regex("\"$name\"\\s*:\\s*\"([A-Za-z0-9_-]*)\"").find(sealed)?.groupValues?.get(1)

            val protectedHeader = field("protected") ?: return null
            val payload = field("payload") ?: return null
            val signature = field("signature") ?: return null
            if (!check(publicKeyPem, protectedHeader, payload, signature)) return null
            return decodeCanonical(payload)
        }

        private fun check(publicKeyPem: String, protectedHeader: String, payload: String, signature: String): Boolean {
            val headerBytes = decodeCanonical(protectedHeader) ?: return false
            if (decodeCanonical(payload) == null) return false
            val header = String(headerBytes)
            // Exactly ES256 -- never "none", never whatever the header asks for -- and nothing
            // half-understood. A real JSON parser is better than this; the rules are what matter.
            if (!header.contains("\"alg\":\"ES256\"") || header.contains("\"crit\"") || header.contains("\"b64\"")) return false

            val der = block(publicKeyPem, "PUBLIC KEY") ?: return false
            val key = runCatching { KeyFactory.getInstance("EC").generatePublic(X509EncodedKeySpec(der)) as ECPublicKey }
                .getOrNull() ?: return false
            if (!header.contains("\"kid\":\"${thumbprint(key)}\"")) return false

            val raw = decodeCanonical(signature) ?: return false
            if (raw.size != 64) return false
            return runCatching {
                Signature.getInstance("SHA256withECDSAinP1363Format").run {
                    initVerify(key)
                    update("$protectedHeader.$payload".toByteArray(Charsets.US_ASCII))
                    verify(raw)
                }
            }.getOrDefault(false)
        }

        private fun thumbprint(key: ECPublicKey): String {
            fun coordinate(value: BigInteger): String {
                val bytes = value.toByteArray()
                val fixed = when {
                    bytes.size == 32 -> bytes
                    bytes.size > 32 -> bytes.copyOfRange(bytes.size - 32, bytes.size)
                    else -> ByteArray(32 - bytes.size) + bytes
                }
                return base64Url(fixed)
            }
            val canonical = """{"crv":"P-256","kty":"EC","x":"${coordinate(key.w.affineX)}","y":"${coordinate(key.w.affineY)}"}"""
            return base64Url(MessageDigest.getInstance("SHA-256").digest(canonical.toByteArray()))
        }

        /** Canonical, unpadded base64url, or null: two spellings of one payload must not both verify. */
        private fun decodeCanonical(text: String): ByteArray? {
            val raw = runCatching { Base64.getUrlDecoder().decode(text) }.getOrNull() ?: return null
            return if (base64Url(raw) == text) raw else null
        }

        private fun base64Url(bytes: ByteArray): String =
            Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)

        private fun block(text: String, type: String): ByteArray? {
            val begin = "-----BEGIN $type-----"
            val end = "-----END $type-----"
            val from = text.indexOf(begin).takeIf { it >= 0 } ?: return null
            val to = text.indexOf(end, from).takeIf { it >= 0 } ?: return null
            return runCatching { Base64.getMimeDecoder().decode(text.substring(from + begin.length, to)) }.getOrNull()
        }

        private fun pem(type: String, der: ByteArray): String =
            "-----BEGIN $type-----\n" +
                Base64.getMimeEncoder(64, "\n".toByteArray()).encodeToString(der) +
                "\n-----END $type-----"
    }
}
