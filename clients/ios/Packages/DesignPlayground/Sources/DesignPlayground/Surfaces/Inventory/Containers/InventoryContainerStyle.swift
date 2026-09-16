import SwiftUI

/// The four questions POPS-3986 leaves open, as the knobs the container
/// screens turn.
///
/// Shaped like ``InventoryFoundationStyle``, for the same reason: a variant
/// turns exactly one of these and holds the rest at the default below, so
/// several experiments can share the container-detail surface honestly.
/// Close-versus-seal is POPS-3979's question, not a second one here — these
/// screens read ``InventoryFoundationStyle/closeActions`` from the same
/// environment rather than repeating it.
internal struct InventoryContainerStyle: Equatable {
    /// Whether a container's workspace is a section inside its item detail,
    /// or a separate screen detail links to.
    internal enum DetailStructure: Equatable {
        case unifiedSection
        case dedicatedWorkspace
    }

    /// How several open containers at once are shown.
    internal enum OpenRepresentation: Equatable {
        case list
        case groupedCard
        case individualCards
    }

    /// How, or whether, "full" reaches the screen.
    internal enum FullDeclaration: Equatable {
        case manual
        case property
        case absent
    }

    /// Where a container's destination is expressed.
    internal enum DestinationField: Equatable {
        case currentField
        case packingAnnotation
        case laterMoveAction
    }

    internal var detailStructure: DetailStructure = .dedicatedWorkspace
    internal var openRepresentation: OpenRepresentation = .groupedCard
    internal var fullDeclaration: FullDeclaration = .manual
    internal var destinationField: DestinationField = .packingAnnotation
}

extension EnvironmentValues {
    @Entry internal var inventoryContainerStyle = InventoryContainerStyle()
}
