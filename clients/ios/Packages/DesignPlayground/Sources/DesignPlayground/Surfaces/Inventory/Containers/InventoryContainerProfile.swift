import Foundation

/// How full a container is, when the style says to show one at all.
///
/// ADR-001 leaves how "full" is expressed open; this exists so the manual and
/// property variants have something to draw, and the absent variant simply
/// never reads it.
internal enum InventoryContainerFullness: Equatable {
    case notFull
    case declaredFull
}

/// One container's whole story, as the detail and workspace screens need it:
/// the item itself, what makes it a container, and what it holds.
internal struct InventoryContainerProfile: Identifiable, Equatable {
    internal let item: InventoryFoundationItem
    internal let sizeLoad: String?
    internal let destinationHint: String?
    internal let purchaseProvenance: String?
    internal let photoCount: Int
    internal let contents: InventoryContainerContents
    internal let fullness: InventoryContainerFullness
    /// Whether an item without the containment capability could be granted
    /// one. Only carried by an item that is not already a container.
    internal let capabilityEligible: Bool

    internal var id: String { item.id }

    internal init(
        item: InventoryFoundationItem,
        sizeLoad: String? = nil,
        destinationHint: String? = nil,
        purchaseProvenance: String? = nil,
        photoCount: Int = 0,
        contents: InventoryContainerContents = InventoryContainerContents(items: []),
        fullness: InventoryContainerFullness = .notFull,
        capabilityEligible: Bool = false
    ) {
        self.item = item
        self.sizeLoad = sizeLoad
        self.destinationHint = destinationHint
        self.purchaseProvenance = purchaseProvenance
        self.photoCount = photoCount
        self.contents = contents
        self.fullness = fullness
        self.capabilityEligible = capabilityEligible
    }

    /// Disabling containment only makes sense empty-handed: a container
    /// holding items cannot be demoted to a plain item without first
    /// answering where its contents go, so the action is withheld rather than
    /// offered and immediately refused.
    internal var canDisableContainment: Bool {
        item.isContainer && contents.isEmpty
    }

    internal var canEnableContainment: Bool {
        !item.isContainer && capabilityEligible
    }
}
