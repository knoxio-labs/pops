import SwiftUI

/// The four questions POPS-3980 leaves open, as the knobs a screen turns.
///
/// Same shape as ``InventoryFoundationStyle``: each experiment varies exactly
/// one of these and holds the rest at their defaults, so several can stay
/// open on one surface honestly.
internal struct InventoryItemDetailStyle: Equatable {
    /// Whether every section always appears, in one order, or whether an
    /// empty one disappears and a well-documented item's sections reorder
    /// toward what it actually has.
    internal enum Hierarchy: Equatable {
        case fixedOrder
        case richnessAdaptive
    }

    /// Where the primary action, Pick up, Put back, Move, or Restore, lives.
    internal enum ActionPlacement: Equatable {
        case header
        case bottomBar
    }

    /// Whether an optional section opens in place or on its own screen.
    internal enum SectionDisclosure: Equatable {
        case inlineExpandable
        case drillIn
    }

    /// How a container-capable item's page differs from an ordinary item's.
    internal enum ContainerExtension: Equatable {
        /// The same layout, with one more section appended.
        case appendedSection
        /// A segmented control swaps the section list for the container's
        /// contents, in place.
        case segmentedContents
        /// A different hero replaces the identity header outright.
        case separateHero
    }

    internal var hierarchy: Hierarchy = .fixedOrder
    internal var actionPlacement: ActionPlacement = .header
    internal var sectionDisclosure: SectionDisclosure = .inlineExpandable
    internal var containerExtension: ContainerExtension = .appendedSection
}

extension EnvironmentValues {
    @Entry internal var inventoryItemDetailStyle = InventoryItemDetailStyle()
}
