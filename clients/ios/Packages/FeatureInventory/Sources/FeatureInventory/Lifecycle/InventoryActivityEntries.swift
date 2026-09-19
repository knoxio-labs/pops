import AppCore
import Foundation

/// Turns one item's events into the lines History shows, newest first.
internal struct InventoryActivityEntries {
    internal let source: any InventoryQuerySource
    internal let now: Date
    internal let calendar: Calendar

    internal func entries(for events: [InventoryEvent]) -> [InventoryActivityEntry] {
        events.sorted { $0.seq > $1.seq }.map(entry)
    }

    internal func entry(for event: InventoryEvent) -> InventoryActivityEntry {
        let line = describe(event)
        return InventoryActivityEntry(
            seq: event.seq, verb: line.verb, subject: line.subject, detail: "",
            when: InventoryHistoryDate.when(event.serverTime, now: now, calendar: calendar),
            kind: line.kind, symbol: line.symbol,
            month: InventoryHistoryDate.month(event.serverTime, calendar: calendar),
            from: line.from, to: line.to, reason: event.reason,
            device: Self.device(event.actor), isUndoable: event.undoable)
    }

    /// What an event says, before the dates and the actor are added.
    private struct Line {
        var verb: String
        var subject = ""
        var kind = InventoryHistoryKind.edit
        var symbol = InventorySymbol.edit
        var from: String?
        var to: String?
    }

    private func describe(_ event: InventoryEvent) -> Line {
        switch event.kind {
        case .moved: moved(event)
        case .lifecycleChanged: lifecycle(event)
        case .accessChanged:
            Line(verb: Self.text(event.after["access"]) == "closed" ? "Closed" : "Opened")
        case .fullnessChanged:
            Line(verb: event.after["isFull"] == .flag(false) ? "No longer full" : "Marked full")
        case .typeChanged:
            Line(verb: "Typed as", subject: typeName(event.after["typeKey"]))
        case .quantityChanged:
            Line(verb: "Recounted to", subject: Self.text(event.after["quantity"]) ?? "")
        case .codeChanged:
            Line(verb: "Labelled", subject: Self.text(event.after["code"]) ?? "", symbol: .label)
        case .deleted, .restored:
            Line(
                verb: event.kind == .deleted ? "Deleted" : "Restored", kind: .lifecycle,
                symbol: event.kind == .deleted ? .discard : .restore)
        case .unrecognised(let wire):
            Line(verb: wire.replacingOccurrences(of: "_", with: " ").capitalized)
        default:
            Self.plain[event.kind] ?? Line(verb: "Changed")
        }
    }

    private func moved(_ event: InventoryEvent) -> Line {
        let from = InventoryEventPlacement(event.before["placement"], source: source)
        let to = InventoryEventPlacement(event.after["placement"], source: source)
        switch to {
        case .hand:
            return Line(
                verb: "Picked up", kind: .move, symbol: .inHand, from: from.words, to: to.words)
        case .named(let name):
            return Line(
                verb: "Moved to", subject: name, kind: .move, symbol: .move, from: from.words,
                to: name)
        case .unknown:
            return Line(verb: "Moved", kind: .move, symbol: .move, from: from.words)
        }
    }

    private func lifecycle(_ event: InventoryEvent) -> Line {
        let lifecycle = Self.text(event.after["lifecycle"]).map(InventoryLifecycle.init(wire:))
        switch lifecycle {
        case .active:
            return Line(verb: "Restored", kind: .lifecycle, symbol: .restore)
        case .lost:
            return Line(verb: "Marked lost", kind: .lifecycle, symbol: .lost)
        case .some(let lifecycle):
            return Line(verb: lifecycle.label, kind: .lifecycle, symbol: lifecycle.symbol)
        case nil:
            return Line(verb: "Changed", kind: .lifecycle, symbol: .restore)
        }
    }

    private func typeName(_ value: InventoryFieldValue?) -> String {
        guard let key = Self.text(value) else { return "" }
        return source.inventoryCatalogue().type(forKey: key)?.name ?? key
    }

    private static func text(_ value: InventoryFieldValue?) -> String? {
        switch value {
        case .text(let text), .choice(let text), .link(let text): text
        case .measurement(let measurement): measurement.value.formatted(.number)
        default: nil
        }
    }

    private static func device(_ actor: InventoryEventActor) -> String {
        switch actor {
        case .device(_, let label): label
        case .web: "Web"
        case .service(let account): account
        case .migration: "Import"
        case .unrecognised(_, let label): label
        }
    }

    /// A table for the kinds whose line never depends on the event's values,
    /// for the reason `InventoryActivityLine` gives for its own.
    private static let plain: [InventoryEventKind: Line] = [
        .created: Line(verb: "Logged", symbol: .addNew),
        .edited: Line(verb: "Edited"),
        .split: Line(verb: "Split", symbol: .split),
        .photoAttached: Line(verb: "Added a photo", symbol: .photo),
        .photoRemoved: Line(verb: "Removed a photo", symbol: .photo),
        .photosReordered: Line(verb: "Reordered the photos", symbol: .photo),
        .reverted: Line(verb: "Undid a change", symbol: .restore),
        .migrated: Line(verb: "Imported"),
    ]
}
