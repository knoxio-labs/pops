import SwiftUI

/// The archive destination while its stored-purchase query is introduced separately.
internal struct PurchasesArchiveScreen: View {
    internal let scope: PurchasesArchiveScope

    internal var body: some View {
        ContentUnavailableView(title, systemImage: "archivebox")
            .navigationTitle("Archive")
    }

    private var title: String {
        switch scope {
        case .all:
            "No archived purchases"
        case .unmatched:
            "No unmatched purchases"
        }
    }
}
