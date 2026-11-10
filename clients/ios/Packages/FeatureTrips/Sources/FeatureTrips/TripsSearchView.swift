import AppCore
import SwiftUI

internal struct TripsSearchView: View {
    internal let trips: [TripRecord]
    internal let snapshot: TripSnapshot?
    internal let selectTrip: (Int) -> Void
    internal let openSource: (TripSource) -> Void
    @State private var query = ""

    internal var body: some View {
        List {
            TripsSearchResults(
                trips: trips, snapshot: snapshot,
                selectTrip: selectTrip, openSource: openSource, query: query)
        }
        .searchable(text: $query, prompt: "Search Trips and Selected Bookings")
        .navigationTitle("Search")
    }
}
