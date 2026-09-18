import SwiftUI

/// The five open questions in POPS-3979, as the knobs a screen turns.
///
/// Each experiment varies exactly one of these and holds the rest at their
/// defaults. That is what lets several experiments stay open on one surface
/// honestly: a variant of one question states what it holds fixed about the
/// others, and "fixed" means "at the default below", never an unstated
/// choice.
///
/// All five were decided on the device on 2026-09-16 and the defaults below
/// are those decisions.
internal struct InventoryFoundationStyle: Equatable {
    /// Whether a container looks different from an item while still being one.
    internal enum ContainerMark: Equatable {
        case likeAnItem
        case tinted
        case squared
    }

    /// How a non-default lifecycle or access state reaches the reader.
    internal enum StateTreatment: Equatable {
        case badge
        case subtitle
        case icon
        case combined
    }

    /// Which sync prominence tiers are shown in ordinary use.
    internal enum SyncVisibility: Equatable {
        case fromVisible
        case fromQuiet
        case everything

        internal func shows(_ sync: InventorySync) -> Bool {
            switch self {
            case .fromVisible: sync.prominence >= .visible
            case .fromQuiet: sync.prominence >= .quiet
            case .everything: true
            }
        }
    }

    /// The word for an item that has been picked up and not put anywhere.
    internal enum InHandTerm: String, Equatable {
        case inHand = "In hand"
        case unplaced = "Unplaced"
        case pickedUp = "Picked up"
    }

    /// Whether stopping a container accepting items is one action or two.
    internal enum CloseActions: Equatable {
        case closeOnly
        case closeAndSeal
    }

    internal var containerMark: ContainerMark = .squared
    internal var stateTreatment: StateTreatment = .badge
    internal var syncVisibility: SyncVisibility = .fromQuiet
    internal var inHandTerm: InHandTerm = .inHand
    internal var closeActions: CloseActions = .closeOnly
}

extension EnvironmentValues {
    @Entry internal var inventoryStyle = InventoryFoundationStyle()
}
