import DesignSystem
import SwiftUI

/// One searchable catalogue spans bookings, people, places, file metadata and saved ideas across history.
internal struct TripBrowserSearchView: View {
    internal let state: TripsBrowserState
    @State private var query = ""
    @State private var scope = TripsBrowserSearchScope.selectedTrip

    internal var body: some View {
        List {
            Section {
                Picker("Search Scope", selection: $scope) {
                    Text("This Trip").tag(TripsBrowserSearchScope.selectedTrip)
                    Text("All Trips").tag(TripsBrowserSearchScope.allTrips)
                }
                .pickerStyle(.segmented)
            }
            let results = tripsBrowserSearch(state, query: query, scope: scope)
            ForEach(TripsBrowserSearchKind.allCases, id: \.self) { kind in
                let matches = results.filter { $0.kind == kind }
                if !matches.isEmpty {
                    Section(kind.title) {
                        ForEach(matches) { result in
                            NavigationLink {
                                TripBrowserSearchDestination(result: result, state: state)
                            } label: {
                                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                                    Text(result.title).font(.popsHeadline)
                                    Text(result.subtitle).font(.popsCaption)
                                        .foregroundStyle(Color.popsMutedForeground)
                                }
                                .frame(minHeight: PopsSize.touchTarget, alignment: .leading)
                            }
                        }
                    }
                }
            }
            if results.isEmpty { Text("No Matching Records") }
        }
        .navigationTitle("Search")
        .searchable(text: $query, prompt: "Trips, people, places, codes")
    }
}

/// A search result opens by trip and record identity, including records belonging to past plans.
internal struct TripBrowserSearchDestination: View {
    internal let result: TripsBrowserSearchResult
    internal let state: TripsBrowserState

    internal var body: some View {
        if let trip = state.trips.first(where: { $0.id == result.tripID }) {
            destination(trip)
        } else {
            ContentUnavailableView("Trip Unavailable", systemImage: "map")
        }
    }

    @ViewBuilder private func destination(_ trip: TripsBrowserTrip) -> some View {
        switch result.kind {
        case .booking:
            if let source = tripsTodaySource(trip.today, id: result.recordID) {
                TripBrowserSourceView(source: source, trip: trip)
            }
        case .contact:
            if let contact = trip.contacts.first(where: { $0.id == result.recordID }) {
                TripBrowserContactView(contact: contact, trip: trip)
            }
        case .document:
            if let document = trip.documents.first(where: { $0.id == result.recordID }) {
                TripBrowserDocumentView(document: document, trip: trip)
            }
        case .idea:
            if let idea = trip.ideas.first(where: { $0.id == result.recordID }) {
                TripBrowserIdeaView(idea: idea, trip: trip)
            }
        case .visit:
            if let row = tripsBrowserRouteRows(trip).first(where: {
                $0.visit?.id == result.recordID
            }) {
                TripBrowserRouteDetail(row: row, trip: trip)
            }
        case .place:
            List {
                ForEach(tripsBrowserRouteRows(trip).filter { $0.visit?.placeID == result.recordID })
                { row in
                    NavigationLink(row.title) { TripBrowserRouteDetail(row: row, trip: trip) }
                }
                ForEach(trip.ideas.filter { $0.placeID == result.recordID }) { idea in
                    NavigationLink(idea.title) { TripBrowserIdeaView(idea: idea, trip: trip) }
                }
            }
            .navigationTitle(result.title)
        case .trip:
            TripBrowserTripDetail(trip: trip)
        }
    }
}

/// A historical trip opens its recorded route without implying that its plans were travelled.
internal struct TripBrowserTripDetail: View {
    internal let trip: TripsBrowserTrip
    @State private var calendar = false

    internal var body: some View {
        TripBrowserPlanView(trip: trip, calendar: $calendar)
            .navigationTitle(trip.name)
            .playgroundTitleDisplay(large: false)
    }
}
