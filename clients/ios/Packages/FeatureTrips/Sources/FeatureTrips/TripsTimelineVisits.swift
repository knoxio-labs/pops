import AppCore
import DesignSystem
import SwiftUI

internal struct TripsTimelineVisits: View {
    internal let snapshot: TripSnapshot
    internal let sources: [TripSource]
    internal let visits: [TripVisit]
    @Environment(\.timeZone) private var zone

    internal var body: some View {
        if !visits.isEmpty {
            Section("Visits") {
                ForEach(visits) { visit in visitRow(visit) }
            }
        }
    }

    @ViewBuilder private func visitRow(_ visit: TripVisit) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Label(
                snapshot.places.first { $0.id == visit.placeId }?.name ?? "Place unavailable",
                systemImage: "mappin.circle"
            )
            .font(.popsHeadline)
            let dates = [visit.timing.arrival, visit.timing.departure].compactMap { $0 }
            if !dates.isEmpty {
                Text(dates.map(TripClock.dayLabel).joined(separator: " – ")).font(.popsCaption)
            }
            if let duration = visit.timing.duration, let label = tripVisitDurationLabel(duration) {
                Text(label).font(.popsCaption)
            }
            if !visit.notes.isEmpty { Text(visit.notes).font(.popsSubheadline) }
        }
        .frame(minHeight: PopsSize.touchTarget, alignment: .leading)
        .id(visit.id)
        ForEach(sources.filter { $0.visitID == visit.id }) {
            TripsSourceRow(source: $0, zone: zone, places: snapshot.places)
        }
    }
}
