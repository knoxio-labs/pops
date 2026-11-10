import AppCore
import SwiftUI

internal struct TripsBookingsView: View {
    internal let snapshot: TripSnapshot
    @Environment(\.timeZone) private var zone
    @State private var query = ""
    @State private var scope = TripBookingScope.all

    internal var body: some View {
        List {
            Picker("Travel dates", selection: $scope) {
                ForEach(TripBookingScope.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.menu)
            let sources = allTripSources(snapshot).filter { source in
                scope.includes(source, at: .now)
                    && tripSourceMatches(source, query: query, places: snapshot.places)
            }
            ForEach(sources) {
                TripsSourceRow(
                    source: $0, zone: zone, places: snapshot.places,
                    context: $0.isAlternative(in: snapshot) ? "Alternative journey" : nil)
            }
            if sources.isEmpty {
                Text(query.isEmpty && scope == .all ? "No Recorded Bookings" : "No Matches")
            }
        }
        .searchable(text: $query, prompt: "Search Bookings")
    }
}
