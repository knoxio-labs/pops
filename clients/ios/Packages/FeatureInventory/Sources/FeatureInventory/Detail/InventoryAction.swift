import AppCore

/// The verbs a person can apply to an item, and how much each one costs.
///
/// Weight decides presentation, and the rule it encodes is: red is for what
/// cannot be undone. Discarding is reversible, Restore exists, so it is drawn
/// as an ordinary action with a note saying so. Only destroying, which is a
/// fact about the world rather than a choice about the record, gets
/// destructive styling and a confirmation.
internal struct InventoryAction: Identifiable, Equatable {
    internal enum Weight: Equatable {
        case standard
        /// Takes the item out of "what I have", and can be walked back.
        case reversibleRemoval
        /// Cannot be walked back from the phone. Confirmed before it happens.
        case irreversible
    }

    internal let id: String
    internal let title: String
    internal let symbol: InventorySymbol
    internal let weight: Weight
    /// What the reader should know before tapping.
    internal let note: String?

    internal init(
        _ id: String, _ title: String, symbol: InventorySymbol, weight: Weight = .standard,
        note: String? = nil
    ) {
        self.id = id
        self.title = title
        self.symbol = symbol
        self.weight = weight
        self.note = note
    }

    /// Everything a person can do to this item, in the order a sheet lists it.
    ///
    /// An item that no longer counts is offered only the way back; a
    /// destroyed one is offered nothing, because there is no way back to
    /// offer.
    internal static func available(for record: InventoryDetailRecord) -> [InventoryAction] {
        guard record.lifecycle == .active else {
            return record.lifecycle.isRestorable ? [restore] : []
        }
        return placementActions(record) + containerActions(record) + recordActions(record)
            + [discard, destroy]
    }

    private static func placementActions(_ record: InventoryDetailRecord) -> [InventoryAction] {
        var actions: [InventoryAction] = []
        if record.trail.isInHand {
            if case .place(let name, _) = record.previous {
                actions.append(
                    InventoryAction("put-back", "Put back", symbol: .restore, note: "Into \(name)"))
            }
        } else {
            actions.append(InventoryAction("pick-up", "Pick up", symbol: .inHand))
        }
        actions.append(InventoryAction("move", "Move", symbol: .move))
        return actions
    }

    private static func containerActions(_ record: InventoryDetailRecord) -> [InventoryAction] {
        switch record.access {
        case nil:
            []
        case .closed:
            [InventoryAction("reopen", "Reopen", symbol: .reopen)]
        case .open:
            [
                InventoryAction("put-in", "Put something in", symbol: .openContainer),
                InventoryAction("close", "Close", symbol: .close),
            ]
        }
    }

    private static func recordActions(_ record: InventoryDetailRecord) -> [InventoryAction] {
        var actions = [InventoryAction("edit", "Edit details", symbol: .edit)]
        if record.quantity.count > 1 {
            actions.append(
                InventoryAction(
                    "split", "Split", symbol: .split,
                    note: "Move some of the \(record.quantity.count) into a separate group"))
        }
        if let code = record.code {
            actions.append(
                InventoryAction(
                    "print", "Print label", symbol: .printLabel, note: "Reprints \(code)"))
        } else {
            actions.append(InventoryAction("label", "Label", symbol: .label))
        }
        return actions
    }

    private static let restore = InventoryAction(
        "restore", "Restore", symbol: .restore, note: "Counts again from now")

    private static let discard = InventoryAction(
        "discard", "Discard", symbol: .discard, weight: .reversibleRemoval,
        note: "Stops counting. Can be restored.")

    private static let destroy = InventoryAction(
        "destroy", "Mark as destroyed", symbol: .destroyed, weight: .irreversible,
        note: "Cannot be undone.")
}

/// The first action a placement makes obvious, and then whatever the item's
/// capabilities add: the action row under the facts. Built from
/// `InventoryAction.available(for:)` rather than re-deriving when each
/// applies, so the row cannot disagree with the menu.
internal enum InventoryItemDetailPrimaryAction {
    /// Restore first, because it is the only thing an inactive item can do;
    /// then the placement verbs, in the order a person would reach for them.
    private static let priority = ["restore", "put-back", "pick-up", "move"]

    /// The ids a capability contributes to the row. Everything else an item
    /// can do is in the More menu.
    private static let capabilityRow = ["reopen", "close", "put-in"]

    /// The whole row, primary first.
    internal static func row(for record: InventoryDetailRecord) -> [InventoryAction] {
        let actions = InventoryAction.available(for: record)
        let first =
            priority.lazy.compactMap { id in actions.first { $0.id == id } }.first ?? actions.first
        guard let first else { return [] }
        let placement = actions.filter { priority.contains($0.id) && $0.id != first.id }
        let capability = capabilityRow.compactMap { id in actions.first { $0.id == id } }
        return [first] + placement + capability
    }
}

/// What Move and Store here, from the item page, hand the shared placement
/// picker and `InventoryStoreHereSheet`: the item itself, the same way
/// `InventoryRecordActions.moveRequest` and `InventoryInHand.moveRequest`
/// build one for a browser row or an in-hand one.
internal enum InventoryItemDetailPlacement {
    /// A Move request for this one item, named rather than counted.
    internal static func moveRequest(for record: InventoryDetailRecord) -> InventoryPlacementRequest
    {
        InventoryPlacementRequest(subject: .items([record.id]), title: record.name)
    }

    /// Where Store here puts things when it is opened on this item: the item
    /// is the container, because Store here only ever reaches the row for an
    /// open one.
    internal static func storeTarget(for record: InventoryDetailRecord) -> InventoryStoreTarget {
        .container(id: record.id, name: record.name)
    }
}

/// A screen an Item detail control opens that belongs to another part of
/// Inventory and has not landed yet: label choice and label printing. Move
/// and Store here open through the shared placement picker and
/// `InventoryStoreHereSheet` directly, so they resolve to no pending screen.
internal enum InventoryItemDetailPending: String, Identifiable {
    case edit
    case label
    case printLabel

    internal init?(actionId: String) {
        switch actionId {
        case "edit": self = .edit
        case "label": self = .label
        case "print": self = .printLabel
        default: return nil
        }
    }

    internal var id: String { rawValue }
}

/// Where a pending screen from Item detail's action row or toolbar should go:
/// the real item form when there is one, `InventoryItemDetailPendingSheet`'s
/// placeholder otherwise.
///
/// A free function rather than inline logic at each call site, because Item
/// detail used to decide this twice — once in `act(_:)`, which reached the
/// form, and once in the toolbar's own Edit button, which did not, so Edit
/// kept opening the placeholder from the one place people actually tap it.
internal enum InventoryItemDetailRouting {
    @MainActor
    internal static func present(
        _ screen: InventoryItemDetailPending,
        itemId: InventoryItem.ID,
        itemForm: InventoryItemFormPresenter?,
        pending setPending: (InventoryItemDetailPending) -> Void
    ) {
        if screen == .edit {
            itemForm?(.edit(itemId))
        } else {
            setPending(screen)
        }
    }
}
