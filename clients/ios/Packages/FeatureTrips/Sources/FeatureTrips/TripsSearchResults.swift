import AppCore
import DesignSystem
import SwiftUI

internal struct TripsSearchResults: View {
    internal let trips: [TripRecord]
    internal let snapshot: TripSnapshot?
    internal let selectTrip: (Int) -> Void
    internal let openSource: (TripSource) -> Void
    internal let query: String

    internal var body: some View {
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
                        Button {
                            openSource(source)
                        } label: {
                            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                                Text(source.displayName(places: snapshot.places)).font(
                                    .popsHeadline)
                                Text(source.summary).font(.popsCaption)
                                if source.isAlternative(in: snapshot) {
                                    Text("Alternative journey").font(.popsCaption)
                                }
                            }.frame(minHeight: PopsSize.touchTarget, alignment: .leading)
                        }
                    }
                }
            }
        }
    }

    private func matches(_ trip: TripRecord) -> Bool {
        [trip.name, trip.destination, trip.when, trip.notes].compactMap { $0 }
            .contains {
                $0.localizedCaseInsensitiveContains(
                    query.trimmingCharacters(in: .whitespacesAndNewlines))
            }
    }
}
