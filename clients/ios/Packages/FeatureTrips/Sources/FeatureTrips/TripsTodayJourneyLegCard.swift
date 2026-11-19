import AppCore
import DesignSystem
import SwiftUI

internal struct TripsTodayJourneyLegCard: View {
    internal let leg: TripJourneyLeg
    internal let places: [TripPlace]

    private var isFlight: Bool {
        leg.mode?.caseInsensitiveCompare("flight") == .orderedSame
    }

    private var accent: Color { isFlight ? .popsAccent : .popsTrips }

    internal var body: some View {
        TripsJourneyLegView(leg: leg, places: places, showsReference: false)
            .padding(PopsSpacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                accent.opacity(0.08), in: RoundedRectangle(cornerRadius: PopsRadius.control)
            )
            .overlay {
                RoundedRectangle(cornerRadius: PopsRadius.control)
                    .stroke(accent.opacity(0.22), lineWidth: PopsBorder.hairline)
            }
            .accessibilityElement(children: .combine)
    }
}
