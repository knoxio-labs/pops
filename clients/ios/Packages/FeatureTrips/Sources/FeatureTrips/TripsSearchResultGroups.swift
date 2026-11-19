import AppCore
import DesignSystem
import SwiftUI

internal struct TripsSearchResultGroups: View {
    internal let trips: [TripRecord]
    internal let sources: [TripSource]
    internal let places: [TripPlace]
    internal let visits: [TripVisit]
    internal let snapshot: TripSnapshot?
    internal let hasQuery: Bool
    internal let selectTrip: (Int) -> Void
    internal let openSource: (TripSource) -> Void

    private var flights: [TripSource] { sources.filter(isFlightJourney) }

    private var journeys: [TripSource] {
        sources.filter { isJourney($0) && !isFlightJourney($0) }
    }

    private var stays: [TripSource] { sources.filter(isStay) }

    private var moments: [TripSource] { sources.filter(isEvent) }

    private var hitCount: Int {
        trips.count + sources.count + places.count + visits.count
    }

    internal var body: some View {
        if hitCount == 0 {
            ContentUnavailableView {
                Label("Nothing found yet", systemImage: "sparkle.magnifyingglass")
            } description: {
                Text(emptyResultsMessage)
            }
            .foregroundStyle(Color.popsMutedForeground)
        } else {
            VStack(alignment: .leading, spacing: PopsSpacing.xl) {
                if !trips.isEmpty {
                    resultSection("Trips", symbol: "map") {
                        ForEach(trips) { trip in tripCard(trip) }
                    }
                }
                if !flights.isEmpty {
                    resultSection("Flights", symbol: "airplane") {
                        ForEach(flights) { source in sourceCard(source) }
                    }
                }
                if !journeys.isEmpty {
                    resultSection("Journeys", symbol: "arrow.triangle.swap") {
                        ForEach(journeys) { source in sourceCard(source) }
                    }
                }
                if !stays.isEmpty {
                    resultSection("Stays", symbol: "bed.double.fill") {
                        ForEach(stays) { source in sourceCard(source) }
                    }
                }
                if !moments.isEmpty {
                    resultSection("Moments", symbol: "calendar") {
                        ForEach(moments) { source in sourceCard(source) }
                    }
                }
                if !places.isEmpty || !visits.isEmpty {
                    resultSection("Places & plans", symbol: "mappin.and.ellipse") {
                        ForEach(places) { place in placeCard(place) }
                        ForEach(visits) { visit in visitCard(visit) }
                    }
                }
            }
        }
    }

    private var emptyResultsMessage: String {
        hasQuery
            ? "Try a place, flight code, booking reference or note."
            : "Nothing is recorded in this part of the trip yet."
    }

    private func resultSection<Content: View>(
        _ title: String, symbol: String, @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            Label(title, systemImage: symbol)
                .font(.popsHeadline)
                .foregroundStyle(Color.popsForeground)
                .accessibilityAddTraits(.isHeader)
            VStack(spacing: PopsSpacing.md, content: content)
        }
    }

    private func tripCard(_ trip: TripRecord) -> some View {
        let detail = [trip.destination, trip.when]
            .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            .joined(separator: " · ")
        let content = TripsSearchCardContent(
            title: tripName(trip), category: "TRIP", detail: detail,
            symbol: "map.fill", accent: .popsTrips)
        return resultCard(content, hint: "Opens this trip") {
            selectTrip(trip.id)
        }
    }

    private func sourceCard(_ source: TripSource) -> some View {
        let style = TripsSourceStyle(source: source)
        let content = TripsSearchCardContent(
            title: source.displayName(places: snapshot?.places ?? []),
            category: style.kind.uppercased(), detail: source.summary,
            symbol: style.symbol, accent: style.accent)
        return resultCard(content, hint: "Opens this booking") {
            openSource(source)
        }
    }

    private func placeCard(_ place: TripPlace) -> some View {
        let content = TripsSearchCardContent(
            title: place.name, category: "PLACE", detail: snapshot.map { tripName($0.trip) },
            symbol: "mappin.and.ellipse", accent: .popsTrips)
        return resultCard(content, hint: "Opens the trip plan") {
            if let tripID = snapshot?.trip.id { selectTrip(tripID) }
        }
    }

    private func visitCard(_ visit: TripVisit) -> some View {
        let place = snapshot?.places.first { $0.id == visit.placeId }
        let content = TripsSearchCardContent(
            title: place?.name ?? "Route stop", category: "PLAN",
            detail: visitSummary(visit),
            symbol: "point.topleft.down.to.point.bottomright.curvepath",
            accent: .popsTrips)
        return resultCard(content, hint: "Opens the trip plan") {
            if let tripID = snapshot?.trip.id { selectTrip(tripID) }
        }
    }

    private func resultCard(
        _ content: TripsSearchCardContent, hint: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            TripsSearchResultCard(content: content)
        }
        .buttonStyle(.plain)
        .accessibilityHint(hint)
    }

    private func visitSummary(_ visit: TripVisit) -> String {
        let dates = [visit.timing.arrival, visit.timing.departure]
            .compactMap { $0 }
            .map(TripClock.dayLabel)
        let dateText = dates.joined(separator: " – ")
        return [dateText, visit.notes].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    private func isJourney(_ source: TripSource) -> Bool {
        if case .journey = source { return true }
        return false
    }

    private func isStay(_ source: TripSource) -> Bool {
        if case .stay = source { return true }
        return false
    }

    private func isEvent(_ source: TripSource) -> Bool {
        if case .event = source { return true }
        return false
    }
}
