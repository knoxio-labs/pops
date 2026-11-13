import DesignSystem
import SwiftUI

internal struct TripSourceDetailSchedule: View {
    internal let timings: [TripSourceDetailTiming]
    @Environment(\.dynamicTypeSize) private var typeSize

    internal static func stacksTiming(at size: DynamicTypeSize) -> Bool {
        size.isAccessibilitySize
    }

    internal var body: some View {
        PopsCard(appearance: .featured) {
            if Self.stacksTiming(at: typeSize) {
                stacked
            } else {
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .top, spacing: PopsSpacing.xl) {
                        fields
                    }
                    .fixedSize(horizontal: true, vertical: false)
                    stacked
                }
            }
        }
    }

    private var stacked: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xl) { fields }
    }

    private var fields: some View {
        ForEach(Array(timings.enumerated()), id: \.offset) { _, timing in
            VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                Text(timing.label).font(.popsSectionLabel).foregroundStyle(Color.popsTrips)
                Text(timing.clock.flatMap { $0.isEmpty ? nil : $0 } ?? "Time not set")
                    .font(.popsTitle).monospacedDigit()
                Text(timing.day.map(TripClock.dayLabel) ?? "Date not set")
                    .font(.popsBody)
                Text(timing.zone ?? "Time zone not set")
                    .font(.popsCaption).foregroundStyle(Color.popsMutedForeground)
                if timing.hasUnresolvedClock {
                    Label(
                        "Recorded time cannot be resolved", systemImage: "exclamationmark.triangle"
                    )
                    .font(.popsCaption).foregroundStyle(Color.popsTripsAttention)
                }
            }
            .fixedSize(horizontal: false, vertical: true)
        }
    }
}
