import AppCore
import DesignSystem
import SwiftUI

internal struct TripSourceDetailLeg: View {
    internal let position: TripSourceDetailLegPosition
    internal let places: [TripPlace]

    private var leg: TripJourneyLeg { position.leg }

    internal var body: some View {
        let detail = TripSourceDetailLegPresentation(leg: leg)
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            Text(position.heading).font(.popsHeadline).accessibilityAddTraits(.isHeader)
            PopsCard(appearance: .featured) {
                VStack(alignment: .leading, spacing: PopsSpacing.xl) {
                    TripsJourneyLegView(leg: leg, places: places, showsReference: false)
                    TripSourceDetailFactRows(facts: detail.facts)
                }
            }
            ForEach(Array(detail.references.enumerated()), id: \.offset) { _, group in
                TripSourceDetailReferences(group: group)
            }
        }
    }
}

internal struct TripSourceDetailLegPosition: Identifiable {
    internal let leg: TripJourneyLeg
    internal let ordinal: Int

    internal var id: Int { leg.id }
    internal var heading: String { "Leg \(ordinal)" }

    internal static func ordered(_ legs: [TripJourneyLeg]) -> [Self] {
        legs.enumerated().map { index, leg in
            Self(leg: leg, ordinal: index + 1)
        }
    }
}
