import AppCore
import DesignSystem
import SwiftUI

internal struct TripsSearchView: View {
    internal let trips: [TripRecord]
    internal let snapshot: TripSnapshot?
    internal let selectTrip: (Int) -> Void
    @Environment(\.timeZone) private var zone
    @State private var query = ""

    internal var body: some View {
        List {
            if !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Section("Trips") {
                    ForEach(trips.filter(matches)) { trip in
                        Button {
                            selectTrip(trip.id)
                        } label: {
                            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                                Text(tripName(trip)).font(.popsHeadline)
                                if !trip.when.isEmpty { Text(trip.when).font(.popsCaption) }
                            }.frame(minHeight: PopsSize.touchTarget, alignment: .leading)
                        }
                    }
                }
                if let snapshot {
                    Section("Selected Trip Bookings") {
                        ForEach(
                            allTripSources(snapshot).filter {
                                tripSourceMatches($0, query: query, places: snapshot.places)
                            }
                        ) { source in
                            TripsSourceRow(
                                source: source, zone: zone, places: snapshot.places,
                                context: source.isAlternative(in: snapshot)
                                    ? "Alternative journey" : nil)
                        }
                    }
                }
            }
        }
        .searchable(text: $query, prompt: "Search Trips and Selected Bookings")
        .navigationTitle("Search")
    }

    private func matches(_ trip: TripRecord) -> Bool {
        [trip.name, trip.destination, trip.when, trip.notes].compactMap { $0 }
            .contains {
                $0.localizedCaseInsensitiveContains(
                    query.trimmingCharacters(in: .whitespacesAndNewlines))
            }
    }
}
