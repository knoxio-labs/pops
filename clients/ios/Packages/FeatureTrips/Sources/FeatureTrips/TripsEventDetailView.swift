import AppCore
import DesignSystem
import SwiftUI

internal struct TripsEventDetailView: View {
    internal let event: TripEvent

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            TripsSourceDetailCard(title: "When", symbol: "calendar") {
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .top, spacing: PopsSpacing.lg) {
                        TripsSourceMomentView(
                            label: "Starts",
                            moment: tripSourceMoment(
                                day: event.timing.start, clock: event.timing.startTime,
                                timeZone: event.timing.timeZone))
                        Rectangle().fill(Color.popsSeparator).frame(width: PopsBorder.hairline)
                        TripsSourceMomentView(
                            label: "Ends",
                            moment: tripSourceMoment(
                                day: event.timing.end, clock: event.timing.endTime,
                                timeZone: event.timing.timeZone))
                    }
                    VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                        TripsSourceMomentView(
                            label: "Starts",
                            moment: tripSourceMoment(
                                day: event.timing.start, clock: event.timing.startTime,
                                timeZone: event.timing.timeZone))
                        TripsSourceMomentView(
                            label: "Ends",
                            moment: tripSourceMoment(
                                day: event.timing.end, clock: event.timing.endTime,
                                timeZone: event.timing.timeZone))
                    }
                }
            }
            TripsSourceFactsCard(
                title: "Event details", symbol: "sparkles",
                facts: facts)
            TripsSourceReferencesCard(title: "Event source", links: event.sourceLinks)
            TripsSourceReferencesCard(title: "Venue details", links: event.venueLinks)
            TripsSourceReferencesCard(title: "Organiser details", links: event.organiserLinks)
            TripsSourceReferencesCard(title: "Related documents", links: event.documentLinks)
        }
    }

    private var facts: [TripsSourceFact] {
        [
            event.address.map { TripsSourceFact(label: "Venue", value: $0) },
            event.reference.map { TripsSourceFact(label: "Reference", value: $0) },
            event.sourceUrl.map { TripsSourceFact(label: "Event page", value: $0) },
            event.ticketUrl.map { TripsSourceFact(label: "Ticket", value: $0) },
            event.notes.isEmpty ? nil : TripsSourceFact(label: "Notes", value: event.notes),
        ].compactMap { $0 }
    }
}
