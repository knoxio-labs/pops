import Foundation
import Testing

@testable import Auth
@testable import AuthTestSupport

@Suite("token storage")
struct TokenStoreTests {
    static func tokens(
        access: String = "access-token-value",
        refresh: String = "refresh-token-value"
    ) -> DeviceTokens {
        DeviceTokens(
            accessToken: access,
            refreshToken: refresh,
            accessTokenExpiresAt: Date(timeIntervalSince1970: 1_786_000_000)
        )
    }

    @Test("an empty store yields nothing")
    func loadBeforeSave() throws {
        #expect(try InMemoryTokenStore().load() == nil)
    }

    @Test("a saved pair round-trips intact")
    func saveThenLoad() throws {
        let store = InMemoryTokenStore()
        let saved = Self.tokens()

        try store.save(saved)

        #expect(try store.load() == saved)
    }

    @Test("saving replaces the previous pair rather than accumulating")
    func saveReplaces() throws {
        let store = InMemoryTokenStore()
        try store.save(Self.tokens(access: "first-access", refresh: "first-refresh"))

        try store.save(Self.tokens(access: "second-access", refresh: "second-refresh"))

        let loaded = try store.load()
        #expect(loaded?.accessToken == "second-access")
        #expect(loaded?.refreshToken == "second-refresh")
    }

    /// The whole point of ``TokenStore``. A refresh token surviving a wipe is
    /// not a smaller problem than no wipe at all — it is the same problem.
    @Test("wiping removes both tokens, not just the access token")
    func wipeIsTotal() throws {
        let store = InMemoryTokenStore(initial: Self.tokens())

        try store.wipe()

        #expect(try store.load() == nil)
    }

    @Test("wiping an empty store succeeds")
    func wipeIsIdempotent() throws {
        let store = InMemoryTokenStore()

        try store.wipe()
        try store.wipe()

        #expect(try store.load() == nil)
    }

    @Test("a store seeded at construction behaves like one that was saved to")
    func initialSeedIsLoadable() throws {
        let seeded = Self.tokens()

        #expect(try InMemoryTokenStore(initial: seeded).load() == seeded)
    }

    /// A token reaching a log is a credential leak with no other symptom, and
    /// the mistake is one interpolation wide. Both string conversions are
    /// asserted because `\(value)` and `String(reflecting:)` take different paths.
    @Test("string conversion never exposes token material")
    func tokensAreRedactedInDescriptions() {
        let tokens = Self.tokens(access: "SECRET-ACCESS", refresh: "SECRET-REFRESH")

        let interpolated = "\(tokens)"
        let reflected = String(reflecting: tokens)

        for rendering in [interpolated, reflected, tokens.description, tokens.debugDescription] {
            #expect(!rendering.contains("SECRET-ACCESS"))
            #expect(!rendering.contains("SECRET-REFRESH"))
        }
    }

    /// The store errors travel further than the tokens do — into logs and
    /// crash reports — so they must not carry anything either.
    @Test("store errors describe the failure without describing the credential")
    func errorsCarryNoSecrets() {
        let keychain = TokenStoreError.keychain(-25300)
        let corrupted = TokenStoreError.corruptedPayload

        #expect(keychain.description.contains("-25300"))
        #expect(!corrupted.description.isEmpty)
        #expect(DeviceKeyStoreError.keychain(-34018).description.contains("-34018"))
        #expect(DeviceKeyStoreError.signingFailed(code: -25308).description.contains("-25308"))
        #expect(
            DeviceKeyStoreError.secureEnclaveUnavailable(code: -26275).description.contains("-26275")
        )
    }

    /// `KeychainTokenStore` encodes with an ISO-8601 date strategy; a default
    /// decoder would read the same blob as a number and fail. The assertion is
    /// that the pair survives a real encode/decode cycle, not that a Date is a Date.
    @Test("the encoded payload decodes back to an identical pair")
    func payloadEncodingRoundTrips() throws {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let original = Self.tokens()

        let restored = try decoder.decode(DeviceTokens.self, from: encoder.encode(original))

        #expect(restored == original)
    }
}
