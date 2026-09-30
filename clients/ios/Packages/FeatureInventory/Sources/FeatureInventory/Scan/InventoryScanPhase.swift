/// Where the scan screen is: looking, resolving, or holding an answer.
///
/// A well-formed `pops://inventory/...` reference for something this build
/// knows how to show never reaches ``found``: it goes straight through the
/// composition root's `EntityRouter`, the same seam the `pops` URL scheme
/// resolves through, so a label opens the same destination whichever path
/// found it (ADR-002's routing rule). ``found`` and ``matches`` are reached
/// only by a plain printed code: the item's own code first, then the external
/// identifiers items carry, such as a product barcode.
internal enum InventoryScanPhase: Equatable {
    case scanning
    case loading
    case found(InventoryRecord)
    /// An external identifier more than one item carries, ordered by name:
    /// two copies of a book, or a pack of the same product.
    case matches([InventoryRecord])
    /// A well-formed `pops://` reference for a pillar nothing in this build
    /// has registered a screen for. Shared POPS routing, so this is a
    /// hand-off, not a failure.
    case unsupported(pillar: String)
    /// Looked like an attempt at a `pops://` reference but did not parse as
    /// one.
    case notPops
    /// A code with nothing behind it: neither an item's own code nor any
    /// item's external identifier in this replica, or a tombstoned holder's
    /// code (POPS-4108) — reserved so it is never reissued, but no longer
    /// resolving to anything the phone shows.
    case targetMissing
    case denied
}
