import Foundation
import Testing

@testable import Auth

/// The half of a cross-language contract that lives on this side.
///
/// The expected bytes below were not hand-assembled from the format's
/// description — that is the mistake the format's own file header warns about.
/// They were produced by running the BFM's `refreshSignatureMessage()` inputs
/// through `node:crypto` exactly as `pillars/bfm/src/api/auth/refresh-exchange.ts`
/// and `hashRefreshToken` in `db/services/refresh-tokens.ts` do:
///
/// ```
/// createHash('sha256').update(token, 'utf8').digest('hex')
/// Buffer.from(`BFM-REFRESH-V1\n${nonce}\n${hash}`, 'utf8')
/// ```
///
/// That makes this a real check of the Swift construction against the Node one
/// **at one point in time**. It is not a continuous one: nothing fails if the
/// BFM changes its format and this literal stays behind. Closing that needs the
/// vector committed where both languages read it — the arrangement
/// `clients/ios/Contracts/device-signature-v1.json` already has for the
/// encodings, which deliberately does not cover the message format. It is
/// tracked; until it lands, this suite is the only thing between a format
/// change and a fleet of handsets that 401 for no visible reason.
@Suite("RefreshSignatureMessage")
internal struct RefreshSignatureMessageTests {
    private static let nonce = "Zk9uY2UtZm9yLXRoZS10ZXN0LXZlY3Rvcg"
    private static let refreshToken = "pops-test-refresh-token-not-a-real-credential"
    private static let expectedBase64 = """
        QkZNLVJFRlJFU0gtVjEKWms5dVkyVXRabTl5TFhSb1pTMTBaWE4wTFhabFkzUnZjZwowZTY2YTA0NTkwODkyZWRk\
        NDJkMzQ0OGNlODExNDRmMjM3MDZhNmQyMmMyMGM1Nzg2ZDgyZGIzYzMwNzc5ZTBl
        """

    @Test("the message is byte-for-byte what the BFM builds")
    func matchesTheServerConstruction() throws {
        let expected = try #require(Data(base64Encoded: Self.expectedBase64))

        let built = RefreshSignatureMessage.bytes(
            nonce: Self.nonce,
            refreshToken: Self.refreshToken
        )

        #expect(built == expected)
    }

    @Test("the token appears in the message only as a digest")
    func neverCarriesTheTokenItself() throws {
        let built = RefreshSignatureMessage.bytes(
            nonce: Self.nonce,
            refreshToken: Self.refreshToken
        )
        let rendered = try #require(String(data: built, encoding: .utf8))

        #expect(!rendered.contains(Self.refreshToken))
        #expect(
            rendered.contains("0e66a04590892edd42d3448ce81144f23706a6d22c20c5786d82db3c30779e0e"))
    }

    @Test("exactly two separators, and no trailing newline")
    func hasTheExactSeparatorLayout() throws {
        let built = RefreshSignatureMessage.bytes(nonce: "n", refreshToken: "t")
        let rendered = try #require(String(data: built, encoding: .utf8))

        #expect(rendered.filter { $0 == "\n" }.count == 2)
        #expect(!rendered.hasSuffix("\n"))
        #expect(rendered.hasPrefix("\(RefreshSignatureMessage.domain)\n"))
    }

    @Test("the digest is lowercase hex, which is what Node's digest('hex') returns")
    func usesLowercaseHex() throws {
        let built = RefreshSignatureMessage.bytes(nonce: "n", refreshToken: "t")
        let rendered = try #require(String(data: built, encoding: .utf8))
        let digest = try #require(rendered.split(separator: "\n").last)

        #expect(digest.count == 64)
        #expect(digest.allSatisfy { $0.isHexDigit && !$0.isUppercase })
    }

    /// A different nonce has to produce a different signature, or a captured
    /// one authorises every refresh after it.
    @Test("the nonce is part of the message")
    func bindsTheNonce() {
        let first = RefreshSignatureMessage.bytes(nonce: "one", refreshToken: "t")
        let second = RefreshSignatureMessage.bytes(nonce: "two", refreshToken: "t")

        #expect(first != second)
    }

    /// And a different token has to as well, or a signature is transferable
    /// between the tokens of one family.
    @Test("the token is part of the message")
    func bindsTheToken() {
        let first = RefreshSignatureMessage.bytes(nonce: "n", refreshToken: "one")
        let second = RefreshSignatureMessage.bytes(nonce: "n", refreshToken: "two")

        #expect(first != second)
    }
}
