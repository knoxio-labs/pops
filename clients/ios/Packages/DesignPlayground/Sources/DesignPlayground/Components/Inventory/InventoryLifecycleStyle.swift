import SwiftUI

/// The five open questions POPS-3989 leaves for Joao, as the knobs a screen
/// turns.
///
/// Same shape as ``InventoryFoundationStyle``: each experiment varies exactly
/// one field and holds the rest at their defaults, so several can share one
/// surface honestly. None of these five is decided yet, so there is no
/// "current default" claim in the doc comments below the way there is on the
/// foundation style, only a starting point.
internal struct InventoryLifecycleStyle: Equatable {
    /// Whether a discard reason (donated, sold, used up…) is its own field
    /// beside the state, or folded into the note a person writes.
    internal enum ReasonPresentation: Equatable {
        /// The reason is a chip next to the lifecycle badge.
        case reasonChip
        /// No structured reason; whatever was written goes in the note only.
        case noteOnly
        /// The reason replaces the lifecycle badge's label outright: a
        /// discarded, donated jacket reads "Donated", not "Discarded".
        case reasonReplacesLabel
    }

    /// Whether discarding acts on the tap, or asks first.
    internal enum DiscardConfirmation: Equatable {
        /// Happens immediately; nothing more is shown.
        case immediate
        /// Happens immediately, and a dismissible banner offers Undo.
        case immediateWithUndo
        /// A dialog asks before it happens, the same shape destroy uses.
        case confirmFirst
    }

    /// How reducing a grouped record's quantity is modelled.
    internal enum QuantityReduction: Equatable {
        /// The record's own quantity drops; no second record appears.
        case decrementInPlace
        /// The removed units become their own record, immediately marked with
        /// the disposition, so the history of what happened to which units is
        /// a record rather than a note.
        case splitThenDispose
    }

    /// Whether an inactive item turns up in an ordinary search.
    internal enum InactiveSearchVisibility: Equatable {
        /// Hidden until a filter chip asks for it.
        case hiddenByDefault
        /// Shown, but always sorted after every active result.
        case shownAtBottom
        /// Shown inline with a badge, sorted by relevance like anything else.
        case shownInline
    }

    /// How much a history entry says before a person opens it.
    internal enum TimelineDetail: Equatable {
        /// One line, the same shape ``InventoryActivityRow`` already draws.
        case compact
        /// The compact row, plus a tap opens the full account.
        case drillIn
    }

    internal var reasonPresentation: ReasonPresentation = .reasonChip
    internal var discardConfirmation: DiscardConfirmation = .immediate
    internal var quantityReduction: QuantityReduction = .decrementInPlace
    internal var inactiveSearchVisibility: InactiveSearchVisibility = .hiddenByDefault
    internal var timelineDetail: TimelineDetail = .compact
}

extension EnvironmentValues {
    @Entry internal var inventoryLifecycleStyle = InventoryLifecycleStyle()
}
