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
            HStack(alignment: .firstTextBaseline) {
                Text(projection.heading.context)
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsTrips)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: PopsSpacing.sm)
                if !projection.chapters.isEmpty {
                    Label("\(projection.chapters.count) stops", systemImage: "point.topleft.down.to.point.bottomright.curvepath")
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                        .lineLimit(1)
                }
            }
        }
    }

    private var dayStyle: Date.FormatStyle {
        var style = Date.FormatStyle.dateTime.weekday(.wide).day().month(.wide)
        style.timeZone = zone
        return style
    }
}
