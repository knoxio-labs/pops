import DesignSystem
import SwiftUI

internal struct TripsOverviewView: View {
    internal let projection: TripOverviewProjection
    internal let date: Date
    @Environment(\.timeZone) private var zone

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            Text(date, format: dayStyle)
                .font(.popsSectionLabel)
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(Color.popsMutedForeground)
            Text(projection.heading.title)
                .font(.popsLargeTitle)
                .foregroundStyle(Color.popsForeground)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Text(projection.heading.context)
                .font(.popsSubheadline)
                .foregroundStyle(Color.popsTrips)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var dayStyle: Date.FormatStyle {
        var style = Date.FormatStyle.dateTime.weekday(.wide).day().month(.wide)
        style.timeZone = zone
        return style
    }
}
