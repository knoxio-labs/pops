import AppCore
import Observation

/// What the type-arrived sheet shows: the arrived type, and each item it
/// covers as its pick row draws it.
internal struct InventoryTypeArrivalPrompt: Equatable, Sendable {
    internal struct Row: Identifiable, Equatable, Sendable {
        internal let id: InventoryItem.ID
        internal let name: String
        /// The location the item resolves to, if it is not in someone's hand.
        internal let place: String?
        internal let photo: String?
    }

    internal let typeKey: String
    internal let typeName: String
    internal let rows: [Row]

    /// `InventoryQuery.typeArrival`, with each covered item's place resolved
    /// against the same state.
    internal static let query = InventoryQuery<InventoryTypeArrivalPrompt?> { source in
        guard let arrival = InventoryQuery<InventoryTypeArrival?>.typeArrival.read(source) else {
            return nil
        }
        let places = InventoryPlaceNames(source: source)
        return InventoryTypeArrivalPrompt(
            typeKey: arrival.type.key, typeName: arrival.type.name,
            rows: arrival.items.map { item in
                Row(
                    id: item.id, name: item.name,
                    place: places.effectiveLocation(of: item.placement),
                    photo: item.photos.first?.sha256)
            })
    }
}

/// The type-arrived sheet's state: which arrival is up, which of its items
/// are ticked, and Apply.
///
/// An arrival is recorded as asked (`settleTypeArrival`) before the sheet
/// opens, so the sheet shows once however it is closed: Apply, Not now, a
/// swipe, or the app quitting under it. One that cannot be recorded is not
/// shown, since it would come back on every launch.
@MainActor @Observable
internal final class InventoryTypeArrivalModel {
    internal private(set) var presented: InventoryTypeArrivalPrompt?
    internal var ticked: Set<InventoryItem.ID> = []
    internal let runner: InventoryCommandRunner
    private var waiting: InventoryTypeArrivalPrompt?
    private var isOpening = false

    internal init(runner: InventoryCommandRunner) {
        self.runner = runner
    }

    /// Follows the store until the calling task is cancelled.
    internal func observe() async {
        for await prompt in runner.store.observe(InventoryTypeArrivalPrompt.query) {
            await receive(prompt)
        }
    }

    /// Takes the store's latest answer, opening it when no sheet is up.
    internal func receive(_ prompt: InventoryTypeArrivalPrompt?) async {
        waiting = prompt
        await openIfWaiting()
    }

    internal func toggle(_ id: InventoryItem.ID) {
        if ticked.remove(id) == nil { ticked.insert(id) }
    }

    /// Closes the sheet, whichever way it was closed, and opens the next
    /// arrival if another one is waiting.
    internal func close() async {
        presented = nil
        ticked = []
        await openIfWaiting()
    }

    /// Types every ticked item as the arrived type through the shared
    /// runner, which offers Undo, then closes the sheet. Returns whether
    /// every change landed; one that did not is the runner's alert.
    @discardableResult
    internal func apply() async -> Bool {
        guard let prompt = presented else { return false }
        let ids = prompt.rows.map(\.id).filter(ticked.contains)
        guard !ids.isEmpty else { return false }
        let landed = await runner.perform(
            ids.map { .changeItemType(id: $0, typeKey: prompt.typeKey, fields: [:]) },
            announcing: "Typed \(ids.count) as \(prompt.typeName)", symbol: .update)
        await close()
        return landed
    }

    private func openIfWaiting() async {
        guard presented == nil, !isOpening, let next = waiting else { return }
        isOpening = true
        defer { isOpening = false }
        do {
            try await runner.store.settleTypeArrival(typeKey: next.typeKey)
        } catch {
            return
        }
        if waiting?.typeKey == next.typeKey { waiting = nil }
        ticked = Set(next.rows.map(\.id))
        presented = next
    }
}
