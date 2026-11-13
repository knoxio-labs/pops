import DesignSystem
import SwiftUI

internal struct TripSourceStateLines: View {
    internal let source: TripSource
    internal var showsReferences = true

    internal var body: some View {
        if case .journey(let journey) = source {
            if showsReferences, let reference = journey.reference, !reference.isEmpty {
                Text(reference).font(.popsMonospacedCaption)
            }
        }
        if case .stay(let stay) = source {
            if showsReferences, let reference = stay.reference, !reference.isEmpty {
                Text(reference).font(.popsMonospacedCaption)
            }
            if let address = stay.address, !address.isEmpty { Text(address).font(.popsCaption) }
        }
        if case .event(let event) = source {
            TripEventStateLines(event: event, showsReference: showsReferences)
        }
        if let start = source.start, let end = source.end, start >= end {
            Label("Recorded times conflict", systemImage: "exclamationmark.triangle")
                .font(.popsCaption).foregroundStyle(Color.popsWarning)
        }
    }
}
