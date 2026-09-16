import DesignSystem
import SwiftUI

/// The full in-hand list: everything picked up and not yet put anywhere,
/// past what the dashboard's compact section has room for.
///
/// Partitioned by what needs attention rather than shown as one undivided
/// list. A conflict and a queued move are not ordinary "in hand" rows: they
/// are the two things retrieval can fail to finish quietly, and burying them
/// in the plain list is how a reviewer misses that they need a different
/// response.
internal struct InventoryInHandListView: View {
    @State private var items: [InventoryRetrievalItem]
    @State private var moveTarget: InventoryRetrievalItem?

    internal init(items: [InventoryRetrievalItem]) {
        _items = State(initialValue: items)
    }

    internal var body: some View {
        List {
            conflictedSection
            inProgressSection
            inHandSection
        }
        .playgroundInsetGroupedList()
        .tint(.popsInventory)
        .sheet(item: $moveTarget) { retrieval in
            InventoryDestinationPickerSheet(
                itemName: retrieval.item.name,
                recent: Self.recentDestinations,
                containers: Self.containerDestinations,
                locations: Self.locationDestinations,
                onChoose: { _ in moveTarget = nil }
            )
        }
    }

    @ViewBuilder private var conflictedSection: some View {
        if !conflicted.isEmpty {
            Section("Needs a look") {
                ForEach(conflicted) { retrieval in
                    InventoryRepairRow(
                        item: retrieval.item,
                        problem: "The server disagreed about where this ended up.",
                        resolution: "Choose where it is")
                }
            }
        }
    }

    @ViewBuilder private var inProgressSection: some View {
        if !inProgress.isEmpty {
            Section("In progress") {
                ForEach(inProgress) { retrieval in
                    InventoryMoveProgressNotice(
                        item: retrieval.item, destination: destinationName(retrieval))
                }
            }
        }
    }

    private var inHandSection: some View {
        Section("In hand") {
            if settled.isEmpty {
                EmptyStateView(message: "Nothing in hand. Pick something up to see it here.")
            } else {
                ForEach(settled) { retrieval in
                    InventoryFullInHandRow(
                        retrieval: retrieval,
                        onPutBack: { putBack(retrieval) },
                        onMove: { moveTarget = retrieval }
                    )
                }
            }
        }
    }

    private var conflicted: [InventoryRetrievalItem] {
        items.filter { $0.item.sync == .needsAttention }
    }

    private var inProgress: [InventoryRetrievalItem] {
        items.filter { $0.item.sync == .queued || $0.item.sync == .synchronizing }
    }

    private var settled: [InventoryRetrievalItem] {
        items.filter {
            $0.item.sync != .needsAttention && $0.item.sync != .queued
                && $0.item.sync != .synchronizing
        }
    }

    private func destinationName(_ retrieval: InventoryRetrievalItem) -> String {
        guard case .inHand(let previous) = retrieval.item.placement else { return "its place" }
        return previous ?? "its place"
    }

    private func putBack(_ retrieval: InventoryRetrievalItem) {
        guard InventoryRetrieval.canPutBack(retrieval) else { return }
        items.removeAll { $0.id == retrieval.id }
    }

    private static let recentDestinations = [
        InventoryDestination(id: "recent-garage", name: "Garage tools", kind: .container)
    ]
    private static let containerDestinations = [
        InventoryDestination(id: "kitchen-12", name: "Kitchen 12", kind: .container)
    ]
    private static let locationDestinations = [
        InventoryDestination(id: "study", name: "Study", kind: .location)
    ]
}
