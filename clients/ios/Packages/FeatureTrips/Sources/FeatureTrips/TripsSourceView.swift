import AppCore
import DesignSystem
import SwiftUI

internal struct TripsSourceView: View {
    internal let source: TripSource
    internal let places: [TripPlace]

    internal var body: some View {
        List {
            switch source {
            case .stay(let stay): stayFields(stay)
            case .journey(let journey): journeyFields(journey)
            case .event(let event): eventFields(event)
            }
        }
        .font(.popsBody)
        .navigationTitle(source.displayName(places: places))
        .popsTitleDisplay(large: false)
    }

    @ViewBuilder private func stayFields(_ stay: TripStay) -> some View {
        Section {
            fact("Booking state", stay.status)
            fact("Arrival", stay.timing.arrival.map(TripClock.dayLabel))
            fact("Check-in", stay.timing.checkIn)
            fact("Departure", stay.timing.departure.map(TripClock.dayLabel))
            fact("Check-out", stay.timing.checkOut)
            fact("Time zone", stay.timing.timeZone)
            fact("Reference", stay.reference)
            fact("Address", stay.address)
            fact("Notes", stay.notes)
        }
        references("Source", stay.sourceLinks)
        references("Host references", stay.hostLinks)
        references("Document references", stay.documentLinks)
    }

    @ViewBuilder private func journeyFields(_ journey: TripJourney) -> some View {
        Section {
            fact("Reference", journey.reference)
            fact("Notes", journey.notes)
        }
        ForEach(journey.legs) { leg in
            Section(leg.service ?? "Leg \(leg.id)") {
                fact("Mode", leg.mode)
                fact("From", tripEndpointName(leg.from, places: places))
                endpoint("Departure", leg.from)
                fact("To", tripEndpointName(leg.to, places: places))
                endpoint("Arrival", leg.to)
                fact("Intention", leg.intention)
                fact("Arrangement", leg.arrangement)
                fact("Purchase", leg.purchase)
                fact("Operator", leg.operator)
                fact("Reference", leg.reference)
                fact("Notes", leg.notes)
            }
            references("Leg source", leg.sourceLinks)
        }
        references("Source", journey.sourceLinks)
    }

    @ViewBuilder private func eventFields(_ event: TripEvent) -> some View {
        Section {
            fact("Intention", event.intention)
            fact("Arrangement", event.arrangement)
            fact("Purchase", event.purchase)
            fact("Start", event.timing.start.map(TripClock.dayLabel))
            fact("Start time", event.timing.startTime)
            fact("End", event.timing.end.map(TripClock.dayLabel))
            fact("End time", event.timing.endTime)
            fact("Time zone", event.timing.timeZone)
            fact("Reference", event.reference)
            fact("Address", event.address)
            fact("Source URL", event.sourceUrl)
            fact("Ticket URL", event.ticketUrl)
            fact("Notes", event.notes)
        }
        references("Source", event.sourceLinks)
        references("Venue references", event.venueLinks)
        references("Organiser references", event.organiserLinks)
        references("Document references", event.documentLinks)
    }

    @ViewBuilder private func endpoint(_ label: String, _ endpoint: TripEndpoint) -> some View {
        fact(label, endpoint.local)
        fact("\(label) time zone", endpoint.timeZone)
        if let local = endpoint.local, let zone = endpoint.timeZone,
            TripClock.instant(local: local, zone: zone) == nil
        {
            Label("Source time cannot be resolved", systemImage: "exclamationmark.triangle")
                .font(.popsCaption).foregroundStyle(Color.popsWarning)
        }
    }

    @ViewBuilder private func fact(_ label: String, _ value: String?) -> some View {
        if let value, !value.isEmpty {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(label).font(.popsCaption).foregroundStyle(Color.popsMutedForeground)
                Text(value).font(.popsBody).textSelection(.enabled)
            }
        }
    }

    @ViewBuilder private func references(_ title: String, _ links: [TripSourceLink]) -> some View {
        if !links.isEmpty {
            Section(title) {
                ForEach(Array(links.enumerated()), id: \.offset) { _, link in
                    VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                        if let label = link.label, !label.isEmpty {
                            Text(label).font(.popsSubheadline)
                        }
                        Text(link.uri).font(.popsCaption).textSelection(.enabled)
                    }
                }
            }
        }
    }
}
