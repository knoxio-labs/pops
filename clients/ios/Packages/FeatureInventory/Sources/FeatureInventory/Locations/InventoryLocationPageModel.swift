import AppCore
import Foundation
import Observation

/// A place page's state and the writes it issues, over `InventoryStore`.
///
/// A place carries no lifecycle or access of its own, so this model is
/// thinner than the container page's: what it holds beyond the runner is
/// only the sheets and the selection over what sits directly in the place.
@MainActor @Observable
internal final class InventoryLocationPageModel {
    internal let id: InventoryLocation.ID
    internal let runner: InventoryCommandRunner
    internal let tree: InventoryObservation<InventoryLocationTree>
    internal let notice: InventoryObservation<InventoryLocationNotice?>
    internal var selection = InventorySelection()
    internal var moving: InventoryPlacementRequest?
    internal var storing = false
    internal var creating = false
    internal var renaming = false
    internal var deleting = false

    internal init(id: InventoryLocation.ID, store: any InventoryStore) {
        self.id = id
        runner = InventoryCommandRunner(store: store)
        tree = InventoryObservation(store: store, query: Self.query)
        notice = InventoryObservation(store: store, query: InventoryLocationNotice.query(id: id))
    }

    internal static var query: InventoryQuery<InventoryLocationTree> {
        InventoryQuery { InventoryLocationTree(reading: $0) }
    }

    /// Follows the replica until the calling task is cancelled.
    internal func observe() async {
        async let tree: Void = tree.observe()
        async let notice: Void = notice.observe()
        _ = await (tree, notice)
    }

    /// The notice to draw, once the ledger has answered.
    internal var shownNotice: InventoryLocationNotice? {
        guard case .loaded(let notice) = notice.phase else { return nil }
        return notice
    }

    /// Settles the place's move conflict: Keep mine re-sends this phone's
    /// move, Keep theirs lets the other device's stand. The notice leaves
    /// because the repair leaves the ledger, not because this hides it.
    internal func resolveMove(keepingMine: Bool) async {
        guard case .conflictingMove(let repairId, _, _, _)? = shownNotice else { return }
        await runner.resolve(repairId, with: keepingMine ? .keepMine() : .discardMine)
    }

    /// Drops whatever left the place while it was open, so a stale id never
    /// stays selected.
    internal func note(_ place: InventoryLocationNode) {
        selection.keepOnly(Set(InventoryLocationDirectRow.rows(of: place).map(\.id)))
    }

    internal func rename(_ name: String) async {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        await runner.perform([.renameLocation(id: id, name: trimmed)])
    }

    internal func delete(_ place: InventoryLocationNode) async {
        await runner.perform(
            [.deleteLocation(id: id)], announcing: "Deleted \(place.name)", symbol: .discard)
    }

    /// Opens the placement picker for the place itself, moving it under a
    /// new parent rather than moving anything inside it.
    internal func moveThisPlace(_ place: InventoryLocationNode) {
        moving = InventoryPlacementRequest(
            subject: .location(place.id), title: place.name, commitTitle: "Move")
    }

    internal func move(_ ids: Set<String>, title: String) {
        moving = InventoryPlacementRequest(subject: .items(ids.sorted()), title: title)
    }

    internal func pickUp(_ ids: Set<String>, subject: String) async {
        await leave(ids, to: .hand, verb: .pickUp, message: "Picked up \(subject)", symbol: .inHand)
    }

    internal func title(_ ids: Set<String>, in place: InventoryLocationNode) -> String {
        let rows = InventoryLocationDirectRow.rows(of: place).filter { ids.contains($0.id) }
        return rows.count == 1 ? rows[0].name : "\(rows.count) things"
    }

    private func leave(
        _ ids: Set<String>, to placement: InventoryPlacement, verb: InventoryMoveVerb,
        message: String, symbol: InventorySymbol
    ) async {
        guard !ids.isEmpty else { return }
        let commands = ids.sorted().map {
            InventoryCommand.moveItem(id: $0, to: placement, verb: verb)
        }
        if await runner.perform(commands, announcing: message, symbol: symbol) {
            selection.deselectAll()
        }
    }
}
