import AppCore
import DesignSystem
import SwiftUI

internal struct TripsSourceView: View {
    internal let source: TripSource
    internal let places: [TripPlace]

    internal var body: some View {
        let detail = TripSourceDetailPresentation(source: source)
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.xl) {
                header(detail)
                if !detail.timings.isEmpty {
                    TripSourceDetailSchedule(timings: detail.timings)
                }
                if case .journey(let journey) = source {
                    if journey.legs.isEmpty {
                        PopsCard(appearance: .featured) {
                            Text("No journey legs recorded")
                                .foregroundStyle(Color.popsMutedForeground)
                        }
                    }
                    ForEach(TripSourceDetailLegPosition.ordered(journey.legs)) { position in
                        TripSourceDetailLeg(position: position, places: places)
                    }
                }
                TripSourceDetailFacts(title: "Booking details", facts: detail.facts)
                ForEach(Array(detail.references.enumerated()), id: \.offset) { _, group in
                    TripSourceDetailReferences(group: group)
                }
                if let start = source.start, let end = source.end, start >= end {
                    Label("Recorded times conflict", systemImage: "exclamationmark.triangle")
                        .font(.popsBody)
                        .foregroundStyle(Color.popsTripsAttention)
                }
            }
            .padding(PopsSpacing.lg)
            .frame(maxWidth: .infinity, alignment: .leading)
            .textSelection(.enabled)
        }
        .font(.popsBody)
        .background(Color.popsBackground)
        .navigationTitle("Details")
        .popsTitleDisplay(large: false)
    }

    private func header(_ detail: TripSourceDetailPresentation) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            Label(detail.kind, systemImage: source.symbol)
                .font(.popsSectionLabel)
                .foregroundStyle(Color.popsTrips)
            Text(source.displayName(places: places))
                .font(.popsLargeTitle)
                .foregroundStyle(Color.popsForeground)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            if !detail.states.isEmpty {
                PopsCard(appearance: .featured) {
                    TripSourceDetailFactRows(facts: detail.states)
                }
            }
        }
    }
}
