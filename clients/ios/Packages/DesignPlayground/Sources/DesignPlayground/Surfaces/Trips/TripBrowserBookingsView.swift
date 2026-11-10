import DesignSystem
import SwiftUI

/// Bookings follow route occurrences; records without a route association remain visible separately.
internal struct TripBrowserBookingsView: View {
    internal let trip: TripsBrowserTrip

    internal var body: some View {
        List {
            Text("Times in \(trip.today.displayZone)")
                .font(.popsCaption).foregroundStyle(Color.popsMutedForeground)
            ForEach(tripsBrowserRouteRows(trip)) { row in
                if !row.sourceIDs.isEmpty {
                    Section(row.title) {
                        ForEach(row.sourceIDs, id: \.self) { id in
                            if let source = tripsTodaySource(trip.today, id: id) {
                                TripBrowserSourceLink(source: source, trip: trip)
                            } else {
                                Label(
                                    "Missing Source · \(id)",
                                    systemImage: "exclamationmark.triangle")
                            }
                        }
                    }
                }
            }
            let associated = Set(tripsBrowserRouteRows(trip).flatMap(\.sourceIDs))
            let other = tripsTodayAllSources(trip.today).filter { !associated.contains($0.id) }
            if !other.isEmpty {
                Section("Other Bookings") {
                    ForEach(other) { source in
                        TripBrowserSourceLink(source: source, trip: trip)
                    }
                }
            }
            if tripsTodayAllSources(trip.today).isEmpty { Text("No Recorded Bookings") }
        }
    }
}
