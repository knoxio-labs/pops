import AppCore
import DesignSystem
import SwiftUI

internal struct TripsCalendarView: View {
    internal let snapshot: TripSnapshot
    @Environment(\.timeZone) private var zone

    internal var body: some View {
        let facts = tripCalendarFacts(snapshot, zone: zone)
        let days = Set(facts.map(\.day)).sorted()
        List {
            Text("Times in \(zone.identifier)").font(.popsCaption)
            ForEach(days, id: \.self) { day in
                Section(TripClock.dayLabel(day)) {
                    ForEach(facts.filter { $0.day == day }) { fact in
                        NavigationLink {
                            TripsSourceView(source: fact.source, places: snapshot.places)
                        } label: {
                            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                                Text(fact.source.displayName(places: snapshot.places)).font(
                                    .popsHeadline)
                                Text(fact.label).font(.popsCaption)
                                if let instant = fact.instant {
                                    Text(TripClock.clockLabel(instant, zone: zone)).font(
                                        .popsSubheadline)
                                }
                            }
                            .frame(minHeight: PopsSize.touchTarget, alignment: .leading)
                        }
                    }
                }
            }
            let represented = Set(facts.map { $0.source.id })
            let unplaced = tripSources(snapshot).filter { !represented.contains($0.id) }
            if !unplaced.isEmpty {
                Section("Timing not resolved") {
                    ForEach(unplaced) {
                        TripsSourceRow(source: $0, zone: zone, places: snapshot.places)
                    }
                }
            }
            if facts.isEmpty && unplaced.isEmpty { Text("No Recorded Dates") }
        }
    }
}
