import AppCore
import AppCoreFakes
import AuthTestSupport
import BFMClient
import Foundation
import Testing

@testable import Auth

/// The half of pairing that exists so a **later launch** can tell whether this
/// device is paired at all.
///
/// Split from `BFMDevicePairingServiceTests` because the two together outgrow
/// one file, not because the concern is different: the rule under both is that
/// however an attempt ended, the device holds nothing it cannot use.
@Suite("BFMDevicePairingService identity")
internal struct BFMDevicePairingIdentityTests {
    private struct Fixture {
        let service: BFMDevicePairingService
        let keyStore: any DeviceKeyStore
        let deviceStore: InMemoryPairedDeviceStore
    }

    private func fixture(
        exchange: ScriptedPairingExchange = ScriptedPairingExchange(),
        tokenStore: any TokenStore = InMemoryTokenStore(),
        deviceStore: InMemoryPairedDeviceStore = InMemoryPairedDeviceStore()
    ) -> Fixture {
        let keyStore = InMemoryKeyStore()
        return Fixture(
            service: BFMDevicePairingService(
                credentialStore: DeviceCredentialStore(
                    keyStore: keyStore,
                    tokenStore: tokenStore,
                    pairedDeviceStore: deviceStore
                ),
                exchange: { _ in exchange },
                now: { Date(timeIntervalSince1970: 1_700_000_000) }
            ),
            keyStore: keyStore,
            deviceStore: deviceStore
        )
    }

    /// What a cold launch reads. Without it the next launch shows the pairing
    /// screen to a device that is paired.
    @Test("a successful pairing records who this device now is")
    func successRecordsTheIdentity() async throws {
        let fixture = fixture()

        let device = try await fixture.service.pair(.fake(baseURL: .fakeBFM))

        #expect(try fixture.deviceStore.load() == device)
    }

    /// The identity is written after the tokens, so a token write that failed
    /// cannot leave a device that restores a session it has no credentials
    /// for.
    @Test("credentials that cannot be stored leave no identity behind either")
    func tokenFailureLeavesNoIdentity() async throws {
        let fixture = fixture(
            tokenStore: FailingTokenStore(wrapping: InMemoryTokenStore(), failing: [.save])
        )

        await #expect(throws: PairingError.credentialStorageFailed) {
            try await fixture.service.pair(.fake())
        }

        #expect(try fixture.deviceStore.load() == nil)
    }

    /// The mirror: the tokens landed and the identity did not. The device is
    /// registered on the server and cannot name it, which is the same
    /// unrecoverable-without-the-operator state a failed token write produces,
    /// and is reported the same way.
    @Test("an identity that cannot be stored is a credential-storage failure")
    func identityFailureIsCredentialStorageFailure() async throws {
        let deviceStore = InMemoryPairedDeviceStore()
        deviceStore.failWrites()
        let fixture = fixture(deviceStore: deviceStore)

        await #expect(throws: PairingError.credentialStorageFailed) {
            try await fixture.service.pair(.fake())
        }

        #expect(try fixture.keyStore.publicKey() == nil)
    }

    /// Pairing replaces a device's identity wholesale, so an identity from an
    /// earlier pairing must not outlive an attempt that failed — it would
    /// restore a session for a device the server no longer knows.
    @Test("an identity left by an earlier pairing is gone before the exchange runs")
    func previousIdentityIsWiped() async throws {
        let deviceStore = InMemoryPairedDeviceStore(initial: .fake(id: "stale-device"))
        let fixture = fixture(
            exchange: ScriptedPairingExchange(
                .failure(BFMClientError.pairingRefused(.codeRejected))),
            deviceStore: deviceStore
        )

        await #expect(throws: PairingError.codeRejected) { try await fixture.service.pair(.fake()) }

        #expect(try deviceStore.load() == nil)
    }
}
