import AppCore
import DesignSystem
import SwiftUI

internal struct TripsTodayView: View {
    internal let snapshot: TripSnapshot
    @Environment(\.timeZone) private var zone

    internal var body: some View {
        TimelineView(.everyMinute) { context in
            let projection = TripTodayProjection(snapshot: snapshot, at: context.date)
            List {
                sourceSection("Now", projection.now)
                sourceSection("Next", projection.next)
                sourceSection("Other recorded timing", projection.other)
                ForEach(tripReferenceFindings(snapshot)) { finding in
                    Label(finding.message, systemImage: "exclamationmark.triangle")
                        .font(.popsSubheadline).foregroundStyle(Color.popsWarning)
                }
                if tripSources(snapshot).isEmpty {
                    Text("No Recorded Stays or Journeys").font(.popsBody)
                }
            }
        }
    }

    @ViewBuilder private func sourceSection(_ name: String, _ sources: [TripSource]) -> some View {
        if !sources.isEmpty {
            Section(name) {
                ForEach(sources) { TripsSourceRow(source: $0, zone: zone, places: snapshot.places) }
            }
        }
    }
}
