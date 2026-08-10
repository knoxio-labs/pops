import AppCore
import AppCoreFakes
import AuthTestSupport
import Foundation
import Testing

@testable import Auth

/// What a cold launch resolves to, for every combination of what the device
/// still has.
///
/// The half-states are the point. Each of them is reachable — a wipe that
/// partially failed, a keychain that survived a reinstall, a build that changed
/// the stored shape — and each of them has to resolve to the pairing screen
/// rather than to a shell whose every request fails.
@Suite("DeviceSessionRestorer")
internal struct DeviceSessionRestorerTests {
    private static func tokens() -> DeviceTokens {
        DeviceTokens(
            accessToken: "access",
            refreshToken: "refresh",
            accessTokenExpiresAt: Date(timeIntervalSince1970: 1_786_000_000)
        )
    }

    private func restorer(
        device: PairedDevice?,
        tokens: DeviceTokens?
    ) -> DeviceSessionRestorer {
        DeviceSessionRestorer(
            credentialStore: DeviceCredentialStore(
                keyStore: InMemoryKeyStore(),
                tokenStore: InMemoryTokenStore(initial: tokens),
                pairedDeviceStore: InMemoryPairedDeviceStore(initial: device)
            )
        )
    }

    @Test("a device with both halves resumes its session")
    func bothHalvesPresent() async {
        let device = PairedDevice.fake(id: "device-7")

        let state = await restorer(device: device, tokens: Self.tokens()).restoredSession()

        #expect(state == .paired(device))
    }

    @Test("a fresh install has nothing to resume")
    func nothingStored() async {
        #expect(await restorer(device: nil, tokens: nil).restoredSession() == .unpaired)
    }

    /// Tokens with no identity name no BFM to send them to. A Release build
    /// ships no hostname, so this device has forgotten the only thing that
    /// would let it ask anybody anything.
    @Test("tokens with no identity are not a session")
    func tokensWithoutIdentity() async {
        #expect(await restorer(device: nil, tokens: Self.tokens()).restoredSession() == .unpaired)
    }

    /// The mirror case, which is what a keychain wipe that succeeded while the
    /// identity write failed leaves behind.
    @Test("an identity with no tokens is not a session")
    func identityWithoutTokens() async {
        #expect(await restorer(device: .fake(), tokens: nil).restoredSession() == .unpaired)
    }

    /// A read that throws must not propagate: this runs before the first frame,
    /// and the only two things the root can do are show pairing or show
    /// content.
    @Test("storage that cannot be read resolves to unpaired rather than throwing")
    func unreadableStorage() async {
        let restorer = DeviceSessionRestorer(
            credentialStore: DeviceCredentialStore(
                keyStore: InMemoryKeyStore(),
                tokenStore: FailingLoadTokenStore(),
                pairedDeviceStore: InMemoryPairedDeviceStore(initial: .fake())
            )
        )

        #expect(await restorer.restoredSession() == .unpaired)
    }
}

/// A ``TokenStore`` whose reads always fail — a keychain locked, or a payload
/// this build cannot decode.
private struct FailingLoadTokenStore: TokenStore {
    func load() throws -> DeviceTokens? { throw TokenStoreError.corruptedPayload }
    func save(_ tokens: DeviceTokens) throws {}
    func wipe() throws {}
}
