import AppCore
import DesignSystem
import SwiftUI

internal struct TripsTimelineCalendar: View {
    internal let sources: [TripSource]
    internal let places: [TripPlace]
    internal let filter: TripTimelineFilter
    @Environment(\.timeZone) private var zone

    internal var body: some View {
        let facts = tripCalendarFacts(sources: sources, zone: zone).filter {
            filter.includes(day: $0.day)
        }
        let keys = Set(facts.map(key)).sorted()
        ForEach(keys, id: \.self) { group in
            Section(filter.grouping == .day ? TripClock.dayLabel(group) : group) {
                ForEach(facts.filter { key($0) == group }) { fact in
                    NavigationLink {
                        TripsSourceView(source: fact.source, places: places)
                    } label: {
                        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                            Text(fact.source.displayName(places: places)).font(.popsHeadline)
                            Text("\(TripClock.dayLabel(fact.day)) · \(fact.label)").font(
                                .popsCaption)
                            if let instant = fact.instant {
                                Text(TripClock.clockLabel(instant, zone: zone)).font(
                                    .popsSubheadline)
                            }
                        }.frame(minHeight: PopsSize.touchTarget)
                    }
                }
            }
        }
        let continuations = sources.filter { source in
            let recorded = tripCalendarFacts(sources: [source], zone: zone)
            return !recorded.isEmpty && !recorded.contains { filter.includes(day: $0.day) }
        }
        if !continuations.isEmpty {
            Section("Overlapping recorded intervals") {
                ForEach(continuations) { TripsSourceRow(source: $0, zone: zone, places: places) }
            }
        }
        let undated = sources.filter { tripCalendarFacts(sources: [$0], zone: zone).isEmpty }
        if !undated.isEmpty {
            Section("Timing not resolved") {
                ForEach(undated) { TripsSourceRow(source: $0, zone: zone, places: places) }
            }
        }
    }

    private func key(_ fact: TripCalendarFact) -> String {
        filter.grouping == .month ? String(fact.day.prefix(7)) : fact.day
    }
}
