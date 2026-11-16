import AppCore
import DesignSystem
import SwiftUI

internal struct TripsOverviewView: View {
    internal let projection: TripOverviewProjection
    internal let date: Date
    internal let trip: TripRecord
    @Environment(\.timeZone) private var zone

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            Text(tripName(trip))
                .font(.popsSectionLabel)
                .foregroundStyle(Color.popsTrips)
                .lineLimit(nil)
                .fixedSize(horizontal: false, vertical: true)
            Text(title)
                .font(.popsLargeTitle)
                .foregroundStyle(Color.popsForeground)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            if let context {
                Text(context)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsTrips)
                    .fixedSize(horizontal: false, vertical: true)
            }
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Label {
                    Text(date, format: dayStyle)
                } icon: {
                    Image(systemName: "calendar")
                }
                Label(
                    "Local time · \(TripClock.clockLabel(date, zone: zone))", systemImage: "clock"
                )
                .monospacedDigit()
            }
            .font(.popsSubheadline)
            .foregroundStyle(Color.popsMutedForeground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, PopsSpacing.md)
    }

    private var title: String {
        switch projection.heading {
        case .current(let place): "\(place), right now"
        case .travelDay: "Travel day"
        case .upcoming: projection.heading.title
        case .recorded: "Your trip"
        }
    }

    private var context: String? {
        switch projection.heading {
        case .current, .recorded: nil
        case .travelDay: projection.heading.context
        case .upcoming(_, let source): "Next · \(source)"
        }
    }

    private var dayStyle: Date.FormatStyle {
        var style = Date.FormatStyle.dateTime.weekday(.wide).day().month(.wide)
        style.timeZone = zone
        return style
    }
}
