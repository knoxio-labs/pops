import DesignSystem
import SwiftUI

internal struct TripSourceStateLines: View {
    internal let source: TripSource

    internal var body: some View {
        if case .journey(let journey) = source {
            ForEach(journey.legs) { leg in
                if let day = leg.from.date {
                    Text("Departure \(day) · Time unknown")
                        .font(.popsCaption).foregroundStyle(Color.popsMutedForeground)
                }
                if let day = leg.to.date {
                    Text("Arrival \(day) · Time unknown")
                        .font(.popsCaption).foregroundStyle(Color.popsMutedForeground)
                }
                let states = [leg.intention, leg.arrangement].compactMap { $0 }
                if !states.isEmpty {
                    let name = journey.legs.count > 1 ? leg.service ?? "Leg \(leg.id)" : nil
                    Text(([name].compactMap { $0 } + states).joined(separator: " · "))
                        .font(.popsCaption).foregroundStyle(Color.popsMutedForeground)
                }
                if let purchase = leg.purchase {
                    Label(
                        purchase,
                        systemImage: purchase == "Purchased" ? "checkmark.circle.fill" : "circle"
                    )
                    .font(.popsCaption)
                    .foregroundStyle(
                        purchase == "Purchased" ? Color.popsSuccess : Color.popsMutedForeground)
                }
                if let reference = leg.reference, !reference.isEmpty {
                    Text(reference).font(.popsMonospacedCaption)
                }
            }
            if let reference = journey.reference, !reference.isEmpty {
                Text(reference).font(.popsMonospacedCaption)
            }
        }
        if case .stay(let stay) = source {
            if let reference = stay.reference, !reference.isEmpty {
                Text(reference).font(.popsMonospacedCaption)
            }
            if let address = stay.address, !address.isEmpty { Text(address).font(.popsCaption) }
        }
        if case .event(let event) = source { TripEventStateLines(event: event) }
        if let start = source.start, let end = source.end, start >= end {
            Label("Recorded times conflict", systemImage: "exclamationmark.triangle")
                .font(.popsCaption).foregroundStyle(Color.popsWarning)
        }
    }
}
