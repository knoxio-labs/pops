import AppCore
import DesignSystem
import SwiftUI

internal struct TripsTimelineRoute: View {
    internal let snapshot: TripSnapshot
    internal let sources: [TripSource]
    internal let visits: [TripVisit]
    @Environment(\.timeZone) private var zone

    internal var body: some View {
        TripsTimelineVisits(snapshot: snapshot, sources: sources, visits: visits)
        let journeys = sources.filter { if case .journey = $0 { true } else { false } }
        if !journeys.isEmpty {
            Section("Journeys") {
                ForEach(journeys) { row($0) }
            }
        }
        let unlinked = sources.filter { source in
            if case .journey = source { return false }
            return !visits.contains { $0.id == source.visitID }
        }
        if !unlinked.isEmpty {
            Section("Other recorded sources") {
                ForEach(unlinked) { row($0) }
            }
        }
    }

    private func row(_ source: TripSource) -> some View {
        TripsSourceRow(
            source: source, zone: zone, places: snapshot.places,
            context: source.isAlternative(in: snapshot) ? "Alternative journey" : nil)
    }
}
