import AppCore
import DesignSystem
import SwiftUI

internal struct TripsPlanView: View {
    internal let snapshot: TripSnapshot
    @Binding internal var calendar: Bool
    @Environment(\.timeZone) private var zone

    internal var body: some View {
        VStack(spacing: PopsSpacing.zero) {
            Picker("Plan", selection: $calendar) {
                Text("Route").tag(false)
                Text("Calendar").tag(true)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, PopsSpacing.lg).padding(.vertical, PopsSpacing.sm)
            if calendar {
                TripsCalendarView(snapshot: snapshot)
            } else {
                List {
                    ForEach(tripReferenceFindings(snapshot)) { finding in
                        Label(finding.message, systemImage: "exclamationmark.triangle")
                            .font(.popsSubheadline).foregroundStyle(Color.popsWarning)
                    }
                    Section("Route") {
                        ForEach(snapshot.visits) { visit in visitRow(visit) }
                        if snapshot.visits.isEmpty { Text("No Recorded Visits") }
                    }
                    let journeys = tripSources(snapshot).filter {
                        if case .journey = $0 { return true }
                        return false
                    }
                    if !journeys.isEmpty {
                        Section("Journeys") {
                            ForEach(journeys) {
                                TripsSourceRow(source: $0, zone: zone, places: snapshot.places)
                            }
                        }
                    }
                    let unlinked = snapshot.stays.filter { stay in
                        !snapshot.visits.contains { $0.id == stay.visitId }
                    }
                    if !unlinked.isEmpty {
                        Section("Other Stays") {
                            ForEach(unlinked) {
                                TripsSourceRow(
                                    source: .stay($0), zone: zone, places: snapshot.places)
                            }
                        }
                    }
                }
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
            if !visit.notes.isEmpty { Text(visit.notes).font(.popsSubheadline) }
        }
        .frame(minHeight: PopsSize.touchTarget, alignment: .leading)
        ForEach(snapshot.stays.filter { $0.visitId == visit.id }) {
            TripsSourceRow(source: .stay($0), zone: zone, places: snapshot.places)
        }
    }
}
