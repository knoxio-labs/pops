import AppCore
import SwiftUI

internal struct TripsSearchView: View {
    internal let trips: [TripRecord]
    internal let snapshot: TripSnapshot?
    @Binding internal var query: String
    @State private var searchPresented = false
    internal let dismissSearch: () -> Void
    internal let selectTrip: (Int) -> Void
    internal let openSource: (TripSource) -> Void

    internal var body: some View {
        List {
            TripsSearchResults(
                trips: trips, snapshot: snapshot,
                selectTrip: selectTrip, openSource: openSource, query: query)
        }
        .searchable(
            text: $query, isPresented: $searchPresented,
            prompt: "Search Trips and Selected Bookings"
        )
        #if os(iOS)
            .toolbar {
                DefaultToolbarItem(kind: .search, placement: .bottomBar)
            }
        #endif
        .navigationTitle("Search")
        .onAppear { searchPresented = true }
        .onChange(of: searchPresented) { wasPresented, presented in
            if wasPresented && !presented { dismissSearch() }
        }
    }
}
