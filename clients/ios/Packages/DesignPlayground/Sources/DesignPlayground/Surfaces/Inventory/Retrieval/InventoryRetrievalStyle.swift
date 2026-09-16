import SwiftUI

/// The two open questions POPS-3987 asks about retrieval itself, as the knobs
/// the in-hand list turns. Same shape as ``InventoryFoundationStyle``, and for
/// the same reason: one style, several experiments, each varying one field
/// and holding the rest at its default.
internal struct InventoryRetrievalStyle: Equatable {
    /// Whether picking something up is its own step before a destination is
    /// chosen, or a move can go straight to a destination with in-hand as
    /// something that happens along the way rather than something chosen.
    internal enum PickupGrammar: Equatable {
        case explicitPickUp
        case directMove
    }

    /// How much a retrieval action stops to ask, given that every one of them
    /// (put back, move, pick up) is reversible or undoable.
    internal enum ConfirmationLevel: Equatable {
        /// Nothing asks. Undo is how a mistake is corrected.
        case relyOnUndo
        /// Only picking something up asks, because it is the step that turns
        /// "where is this" into "who is holding it".
        case confirmPickUp
        /// Every one of the three asks.
        case confirmEvery
    }

    internal var pickupGrammar: PickupGrammar = .explicitPickUp
    internal var confirmationLevel: ConfirmationLevel = .confirmPickUp
}

extension EnvironmentValues {
    @Entry internal var inventoryRetrievalStyle = InventoryRetrievalStyle()
}

/// The two open questions POPS-3987 asks about unpacking.
internal struct InventoryUnpackingStyle: Equatable {
    /// Whether each item leaves the container one at a time, or several can
    /// be selected and sent together.
    internal enum Selection: Equatable {
        case singleItem
        case lightweightMultiSelect
    }

    /// Whether unpacking a container is a named place of its own, or the same
    /// container actions any closed or open box already has.
    internal enum Structure: Equatable {
        case namedWorkspace
        case ordinaryContainerActions
    }

    internal var selection: Selection = .singleItem
    internal var structure: Structure = .namedWorkspace
}

extension EnvironmentValues {
    @Entry internal var inventoryUnpackingStyle = InventoryUnpackingStyle()
}
