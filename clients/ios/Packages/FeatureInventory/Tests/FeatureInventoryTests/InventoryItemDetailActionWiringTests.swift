import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeatureInventory

/// Proof that Item detail's Move and Store here open through the shared
/// placement picker, the shared command runner and `InventoryStoreHereSheet`
/// rather than the generic pending placeholder, and that Store here's New
/// item step opens the real create form rather than its own placeholder.
///
/// There is nothing here to mount: these screens read from the environment
/// and from `@State` a unit-test process hosts no SwiftUI context for (see
/// `InventoryItemsBrowserNewItemWiringTests` for the same constraint). So
/// this reads the source directly, the same way that suite does, and fails
/// the moment any of the three call sites stops reaching for the shared
/// seam or a placeholder creeps back in.
@MainActor
@Suite("Item detail action wiring")
internal struct InventoryItemDetailActionWiringTests {
    private typealias Fixture = InventoryFixture

    private static func detailRecord(access: InventoryAccess? = nil) async throws
        -> InventoryDetailRecord
    {
        let item = Fixture.item("tv", "Television", at: .location("living"), access: access)
        let store = RecordingInventoryStore(
            InMemoryInventoryStore(
                items: [item], locations: [Fixture.location("living", "Living room")]))
        let model = InventoryItemDetailViewModel(itemId: "tv", store: store)
        let (task, loaded) = await model.startAndAwaitDetail()
        task.cancel()
        return try #require(loaded?.record)
    }

    private static func lines(_ relativePath: String) -> [String] {
        let url = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "Sources/FeatureInventory/\(relativePath)")
        let text = (try? String(contentsOf: url, encoding: .utf8)) ?? ""
        return text.components(separatedBy: "\n")
    }

    private static let detailView = lines("Detail/InventoryItemDetailView.swift")
    private static let action = lines("Detail/InventoryAction.swift")
    private static let storeHereSheet = lines("Picker/InventoryStoreHereSheet.swift")

    @Test("the three touched files are reading real source")
    func filesAreWiredUp() {
        #expect(Self.detailView.count > 1, "InventoryItemDetailView.swift is empty or missing")
        #expect(Self.action.count > 1, "InventoryAction.swift is empty or missing")
        #expect(Self.storeHereSheet.count > 1, "InventoryStoreHereSheet.swift is empty or missing")
    }

    @Test("the item's move request names it and carries only its own id")
    func moveRequestNamesTheItem() async throws {
        let record = try await Self.detailRecord()

        let request = InventoryItemDetailPlacement.moveRequest(for: record)

        #expect(request.subject == .items(["tv"]))
        #expect(request.title == "Television")
        #expect(request.verb == .move)
    }

    @Test("the item's store target is itself, as a container")
    func storeTargetIsTheItemsOwnContainer() async throws {
        let record = try await Self.detailRecord(access: .open)

        let target = InventoryItemDetailPlacement.storeTarget(for: record)

        #expect(target == .container(id: "tv", name: "Television"))
    }

    @Test("Move issues a placement request through the item's own runner")
    func moveOpensThePlacementPicker() {
        #expect(
            Self.detailView.contains {
                $0.contains("InventoryItemDetailPlacement.moveRequest(for: detail.record)")
            },
            Comment(rawValue: "Move no longer builds a single-item placement request"))
        #expect(
            Self.detailView.contains {
                $0.contains(".inventoryPlacementPicker($moving, runner: model.runner)")
            },
            Comment(
                rawValue:
                    "InventoryItemDetailView no longer installs the shared placement picker"))
        #expect(
            Self.detailView.contains { $0.contains(".inventoryRunnerChrome(model.runner)") },
            Comment(
                rawValue:
                    "InventoryItemDetailView no longer shows the runner's Undo capsule and "
                    + "failure alert"))
    }

    @Test("Store here presents the shared sheet with a container target")
    func storeHereOpensTheSharedSheet() {
        #expect(
            Self.detailView.contains { $0.contains("storing = true") },
            Comment(rawValue: "Put something in no longer flips the Store here sheet"))
        #expect(
            Self.detailView.contains {
                $0.contains("InventoryItemDetailPlacement.storeTarget(for: detail.record)")
            },
            Comment(
                rawValue:
                    "InventoryItemDetailView no longer derives an InventoryStoreTarget from the "
                    + "item it is showing"))
    }

    @Test("Item detail's own pending screen no longer stands in for Move or Store here")
    func pendingNoLongerCoversMoveOrStoreHere() {
        #expect(
            !Self.action.contains { $0.contains("case move") },
            Comment(rawValue: "InventoryItemDetailPending still has a placeholder move case"))
        #expect(
            !Self.action.contains { $0.contains("case storeHere") },
            Comment(
                rawValue: "InventoryItemDetailPending still has a placeholder storeHere case"))
    }

    @Test("Store here's New item step opens the real create form")
    func newItemOpensTheRealForm() {
        #expect(
            Self.storeHereSheet.contains {
                $0.contains("itemForm?(.create(placement: target.placement))")
            },
            Comment(
                rawValue:
                    "InventoryStoreHereSheet's New item step no longer opens the create form "
                    + "placed in the target"))
        #expect(
            Self.storeHereSheet.contains {
                $0.contains("@Environment(\\.inventoryItemForm)")
            },
            Comment(
                rawValue: "InventoryStoreHereSheet no longer reads the shared item-form seam"))
        #expect(
            Self.storeHereSheet.contains { $0.contains(".inventoryItemFormPresentation(") },
            Comment(
                rawValue:
                    "InventoryStoreHereSheet no longer installs its own item-form presentation, "
                    + "so New item would reach for an ancestor's sheet that this one already "
                    + "covers"))
        #expect(
            !Self.storeHereSheet.contains { $0.contains("InventoryPendingScreen") },
            Comment(
                rawValue:
                    "InventoryStoreHereSheet still references InventoryPendingScreen — New item "
                    + "should open the real form, not a placeholder"))
    }
}
