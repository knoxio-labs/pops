import Foundation
import Testing

@testable import Auth

/// The half of a cross-language contract that lives on this side.
///
/// The expected bytes are not written out here and were never hand-assembled
/// from the format's description — that is the mistake the format's own file
/// header warns about. They are read from
/// `clients/ios/Contracts/refresh-message-v1.json`, a vendored copy of the
/// vector the BFM generates from its own `refreshSignatureMessage()` and
/// asserts against in its own suite. Both languages therefore fail against the
/// same bytes: a format change on either side reddens a build instead of
/// shipping a fleet of handsets whose signatures stop verifying — a failure
/// that arrives as a `401` indistinguishable from an expired token.
@Suite("RefreshSignatureMessage")
internal struct RefreshSignatureMessageTests {
    let fixture: RefreshMessageFixture

    init() throws {
        fixture = try RefreshMessageFixture.load()
    }

    @Test("the message is byte-for-byte what the BFM builds")
    func matchesTheServerConstruction() {
        let built = RefreshSignatureMessage.bytes(
            nonce: fixture.nonce,
            refreshToken: fixture.refreshToken
        )

        #expect(built == fixture.message)
    }

    @Test("the domain prefix is the one the vector pins")
    func usesThePinnedDomain() {
        #expect(RefreshSignatureMessage.domain == fixture.domain)
    }

    @Test("the token appears in the message only as a digest")
    func neverCarriesTheTokenItself() throws {
        let built = RefreshSignatureMessage.bytes(
            nonce: fixture.nonce,
            refreshToken: fixture.refreshToken
        )
        let rendered = try #require(String(data: built, encoding: .utf8))

        #expect(!rendered.contains(fixture.refreshToken))
        #expect(rendered.contains(fixture.refreshTokenSha256Hex))
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
