import SwiftUI

/// What happens between a code being read and a screen opening. Most scans
/// pass straight through this without a reviewer ever seeing it; every case
/// here is one where they cannot.
internal enum InventoryScanResultState: Equatable {
    /// Resolving the code against the local catalogue.
    case loading
    /// A well-formed Inventory code whose entity is no longer in the local
    /// catalogue, deleted, or synced away.
    case targetMissing
    /// Resolved, but from data old enough that the answer might have
    /// changed since.
    case staleLocalResult
    /// Nothing has synced yet, so there is no local catalogue to resolve
    /// against.
    case firstSyncRequired
    /// A well-formed POPS URI for a pillar this phone cannot open right
    /// now, not built yet, or not on this device.
    case destinationUnavailable(pillar: String)
}

/// The routing screen a scan passes through, and the handful of outcomes
/// that stop there instead of opening straight to a detail.
internal struct InventoryScanResultView: View {
    internal let state: InventoryScanResultState

    internal var body: some View {
        content
            .navigationTitle("Scan result")
            .playgroundTitleDisplay(large: false)
    }

    @ViewBuilder private var content: some View {
        switch state {
        case .loading:
            InventoryStateNotice(kind: .loading)
        case .targetMissing:
            targetMissingView
        case .staleLocalResult:
            InventoryStateNotice(kind: .stale)
        case .firstSyncRequired:
            InventoryStateNotice(kind: .unavailable)
        case .destinationUnavailable(let pillar):
            destinationUnavailableView(pillar)
        }
    }

    private var targetMissingView: some View {
        ContentUnavailableView(
            "No longer here",
            systemImage: "questionmark.square.dashed",
            description: Text(
                "This label used to point at something in the catalogue, and no longer does. "
                    + "It may have been discarded on another phone."))
    }

    private func destinationUnavailableView(_ pillar: String) -> some View {
        ContentUnavailableView(
            "Can't open this yet",
            systemImage: "arrow.up.right.square",
            description: Text(
                "This is a \(pillar.capitalized) code. That screen is not on this phone yet."))
    }
}
