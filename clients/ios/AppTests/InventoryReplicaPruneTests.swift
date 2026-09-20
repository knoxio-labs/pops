import AppCore
import Foundation
import InventoryReplica
import Testing

@testable import Pops

/// POPS-4176: a re-pair to a different BFM leaves the old device's replica
/// folder on disk forever — nothing ever removed one. Pruning must delete a
/// stale folder once nothing in its mutation log is still owed to a server,
/// but never one that still has something queued, and never the currently
/// paired device's own folder even when it happens to be the only sibling
/// on disk.
///
/// Runs against a disposable temporary directory rather than the real
/// Application Support tree `AppComposition` uses by default, via the
/// `root:` parameter `pruneStaleInventoryReplicas(keeping:root:)` takes for
/// exactly this reason.
@Suite("Stale Inventory replica pruning")
internal struct InventoryReplicaPruneTests {
    private func temporaryRoot() throws -> URL {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(
                "pops-replica-prune-tests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        return root
    }

    private func device(_ id: String) throws -> PairedDevice {
        PairedDevice(id: id, baseURL: try #require(URL(string: "https://bfm.invalid")))
    }

    @Test("a stale replica with nothing unsent is deleted")
    func staleReplicaWithNothingUnsentIsDeleted() throws {
        let root = try temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let staleFolder = root.appendingPathComponent("old-device", isDirectory: true)
        _ = try InventoryReplica(onDiskAt: staleFolder)

        AppComposition.pruneStaleInventoryReplicas(
            keeping: try device("current-device"), root: root)

        #expect(!FileManager.default.fileExists(atPath: staleFolder.path))
    }

    @Test("a stale replica with something still unsent is kept")
    func staleReplicaWithUnsentMutationIsKept() throws {
        let root = try temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let staleFolder = root.appendingPathComponent("old-device", isDirectory: true)
        let replica = try InventoryReplica(onDiskAt: staleFolder)
        _ = try replica.perform(
            .createLocation(
                InventoryNewLocation(
                    id: UUID().uuidString, name: "Kitchen", parentId: nil, sortOrder: 0)),
            mutationId: "mutation-1", clientTime: Date())

        AppComposition.pruneStaleInventoryReplicas(
            keeping: try device("current-device"), root: root)

        #expect(FileManager.default.fileExists(atPath: staleFolder.path))
    }

    @Test("the currently paired device's own folder is never pruned")
    func currentDeviceFolderIsNeverPruned() throws {
        let root = try temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let current = try device("current-device")
        let ownFolder = root.appendingPathComponent(
            AppComposition.inventoryFolderName(for: current), isDirectory: true)
        _ = try InventoryReplica(onDiskAt: ownFolder)

        AppComposition.pruneStaleInventoryReplicas(keeping: current, root: root)

        #expect(FileManager.default.fileExists(atPath: ownFolder.path))
    }

    @Test("a root that has nothing under it yet prunes nothing and does not crash")
    func missingRootDoesNothing() throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("pops-replica-prune-missing-\(UUID().uuidString)")

        AppComposition.pruneStaleInventoryReplicas(
            keeping: try device("current-device"), root: root)
    }
}
