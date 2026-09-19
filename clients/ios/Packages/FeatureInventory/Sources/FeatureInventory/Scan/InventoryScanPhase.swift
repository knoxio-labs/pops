import AppCore

/// Where the scan screen is: looking, resolving, or holding an answer.
///
/// A well-formed `pops://inventory/...` reference for something this build
/// knows how to show never reaches ``found``: it goes straight through the
/// composition root's `EntityRouter`, the same seam the `pops` URL scheme
/// resolves through, so a label opens the same destination whichever path
/// found it (ADR-002's routing rule). ``found`` is reached only by a plain
/// printed code, looked up with `InventoryStore.observe(.item(withCode:))`.
internal enum InventoryScanPhase: Equatable {
    case scanning
    case loading
    case found(InventoryRecord)
    /// A well-formed `pops://` reference for a pillar nothing in this build
    /// has registered a screen for. Shared POPS routing, so this is a
    /// hand-off, not a failure.
    case unsupported(pillar: String)
    /// Looked like an attempt at a `pops://` reference but did not parse as
    /// one.
    case notPops
    /// A well-formed reference, or a real code, with nothing behind it: an
    /// id or code this replica has never held, or a tombstoned holder's code
    /// (POPS-4108) — reserved so it is never reissued, but no longer
    /// resolving to anything the phone shows.
    case targetMissing
    case denied
}
