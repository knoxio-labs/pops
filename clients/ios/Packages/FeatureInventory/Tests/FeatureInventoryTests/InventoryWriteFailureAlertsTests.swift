import AppCore
import Foundation
import Testing

@testable import FeatureInventory

/// POPS-4192: a storage-full write must never surface through the one-line
/// write-failure alert: it gets the approved Storage full alert instead, the
/// same one the Sync page shows. These two pure functions are the whole of
/// that routing decision, so they are what a regression here would change.
@Suite("Inventory write failure alert routing")
internal struct InventoryWriteFailureAlertsTests {
    @Test("a storage-full failure is excluded from the generic alert")
    func storageFullExcludedFromGenericAlert() {
        #expect(InventoryWriteFailureAlerts.genericFailure(.storageFull) == nil)
    }

    @Test("every other failure still reaches the generic alert")
    func otherFailuresReachGenericAlert() {
        let repository = InventoryWriteFailure.repository(.transport("timed out"))
        let command = InventoryWriteFailure.command(.nothingToUndo)
        #expect(InventoryWriteFailureAlerts.genericFailure(repository) == repository)
        #expect(InventoryWriteFailureAlerts.genericFailure(command) == command)
    }

    @Test("nothing to show maps to nothing on both alerts")
    func nilFailureMapsToNilOnBoth() {
        #expect(InventoryWriteFailureAlerts.genericFailure(nil) == nil)
        #expect(InventoryWriteFailureAlerts.storageFullFailure(nil) == nil)
    }

    @Test("only a storage-full failure reaches the dedicated alert")
    func onlyStorageFullReachesTheDedicatedAlert() {
        let repository = InventoryWriteFailure.repository(.transport("timed out"))
        #expect(InventoryWriteFailureAlerts.storageFullFailure(.storageFull) == .storageFull)
        #expect(InventoryWriteFailureAlerts.storageFullFailure(repository) == nil)
        #expect(InventoryWriteFailureAlerts.storageFullFailure(.command(.nothingToUndo)) == nil)
    }
}

/// POPS-4192: every screen that keeps an `InventoryWriteFailure` presents it
/// through `inventoryWriteFailureAlerts`, rather than a copy of the one-line
/// alert that would show Storage full as a generic failure. Which modifier a
/// view attaches is not observable from a model, so this reads each file,
/// the technique the other `*WiringTests` suites in this package use.
@Suite("Inventory write failure alert wiring")
internal struct InventoryWriteFailureAlertsWiringTests {
    private static let presenters = [
        "Picker/InventoryRunnerChrome.swift",
        "Form/InventoryItemFormView.swift",
        "Detail/InventoryItemDetailScreen.swift",
        "Sync/InventoryRepairScreen.swift",
        "Browse/InventoryRecordActions.swift",
    ]

    private static func source(_ relativePath: String) -> String {
        let path = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "Sources/FeatureInventory")
            .appending(path: relativePath)
        return (try? String(contentsOf: path, encoding: .utf8)) ?? ""
    }

    @Test("the scan is reading each presenter's actual source", arguments: presenters)
    func scanIsWiredUp(_ file: String) {
        #expect(!Self.source(file).isEmpty, "\(file) is empty or missing")
    }

    @Test("each presenter routes its failure through the shared alerts", arguments: presenters)
    func routesThroughSharedAlerts(_ file: String) {
        let source = Self.source(file)
        #expect(source.contains("inventoryWriteFailureAlerts("), "\(file) skips the shared alerts")
        #expect(
            !source.contains("InventoryCopy.failureTitle"),
            "\(file) builds its own write-failure alert")
    }
}
