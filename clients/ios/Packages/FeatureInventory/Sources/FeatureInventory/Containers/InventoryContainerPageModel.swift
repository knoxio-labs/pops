import AppCore
import Foundation
import Observation

/// A container page's state and the writes it issues, over `InventoryStore`.
///
/// Unpacking is the page's ordinary actions: rows leave by swipe, or several
/// at once once their marks are tapped, and each action leaves an Undo
/// capsule rather than asking first. What this holds of its own is only what
/// the store cannot know: the selection, a Full switch flipped and not yet
/// answered, and whether the page has seen the container hold anything, which
/// is what makes an empty container "just emptied" rather than simply empty.

/// The manual Full switch's optimistic value while a write is in flight, or
/// none while the switch simply reflects the store's own answer.
private enum PendingFull: Equatable {
    case none
    case value(Bool)
}

@MainActor @Observable
internal final class InventoryContainerPageModel {
    internal let id: InventoryItem.ID
    internal let runner: InventoryCommandRunner
    internal let content: InventoryObservation<InventoryContainerProfile?>
    internal var selection = InventorySelection()
    internal var moving: InventoryPlacementRequest?
    internal var storing = false
    private var pendingFull = PendingFull.none
    private var sawContents = false
    private var emptiedResolved = false

    internal init(id: InventoryItem.ID, store: any InventoryStore) {
        self.id = id
        runner = InventoryCommandRunner(store: store)
        content = InventoryObservation(store: store, query: Self.query(id: id))
    }

    internal static func query(id: InventoryItem.ID) -> InventoryQuery<InventoryContainerProfile?> {
        InventoryQuery { source in
            source.inventoryItem(id: id).flatMap { item in
                item.isContainer && !item.isDeleted
                    ? InventoryContainerProfile(reading: source, container: item) : nil
            }
        }
    }

    /// Follows the container until the calling task is cancelled.
    internal func observe() async {
        await content.observe()
    }

    /// Records that the page has seen contents; the view calls this on every
    /// answer.
    internal func note(_ profile: InventoryContainerProfile) {
        if !profile.contents.isEmpty { sawContents = true }
        selection.keepOnly(Set(profile.contents.entries.map(\.id)))
    }

    /// The emptied card shows once the last thing has left while the page was
    /// open, until Keep or Retire answers it.
    internal func showsEmptied(_ profile: InventoryContainerProfile) -> Bool {
        sawContents && profile.contents.isEmpty && !emptiedResolved && profile.isActive
    }

    internal func isFull(_ profile: InventoryContainerProfile) -> Bool {
        if case .value(let value) = pendingFull { return value }
        return profile.isFull
    }

    /// Flips the manual Full switch. The switch shows the new value at once
    /// and settles on the store's answer.
    internal func setFull(_ isFull: Bool) async {
        pendingFull = .value(isFull)
        await runner.perform([.setItemFull(id: id, isFull: isFull)])
        pendingFull = .none
    }

    internal func perform(_ verb: InventoryContainerVerb, on profile: InventoryContainerProfile)
        async
    {
        switch verb {
        case .storeHere:
            storing = true
        case .move:
            moving = InventoryPlacementRequest(subject: .items([id]), title: profile.name)
        case .close, .open, .pickUp, .putBack, .restore:
            guard let command = verb.command(for: profile.item) else { return }
            await runner.perform(
                [command], announcing: verb.announcement(profile.name), symbol: verb.symbol)
        }
    }

    /// Picks up the given rows: they leave the container for someone's hand.
    internal func pickUp(_ ids: Set<String>, in profile: InventoryContainerProfile) async {
        let message =
            ids.count == 1 ? "Picked up \(title(ids, in: profile))" : "Picked up \(ids.count)"
        await leave(ids, to: .hand, verb: .pickUp, message: message, symbol: .inHand)
    }

    /// Takes the given rows out onto wherever the container itself stands.
    internal func takeOut(_ ids: Set<String>, in profile: InventoryContainerProfile) async {
        let place = profile.crumbs.last ?? "where it stands"
        let what = ids.count == 1 ? title(ids, in: profile) : "\(ids.count)"
        await leave(
            ids, to: profile.item.placement, verb: .move,
            message: "Took out \(what), now in \(place)", symbol: .takeOut)
    }

    internal func move(_ ids: Set<String>, in profile: InventoryContainerProfile) {
        moving = InventoryPlacementRequest(
            subject: .items(ids.sorted()), title: title(ids, in: profile))
    }

    internal func choose(
        _ choice: InventoryEmptiedContainerChoice, profile: InventoryContainerProfile
    ) async {
        switch choice {
        case .keep:
            moving = InventoryPlacementRequest(
                subject: .items([id]), title: profile.name, commitTitle: "Keep")
        case .retire:
            let retired = await runner.perform(
                [.setItemLifecycle(id: id, lifecycle: .retired, reason: nil)],
                announcing: "Retired \(profile.name)", symbol: .retired)
            if retired { emptiedResolved = true }
        }
    }

    /// Settles the emptied card once the container was kept somewhere.
    internal func placed(_ request: InventoryPlacementRequest) {
        selection.deselectAll()
        if request.subject == .items([id]) { emptiedResolved = true }
    }

    internal func title(_ ids: Set<String>, in profile: InventoryContainerProfile) -> String {
        guard ids.count == 1, let only = ids.first,
            let entry = profile.contents.entries.first(where: { $0.id == only })
        else { return "\(ids.count) items" }
        return entry.item.name
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
