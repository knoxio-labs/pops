/// The verbs a person can apply to an item, and how much each one costs.
///
/// Weight decides presentation, and the rule it encodes is the one the ADR's
/// action list implies: red is for what cannot be undone. Discarding is
/// reversible — Restore exists — so it is drawn as an ordinary action with a
/// note saying so. Only marking something destroyed, which is a fact about the
/// world rather than a choice about the record, gets destructive styling and a
/// confirmation.
internal struct InventoryAction: Identifiable, Equatable {
    internal enum Weight: Equatable {
        case standard
        /// Takes the item out of "what I have", and can be walked back.
        case reversibleRemoval
        /// Cannot be walked back from the phone. Confirmed before it happens.
        case irreversible
    }

    internal enum Heading: String, CaseIterable, Equatable {
        case whereItIs = "Where it is"
        case container = "Container"
        case record = "Record"
        case removal = "Remove"
    }

    internal let id: String
    internal let title: String
    internal let symbol: InventorySymbol
    internal let heading: Heading
    internal let weight: Weight
    /// What the reader should know before tapping. Present on anything that is
    /// not plainly reversible.
    internal let note: String?

    internal init(
        _ id: String,
        _ title: String,
        symbol: InventorySymbol,
        heading: Heading,
        weight: Weight = .standard,
        note: String? = nil
    ) {
        self.id = id
        self.title = title
        self.symbol = symbol
        self.heading = heading
        self.weight = weight
        self.note = note
    }

    /// Everything a person can do to this item, in the order a sheet lists it.
    ///
    /// An item that no longer counts is offered only the way back; a destroyed
    /// one is offered nothing, because there is no way back to offer.
    internal static func available(
        for item: InventoryFoundationItem,
        style: InventoryFoundationStyle
    ) -> [InventoryAction] {
        guard item.lifecycle == .active else {
            return item.lifecycle.isRestorable ? [restore] : []
        }
        return placementActions(item) + containerActions(item, style: style)
            + recordActions(item) + [discard, destroy]
    }

    private static func placementActions(_ item: InventoryFoundationItem) -> [InventoryAction] {
        var actions: [InventoryAction] = []
        if case .inHand(let previous) = item.placement {
            if let previous {
                actions.append(
                    InventoryAction(
                        "put-back", "Put back", symbol: .restore, heading: .whereItIs,
                        note: "Into \(previous)"))
            }
        } else {
            actions.append(
                InventoryAction("pick-up", "Pick up", symbol: .inHand, heading: .whereItIs))
        }
        actions.append(InventoryAction("move", "Move", symbol: .move, heading: .whereItIs))
        return actions
    }

    private static func containerActions(
        _ item: InventoryFoundationItem,
        style: InventoryFoundationStyle
    ) -> [InventoryAction] {
        switch item.access {
        case nil:
            return []
        case .closed:
            return [
                InventoryAction("reopen", "Reopen", symbol: .openContainer, heading: .container)
            ]
        case .open:
            var actions = [
                InventoryAction(
                    "put-in", "Put something in", symbol: .openContainer, heading: .container),
                InventoryAction("close", "Close", symbol: .close, heading: .container),
            ]
            if style.closeActions == .closeAndSeal {
                actions.append(
                    InventoryAction(
                        "seal", "Seal", symbol: .seal, heading: .container,
                        note: "Closed and not to be opened until it arrives"))
            }
            return actions
        }
    }

    private static func recordActions(_ item: InventoryFoundationItem) -> [InventoryAction] {
        var actions: [InventoryAction] = []
        if item.quantity.count > 1 {
            actions.append(
                InventoryAction(
                    "split", "Split", symbol: .split, heading: .record,
                    note: "Move some of the \(item.quantity.count) into a separate group"))
        }
        if item.code == nil {
            actions.append(InventoryAction("label", "Label", symbol: .label, heading: .record))
        }
        return actions
    }

    private static let restore = InventoryAction(
        "restore", "Restore", symbol: .restore, heading: .removal, note: "Counts again from now")

    private static let discard = InventoryAction(
        "discard", "Discard", symbol: .discard, heading: .removal, weight: .reversibleRemoval,
        note: "Stops counting. Can be restored.")

    private static let destroy = InventoryAction(
        "destroy", "Mark as destroyed", symbol: .attention, heading: .removal,
        weight: .irreversible,
        note: "Cannot be undone")
}
