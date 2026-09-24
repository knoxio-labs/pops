import AppCore
import Auth
import FeatureInventory
import Foundation
import InventoryReplica
import Testing

@testable import Pops

/// POPS-4354: Inventory used to sit empty after pairing until something else
/// asked for a sync — backgrounding, a pull to refresh, or opening the Sync
/// page's own Download action. `RootView` now asks
/// `syncInventoryOnPairing(_:)` for both the pairing that just happened and a
/// launch that restores a device already paired, since `.task(id:)` runs for
/// the initial value too; both moments reach this one method, so one set of
/// tests here covers both. Here rather than in a package because `App/` is in
/// no package.
@Suite("Inventory sync on pairing")
@MainActor
internal struct InventoryPairingSyncTests {
    private func composition(
        openInventoryReplica: @escaping (PairedDevice) throws -> InventoryReplica = { _ in
            try InventoryReplica()
        }
    ) -> AppComposition {
        AppComposition(
            credentialStore: DeviceCredentialStore(
                keyStore: SecureEnclaveKeyStore(),
                tokenStore: KeychainTokenStore(service: Self.namespace),
                pairedDeviceStore: UserDefaultsPairedDeviceStore(suiteName: Self.namespace)
            ),
            openInventoryReplica: openInventoryReplica
        )
    }

    /// The race this fixes: `ContentView` only binds a paired device's
    /// dependencies once the shell has a `FeatureSurface` to draw, which is
    /// after `loadBootstrap()` answers — later than the moment a device is
    /// paired. `syncInventoryOnPairing` binds the device itself rather than
    /// reading a store `ContentView` has not necessarily created yet.
    @Test("syncing on pairing binds the device itself, without ContentView asking first")
    func bindsWithoutContentViewAsking() async throws {
        let root = composition(openInventoryReplica: { _ in throw InventoryStorageError.full })
        #expect(!root.inventoryStorageFull)

        await root.syncInventoryOnPairing(try device())

        #expect(root.inventoryStorageFull)
    }

    @Test("syncing on pairing does not rebind a device already bound")
    func doesNotRebindAnAlreadyBoundDevice() async throws {
        let root = composition()
        let device = try device()
        let bound = try #require(
            root.dependencies(for: device).inventory as? LocalFirstInventoryStore)

        await root.syncInventoryOnPairing(device)

        let rebound = root.dependencies(for: device).inventory as? LocalFirstInventoryStore
        #expect(bound === rebound)
    }

    @Test("syncing on pairing a healthy replica completes without throwing")
    func syncsAHealthyReplicaWithoutThrowing() async throws {
        let root = composition()

        await root.syncInventoryOnPairing(try device())

        #expect(root.dependencies(for: try device()).inventory is LocalFirstInventoryStore)
    }

    /// `RootView`'s own guard (`guard let pairedDevice else { return }`,
    /// mirroring the one already governing `pruneStaleInventoryReplicas`)
    /// is what keeps this from ever being called while unpaired — there is
    /// no `PairedDevice` to pass it. Nothing to bind means nothing to sync:
    /// `AppComposition`'s existing `nothingBoundRecordsNoStorageFull` and
    /// `unpairedGetsTheUnboundStore` (`InventoryCompositionTests`) already
    /// pin that an unbound composition has nothing bound.
    private func device() throws -> PairedDevice {
        PairedDevice(
            id: "device-pairing-sync",
            baseURL: try #require(URL(string: "https://bfm.invalid"))
        )
    }

    private static let namespace = "com.knoxiolabs.pops.tests.inventory-pairing-sync"
}
