import AppCore
import DesignSystem
import SwiftUI

internal struct TripsStayDetailView: View {
    internal let stay: TripStay

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            TripsSourceDetailCard(title: "Your stay", symbol: "bed.double.fill") {
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .top, spacing: PopsSpacing.lg) {
                        TripsSourceMomentView(
                            label: "Check-in",
                            moment: tripSourceMoment(
                                day: stay.timing.arrival, clock: stay.timing.checkIn,
                                timeZone: stay.timing.timeZone))
                        Rectangle().fill(Color.popsSeparator).frame(width: PopsBorder.hairline)
                        TripsSourceMomentView(
                            label: "Check-out",
                            moment: tripSourceMoment(
                                day: stay.timing.departure, clock: stay.timing.checkOut,
                                timeZone: stay.timing.timeZone))
                    }
                    VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                        TripsSourceMomentView(
                            label: "Check-in",
                            moment: tripSourceMoment(
                                day: stay.timing.arrival, clock: stay.timing.checkIn,
                                timeZone: stay.timing.timeZone))
                        TripsSourceMomentView(
                            label: "Check-out",
                            moment: tripSourceMoment(
                                day: stay.timing.departure, clock: stay.timing.checkOut,
                                timeZone: stay.timing.timeZone))
                    }
                }
            }
            TripsSourceFactsCard(
                title: "Good to know", symbol: "info.circle",
                facts: facts)
            TripsSourceReferencesCard(title: "Booking source", links: stay.sourceLinks)
            TripsSourceReferencesCard(title: "Host details", links: stay.hostLinks)
            TripsSourceReferencesCard(title: "Related documents", links: stay.documentLinks)
        }
    }

    private var facts: [TripsSourceFact] {
        [
            stay.kind.map { TripsSourceFact(label: "Type", value: $0) },
            stay.address.map { TripsSourceFact(label: "Address", value: $0) },
            stay.reference.map {
                TripsSourceFact(label: "Booking reference", value: $0)
            },
            stay.notes.isEmpty ? nil : TripsSourceFact(label: "Notes", value: stay.notes),
        ].compactMap { $0 }
    }
}
