import AppCore
import DesignSystem
import SwiftUI

internal struct TripsPlanVisitRow: View {
    internal let visit: TripVisit
    internal let place: String
    internal let sources: [TripSource]
    internal let places: [TripPlace]
    internal let openSource: (TripSource) -> Void
    @State private var expanded = false

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            if sources.isEmpty {
                heading
                notes
            } else {
                DisclosureGroup(isExpanded: $expanded) {
                    VStack(alignment: .leading, spacing: PopsSpacing.md) {
                        notes
                        ForEach(sources) {
                            TripsPlanLineSourceRow(
                                source: $0, places: places, openSource: openSource)
                        }
                    }
                    .padding(.top, PopsSpacing.sm)
                } label: {
                    heading
                        .accessibilityIdentifier("trip-plan-visit-\(visit.id)")
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var heading: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text(place).font(.popsHeadline).foregroundStyle(Color.popsForeground)
            Text(tripChapterTiming(visit.timing))
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
            if !sources.isEmpty {
                Text(sources.count == 1 ? "1 recorded source" : "\(sources.count) recorded sources")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
        .frame(minHeight: PopsSize.touchTarget, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var notes: some View {
        if !visit.notes.isEmpty { Text(visit.notes).font(.popsSubheadline) }
    }
}
