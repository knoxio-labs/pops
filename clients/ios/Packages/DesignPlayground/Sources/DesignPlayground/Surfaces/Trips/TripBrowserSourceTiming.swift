import DesignSystem
import SwiftUI

/// Compact booking schedules retain original date precision and omit absent clocks.
internal struct TripBrowserSourceTiming: View {
    internal let source: TripsTodaySource
    internal let displayZone: String

    internal var body: some View {
        switch source {
        case .stay(let stay):
            TripTodayRowClock(title: "From", clock: stay.from, zone: displayZone)
            TripTodayRowClock(title: "Until", clock: stay.to, zone: displayZone)
        case .journey(let journey):
            TripTodayRowClock(
                title: "Departs", clock: journey.legs.first?.departure, zone: displayZone)
            TripTodayRowClock(
                title: "Arrives", clock: journey.legs.last?.arrival, zone: displayZone)
        case .event(let event):
            TripTodayRowClock(title: "Starts", clock: event.start, zone: displayZone)
            if let day = event.day, let label = tripsTodayDayLabel(day) {
                Text(label).font(.popsCaption).foregroundStyle(Color.popsMutedForeground)
            }
        }
    }
}
