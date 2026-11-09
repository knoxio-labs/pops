import AppCore
import DesignSystem
import SwiftUI

internal struct TripsDocumentsView: View {
    internal let snapshot: TripSnapshot

    internal var body: some View {
        List {
            ForEach(snapshot.stays.filter { !$0.documentLinks.isEmpty }) { stay in
                Section(stay.name ?? "Stay \(stay.id)") {
                    ForEach(Array(stay.documentLinks.enumerated()), id: \.offset) { _, link in
                        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                            Label(link.label ?? link.uri, systemImage: "doc")
                                .font(.popsBody)
                            if link.label != nil {
                                Text(link.uri).font(.popsCaption).textSelection(.enabled)
                            }
                        }
                    }
                }
            }
            Section {
                Label("File availability is not provided", systemImage: "info.circle")
                    .font(.popsSubheadline)
                Text(
                    "These are source references. Files and offline copies are not available through the trip service."
                )
                .font(.popsCaption).foregroundStyle(Color.popsMutedForeground)
            }
        }
    }
}
