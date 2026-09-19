import AppCore
import Auth
import FeatureInventory
import Foundation
import InventoryReplica
import Testing

@testable import Pops

/// What the composition root binds for Inventory, and where a
/// `pops://inventory/...` reference goes once routed. Here rather than in a
/// package because `App/` is in no package; see `AppTests/README.md`.
@Suite("Inventory composition")
@MainActor
internal struct InventoryCompositionTests {
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

    @Test("a paired device reads and writes Inventory through the local-first store")
    func pairedDeviceGetsTheLocalFirstStore() throws {
        let bound = composition().dependencies(for: try device())

        #expect(bound.inventory is LocalFirstInventoryStore)
    }

    /// The default opener, as the app runs it: on disk, under Application
    /// Support, in a folder of the device's own.
    @Test("a paired device's replica lives on disk under Application Support")
    func replicaIsOnDisk() throws {
        let device = try device()
        let support = try FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil,
            create: true)
        let folder = support.appendingPathComponent("Inventory/device-inventory-composition")
        defer { try? FileManager.default.removeItem(at: folder) }

        let replica = try AppComposition.onDiskInventoryReplica(for: device)

        #expect(
            replica.mediaCacheDirectory?.deletingLastPathComponent().standardized.path
                == folder.standardized.path)
        #expect(
            FileManager.default.fileExists(
                atPath: folder.appendingPathComponent("inventory.sqlite").path))
    }

    @Test(
        "a device id becomes one folder name, never a path",
        arguments: [
            ("device-1_a", "device-1_a"), ("../etc", "___etc"), ("a/b", "a_b"), ("", "_"),
        ])
    func folderNameIsOneComponent(id: String, folder: String) throws {
        let device = PairedDevice(id: id, baseURL: try #require(URL(string: "https://bfm.invalid")))

        #expect(AppComposition.inventoryFolderName(for: device) == folder)
    }

    /// Reading still works while the phone is full, so Inventory is not
    /// "unavailable": every write says Storage full instead.
    @Test("no room to open the replica binds a store whose writes say Storage full")
    func storageFullBindsTheStorageFullStore() async throws {
        let bound = composition(openInventoryReplica: { _ in throw InventoryStorageError.full })
            .dependencies(for: try device())

        #expect(bound.inventory is StorageFullInventoryStore)
        await #expect(throws: InventoryStorageError.full) {
            _ = try await bound.inventory.perform(.deleteLocation(id: "anything"))
        }
        await #expect(throws: InventoryStorageError.full) {
            try await bound.inventory.download()
        }
        var statuses = bound.inventory.status().makeAsyncIterator()
        #expect(await statuses.next() == .empty)
    }

    @Test("any other failure to open the replica binds the unbound store")
    func otherOpenFailureIsUnbound() throws {
        let bound = composition(openInventoryReplica: { _ in throw CocoaError(.fileNoSuchFile) })
            .dependencies(for: try device())

        #expect(bound.inventory is UnboundInventoryStore)
    }

    /// The pairing screen has no BFM to reach, so Inventory is the unbound
    /// store: every write fails as not bound rather than going nowhere.
    @Test("before pairing, Inventory is the unbound store")
    func unpairedGetsTheUnboundStore() async {
        let unpaired = composition().pairingDependencies

        #expect(unpaired.inventory is UnboundInventoryStore)
        #expect(!(unpaired.inventory is LocalFirstInventoryStore))
        await #expect(throws: RepositoryError.dependencyNotBound) {
            _ = try await unpaired.inventory.perform(.deleteLocation(id: "anything"))
        }
    }

    /// One replica per paired device for the life of the process: a second
    /// store would download the catalogue again and forget the first one's
    /// Undo offers.
    @Test("the same device keeps the same store across body evaluations")
    func storeIsStablePerDevice() throws {
        let root = composition()
        let device = try device()

        let first = root.dependencies(for: device).inventory
        let second = root.dependencies(for: device).inventory

        let firstStore = try #require(first as? LocalFirstInventoryStore)
        #expect(firstStore === (second as? LocalFirstInventoryStore))
    }

    @Test("this build can draw the Inventory feature, under its own name and icon")
    func inventoryIsRenderable() {
        #expect(RootFeature.renderable.contains(FeatureInventory.feature))
        #expect(RootCopy.name(of: FeatureInventory.feature) == "Inventory")
        #expect(RootCopy.symbol(for: FeatureInventory.feature) == "shippingbox")
    }

    @Test("an item's pops URL routes to that item's detail")
    func itemURLPresentsTheItem() throws {
        let root = composition()
        let url = try #require(URL(string: "pops://inventory/item/tv-1"))

        let outcome = handleOpenPopsURL(url, router: root.entityRouter)

        #expect(outcome == .handled)
        #expect(root.entityPresentation.inventory == .item("tv-1"))
    }

    @Test("a place's pops URL routes to that place")
    func locationURLPresentsThePlace() throws {
        let root = composition()
        let url = try #require(URL(string: "pops://inventory/location/kitchen"))

        #expect(handleOpenPopsURL(url, router: root.entityRouter) == .handled)
        #expect(root.entityPresentation.inventory == .location("kitchen"))
    }

    /// Only the types Inventory draws are registered, so anything else under
    /// the pillar is still the approved hand-off rather than an empty sheet.
    @Test("an Inventory type with no screen is handed off, and opens nothing")
    func unknownInventoryTypeIsHandedOff() throws {
        let root = composition()
        let url = try #require(URL(string: "pops://inventory/container/box-1"))

        #expect(
            handleOpenPopsURL(url, router: root.entityRouter) == .unsupported(pillar: "inventory"))
        #expect(root.entityPresentation.inventory == nil)
    }

    private func device() throws -> PairedDevice {
        PairedDevice(
            id: "device-inventory-composition",
            baseURL: try #require(URL(string: "https://bfm.invalid"))
        )
    }

    private static let namespace = "com.knoxiolabs.pops.tests.inventory-composition"
}
