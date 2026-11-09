import DesignSystem
import SwiftUI

/// Read-only practical details retain source values without deriving contact or download actions.
internal struct TripTodayEssentialsView: View {
    internal let essentials: TripsTodayEssentials

    internal var body: some View {
        if let reference = essentials.reference, !reference.isEmpty {
            Section("Reference") {
                Text(reference)
                    .font(.popsMonospaced)
                    .textSelection(.enabled)
            }
        }
        if let address = essentials.address, !address.isEmpty {
            Section("Address") {
                Text(address)
                    .font(.popsBody)
                    .textSelection(.enabled)
            }
        }
        if let contact = essentials.contact {
            Section("Contact") {
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text(contact.name).font(.popsHeadline)
                    Text(contact.methodLabel).font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                    Text(contact.method).font(.popsBody).textSelection(.enabled)
                }
            }
        }
        if !essentials.documents.isEmpty {
            Section("Documents") {
                ForEach(essentials.documents) { document in
                    VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                        Label(document.name, systemImage: "doc.text")
                            .font(.popsBody)
                        Text(documentAvailability(document))
                            .font(.popsCaption)
                            .foregroundStyle(Color.popsMutedForeground)
                    }
                }
            }
        }
    }

    private func documentAvailability(_ document: TripsTodayDocument) -> String {
        switch document.availability {
        case .available: "Source available"
        case .unavailable: "Source unavailable"
        case .unknown: "Source availability unknown"
        }
    }
}
