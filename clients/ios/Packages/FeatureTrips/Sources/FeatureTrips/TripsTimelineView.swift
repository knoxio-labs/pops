import AppCore
import DesignSystem
import SwiftUI

internal struct TripsTimelineView: View {
    internal let snapshot: TripSnapshot
    @Environment(\.timeZone) private var zone
    @State private var filter = TripTimelineFilter()

    internal var body: some View {
        TimelineView(.everyMinute) { context in
            let sources = filter.sources(in: snapshot, at: context.date, zone: zone)
            List {
                TripsTimelineControls(filter: $filter)
                ForEach(tripReferenceFindings(snapshot)) { finding in
                    Label(finding.message, systemImage: "exclamationmark.triangle")
                        .font(.popsSubheadline).foregroundStyle(Color.popsWarning)
                }
                let today = TripTodayProjection(snapshot: snapshot, at: context.date)
                nowNext("Now", today.now, visible: sources)
                nowNext("Next", today.next, visible: sources)
                if filter.grouping == .sourceOrder {
                    TripsTimelineRoute(
                        snapshot: snapshot, sources: sources,
                        visits: filter.visits(in: snapshot, sources: sources))
                } else {
                    TripsTimelineVisits(
                        snapshot: snapshot, sources: [],
                        visits: filter.visits(in: snapshot, sources: sources))
                    TripsTimelineCalendar(sources: sources, places: snapshot.places, filter: filter)
                }
                if sources.isEmpty && filter.visits(in: snapshot, sources: sources).isEmpty {
                    Text("No matching recorded sources")
                }
            }
        }
        .searchable(text: $filter.query, prompt: "Search this Trip")
    }

    @ViewBuilder private func nowNext(
        _ title: String, _ sources: [TripSource], visible: [TripSource]
    ) -> some View {
        let values = sources.filter { source in visible.contains { $0.id == source.id } }
        if !values.isEmpty {
            Section(title) {
                ForEach(values) { TripsSourceRow(source: $0, zone: zone, places: snapshot.places) }
            }
        }
    }
}
