import AppCore
import DesignSystem
import SwiftUI

internal struct TripsSourceCard: View {
    internal let source: TripSource
    internal let zone: TimeZone
    internal let places: [TripPlace]
    internal var context: String?
    internal var isCurrent = false

    internal var body: some View {
        PopsCard(appearance: .featured) {
            VStack(alignment: .leading, spacing: isCurrent ? PopsSpacing.md : PopsSpacing.lg) {
                TripsSourceHeading(
                    title: source.displayName(places: places), symbol: source.symbol,
                    context: context)
                if case .journey(let journey) = source {
                    ForEach(journey.legs) {
                        TripsJourneyLegView(leg: $0, places: places, showsReference: !isCurrent)
                    }
                } else {
                    TripsSourceScheduleView(
                        value: TripSourceSchedulePresentation(source: source, isCurrent: isCurrent),
                        zone: zone)
                }
                if let status = source.status, !status.isEmpty {
                    Text(status)
                        .font(.popsSubheadline)
                        .foregroundStyle(Color.popsMutedForeground)
                }
                TripSourceStateLines(source: source, showsReferences: !isCurrent)
            }
            .frame(minHeight: PopsSize.touchTarget, alignment: .leading)
        }
        .accessibilityElement(children: .combine)
    }
}
