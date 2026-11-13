import DesignSystem
import Foundation
import SwiftUI

internal struct TripsSourceScheduleView: View {
    internal let value: TripSourceSchedulePresentation
    internal let zone: TimeZone

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text(value.label)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
            if let instant = value.instant {
                Text(TripClock.clockLabel(instant, zone: zone))
                    .font(.popsTitle)
                    .monospacedDigit()
                    .foregroundStyle(Color.popsForeground)
                TripsDateZoneView(date: instant, zone: zone)
            } else {
                Text(value.dates.isEmpty ? "Dates not set" : value.dates)
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
                if let clock = value.recordedClock {
                    Text(clock)
                        .font(.popsTitle)
                        .monospacedDigit()
                        .foregroundStyle(Color.popsForeground)
                } else {
                    Text("Time not set")
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                }
                if let zone = value.recordedZone {
                    Text(zone)
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                }
                if value.hasUnresolvedClock {
                    Label("Time cannot be resolved", systemImage: "exclamationmark.triangle")
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsTripsAttention)
                }
            }
        }
        .lineLimit(nil)
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

internal struct TripsDateZoneView: View {
    internal let date: Date
    internal let zone: TimeZone
    @Environment(\.dynamicTypeSize) private var typeSize

    internal var body: some View {
        Group {
            if typeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text(TripClock.dateLabel(date, zone: zone))
                    Text(zone.identifier)
                }
            } else {
                Text("\(TripClock.dateLabel(date, zone: zone)) · \(zone.identifier)")
            }
        }
        .font(.popsCaption)
        .foregroundStyle(Color.popsMutedForeground)
        .lineLimit(nil)
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
