import AppCore
import DesignSystem
import SwiftUI

internal struct TripsDocumentShortcut: View {
    internal let snapshot: TripSnapshot
    internal let repository: any DocumentsReading

    internal var body: some View {
        NavigationLink {
            TripsDocumentsView(snapshot: snapshot, repository: repository)
        } label: {
            Label("Documents", systemImage: "doc.fill")
        }
        .frame(minHeight: PopsSize.touchTarget)
    }
}
