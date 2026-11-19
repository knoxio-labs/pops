import AppCore
import DesignSystem
import SwiftUI

internal struct TripsSearchResults: View {
    internal let trips: [TripRecord]
    internal let snapshot: TripSnapshot?
    internal let selectTrip: (Int) -> Void
    internal let openSource: (TripSource) -> Void
    internal let query: String
    @Binding internal var filter: TripsSearchFilter

    private var sources: [TripSource] {
        guard let snapshot else { return [] }
        return allTripSources(snapshot).filter {
            filter.includes($0) && tripSourceMatches($0, query: query, places: snapshot.places)
        }
    }

    private var matchingTrips: [TripRecord] {
        guard filter == .all || filter == .trips else { return [] }
        return trips.filter { tripRecordMatches($0, query: query) }
    }

    private var matchingPlaces: [TripPlace] {
        guard filter == .all || filter == .places, let snapshot else { return [] }
        return snapshot.places.filter { tripPlaceMatches($0, query: query) }
    }

    private var matchingVisits: [TripVisit] {
        guard filter == .all || filter == .places, let snapshot else { return [] }
        return snapshot.visits.filter { visit in
            let place = snapshot.places.first { $0.id == visit.placeId }
            return tripVisitMatches(visit, place: place, query: query)
        }
    }

    private var hasQuery: Bool {
        !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var hitCount: Int {
        matchingTrips.count + sources.count + matchingPlaces.count + matchingVisits.count
    }

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.xl) {
                if hasQuery || filter != .all {
                    TripsSearchResultHeading(filter: filter, hitCount: hitCount)
                } else {
                    TripsSearchWelcomeCard(tripName: snapshot.map { tripName($0.trip) })
                }

                TripsSearchFilterPicker(filter: $filter)

                if hasQuery || filter != .all {
                    TripsSearchResultGroups(
                        trips: matchingTrips, sources: sources,
                        places: matchingPlaces, visits: matchingVisits,
                        snapshot: snapshot, hasQuery: hasQuery,
                        selectTrip: selectTrip, openSource: openSource)
                } else {
                    TripsSearchHints()
                }
            }
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.top, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.xxl)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Color.popsBackground)
        .scrollIndicators(.hidden)
    }
}
