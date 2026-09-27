import AppCore
import Foundation
import Testing

@testable import FeatureInventory

@Suite("Inventory write failure presentation")
internal struct InventoryWriteFailureAlertsTests {
    @Test("storage-full writes become a non-retryable local failure")
    func storageFullPresentation() {
        let error = InventoryWriteFailure.storageFull.popsError

        #expect(error.code == "ios.storage.full")
        #expect(error.message == InventoryCopy.storageFullMessage)
        #expect(!error.retryable)
    }

    @Test("structured repository failures keep their ADR-054 fields")
    func structuredRepositoryPresentation() {
        let source = PopsError(
            code: "inventory.items.unavailable",
            message: "Inventory is unavailable.",
            requestID: "request-1",
            retryable: true,
            kind: .server)

        let error = InventoryWriteFailure.repository(.transport(source)).popsError

        #expect(error == source)
    }

    @Test("server rejection messages reach the shared error presenter")
    func commandRejectionPresentation() {
        let message = "The catalogue is out of date. Refresh and try again."
        let refusal = InventoryCommandError.rejected(reason: .invalid, message: message)
        let error = InventoryWriteFailure.command(refusal).popsError

        #expect(error.code == "ios.inventory.command_rejected")
        #expect(error.message == message)
        #expect(error.kind == .client)
        #expect(!error.retryable)
    }
}

/// POPS-4192: every screen that keeps an `InventoryWriteFailure` presents it
/// through `inventoryWriteFailureAlerts`, rather than a local alert. Which modifier a
/// view attaches is not observable from a model, so this reads each file,
/// the technique the other `*WiringTests` suites in this package use.
@Suite("Inventory write failure presenter wiring")
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

    @Test("each presenter routes its failure through the shared presenter", arguments: presenters)
    func routesThroughSharedAlerts(_ file: String) {
        let source = Self.source(file)
        #expect(
            source.contains("inventoryWriteFailureAlerts("),
            "\(file) skips the shared presenter")
        #expect(
            !source.contains("InventoryCopy.failureTitle"),
            "\(file) builds its own write-failure alert")
    }
}
