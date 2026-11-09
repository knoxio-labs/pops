import DesignSystem
import SwiftUI

/// Format validated source clocks in the explicit display zone without substituting a missing time.
internal enum TripTodayClockCopy {
    internal static func label(_ clock: TripsTodayClock, zone: String, includeZone: Bool = true)
        -> String
    {
        guard let day = tripsTodayDay(clock.at, zone: zone),
            let date = tripsTodayDayLabel(day),
            let time = tripsTodayLocalTime(clock, zone: zone)
        else { return "Invalid source time · \(clock.at) · \(clock.timeZone)" }
        return includeZone ? "\(date) · \(time) · \(zone)" : "\(date) · \(time)"
    }
}

/// A clock retains its original zone alongside a display-zone conversion when they differ.
internal struct TripTodayTimeView: View {
    internal let title: String
    internal let clock: TripsTodayClock?
    internal let displayZone: String

    internal var body: some View {
        if let clock {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(title).font(.popsCaption).foregroundStyle(Color.popsMutedForeground)
                Text(TripTodayClockCopy.label(clock, zone: displayZone))
                    .font(.popsBody)
                if displayZone != clock.timeZone {
                    Text(TripTodayClockCopy.label(clock, zone: clock.timeZone))
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                }
            }
        }
    }
}
