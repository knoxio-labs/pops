import AppCore
import SwiftUI

/// What Pick up and Discard do to selected records, kept out of the views so
/// the commands and the undo line can be tested without one. The rows stay
/// in the list; their placement line or lifecycle badge changes.
internal enum InventoryRecordActions {
    internal typealias Plan = (commands: [InventoryCommand], offer: InventoryUndoOffer)

    /// Picks up every selected record not already in hand.
    internal static func pickUp(_ ids: Set<String>, from records: [InventoryRecord]) -> Plan? {
        let moving = records.filter { ids.contains($0.id) && $0.placement != .hand }
        guard !moving.isEmpty else { return nil }
        return (
            moving.map { .moveItem(id: $0.id, to: .hand, verb: .pickUp) },
            InventoryUndoOffer(message: "Picked up \(subject(moving))", symbol: .inHand)
        )
    }

    /// Discards every selected record that is still active, whole, the same
    /// as Item detail's Discard with no reason.
    internal static func discard(_ ids: Set<String>, from records: [InventoryRecord]) -> Plan? {
        let discarding = records.filter { ids.contains($0.id) && $0.isActive }
        guard !discarding.isEmpty else { return nil }
        return (
            discarding.map { .setItemLifecycle(id: $0.id, lifecycle: .discarded, reason: nil) },
            InventoryUndoOffer(message: "Discarded \(subject(discarding))", symbol: .discard)
        )
    }

    /// One record's name, or how many.
    internal static func subject(_ records: [InventoryRecord]) -> String {
        records.count == 1 ? records[0].name : "\(records.count)"
    }
}

extension InventoryWriter {
    internal func pickUp(_ ids: Set<String>, from records: [InventoryRecord]) async {
        guard let plan = InventoryRecordActions.pickUp(ids, from: records) else { return }
        await perform(plan.commands, offering: plan.offer)
    }

    internal func discard(_ ids: Set<String>, from records: [InventoryRecord]) async {
        guard let plan = InventoryRecordActions.discard(ids, from: records) else { return }
        await perform(plan.commands, offering: plan.offer)
    }
}

extension View {
    /// Selection mode's bar for records: Pick up and Move, then Discard.
    /// Pick up and Discard clear the selection once sent; Move opens the
    /// picker with the selection still standing.
    internal func inventoryRecordSelectionBar(
        _ selection: Binding<InventorySelection>,
        records: [InventoryRecord],
        writer: InventoryWriter,
        moving: Binding<InventoryMoveRequest?>
    ) -> some View {
        inventorySelectionBar(
            selection, all: records.map(\.id),
            actions: [
                InventorySelectionAction(title: "Pick up", symbol: .inHand) { ids in
                    selection.wrappedValue.deselectAll()
                    Task { await writer.pickUp(ids, from: records) }
                },
                InventorySelectionAction(title: "Move", symbol: .move) { ids in
                    let chosen = records.filter { ids.contains($0.id) }
                    moving.wrappedValue = InventoryMoveRequest(
                        ids: ids,
                        title: chosen.count == 1
                            ? InventoryRecordActions.subject(chosen) : "\(ids.count) items")
                },
                InventorySelectionAction(title: "Discard", symbol: .discard) { ids in
                    selection.wrappedValue.deselectAll()
                    Task { await writer.discard(ids, from: records) }
                },
            ]
        )
        .onChange(of: records.map(\.id)) { _, present in
            selection.wrappedValue.keepOnly(Set(present))
        }
    }

    /// The Undo capsule and the refusal alert every Inventory list shows for
    /// its writer.
    internal func inventoryWriterFeedback(_ writer: InventoryWriter) -> some View {
        modifier(InventoryWriterFeedback(writer: writer))
    }
}

private struct InventoryWriterFeedback: ViewModifier {
    @Bindable var writer: InventoryWriter

    func body(content: Content) -> some View {
        content
            .inventoryUndoCapsule($writer.undoOffer) { offer in
                Task { await writer.undo(offer) }
            }
            .alert(
                InventoryCopy.failureTitle,
                isPresented: Binding(
                    get: { writer.failure != nil }, set: { if !$0 { writer.failure = nil } }),
                presenting: writer.failure
            ) { _ in
                Button("OK", role: .cancel) {}
            } message: { failure in
                Text(InventoryCopy.message(for: failure))
            }
    }
}
