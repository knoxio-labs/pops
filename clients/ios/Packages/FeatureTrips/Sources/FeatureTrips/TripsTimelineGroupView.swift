import AppCore
import DesignSystem
import SwiftUI

internal struct TripsTimelineGroupView: View {
    internal let group: TripTimelineGroup
    internal let places: [TripPlace]
    internal let zone: TimeZone

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            Text(group.title)
                .font(.popsSectionLabel)
                .foregroundStyle(Color.popsTrips)
                .accessibilityAddTraits(.isHeader)
            VStack(alignment: .leading, spacing: PopsSpacing.md) {
                ForEach(group.entries) { entry in
                    switch entry {
                    case .visit(let visit): visitView(visit)
                    case .source(let source):
                        TripsSourceRow(source: source, zone: zone, places: places)
                    }
                }
            }
        }
    }

    @ViewBuilder private func visitView(_ item: TripTimelineVisit) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            PopsCard(appearance: .featured) {
                HStack(alignment: .top, spacing: PopsSpacing.md) {
                    Image(systemName: "mappin.and.ellipse")
                        .font(.popsHeadline)
                        .foregroundStyle(Color.popsTrips)
                        .frame(minWidth: PopsSize.touchTarget, minHeight: PopsSize.touchTarget)
                        .background(
                            Color.popsTripsTint,
                            in: RoundedRectangle(
                                cornerRadius: PopsRadius.control)
                        )
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                        Text(item.placeName)
                            .font(.popsHeadline)
                            .foregroundStyle(Color.popsForeground)
                            .fixedSize(horizontal: false, vertical: true)
                        visitTiming(item.visit)
                        if !item.visit.notes.isEmpty {
                            Text(item.visit.notes)
                                .font(.popsSubheadline)
                                .foregroundStyle(Color.popsMutedForeground)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            if !item.sources.isEmpty {
                VStack(spacing: PopsSpacing.md) {
                    ForEach(item.sources) {
                        TripsSourceRow(source: $0, zone: zone, places: places)
                    }
                }
            }
        }
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder private func visitTiming(_ visit: TripVisit) -> some View {
        Text(tripChapterTiming(visit.timing))
            .font(.popsCaption)
            .foregroundStyle(Color.popsMutedForeground)
    }
}
