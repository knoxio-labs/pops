import AppCore
import DesignSystem
import SwiftUI

internal struct TripsPlanView: View {
    internal let route: TripRouteSnapshot
    internal let snapshot: TripSnapshot?
    @Binding internal var lens: TripsPlanLens
    @Binding internal var selectedDay: String?
    internal let openSource: (TripSource) -> Void

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xl) {
            Picker("Plan view", selection: $lens) {
                Text("Line").tag(TripsPlanLens.line)
                Text("Calendar").tag(TripsPlanLens.calendar)
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("trip-plan-lens")
            switch lens {
            case .line:
                TripsPlanLineView(route: route, snapshot: snapshot, openSource: openSource)
            case .calendar:
                TripsPlanCalendarView(
                    route: route, snapshot: snapshot, selectedDay: $selectedDay,
                    openSource: openSource)
            }
        }
    }
}

internal enum TripsPlanLens: Hashable { case line, calendar }
