import AppCore
import DesignSystem
import SwiftUI

internal struct TripsSourceRow: View {
    internal let source: TripSource
    internal let zone: TimeZone
    internal let places: [TripPlace]
    internal var context: String?

    internal var body: some View {
        NavigationLink {
            TripsSourceView(source: source, places: places)
        } label: {
            HStack(alignment: .top, spacing: PopsSpacing.md) {
                Image(systemName: source.symbol).foregroundStyle(Color.popsAccent)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text(source.displayName(places: places)).font(.popsHeadline)
                    if let context {
                        Text(context).font(.popsCaption).foregroundStyle(Color.popsMutedForeground)
                    }
                    if !source.routeLabel(places: places).isEmpty
                        && source.displayName(places: places) != source.routeLabel(places: places)
                    {
                        Text(source.routeLabel(places: places)).font(.popsSubheadline)
                    }
                    if let start = source.start {
                        Text(TripClock.dateLabel(start, zone: zone))
                            .font(.popsCaption)
                        Text("\(TripClock.clockLabel(start, zone: zone)) · \(zone.identifier)")
                            .font(.popsCaption).foregroundStyle(Color.popsMutedForeground)
                    }
                    if let status = source.status {
                        Label(
                            status,
                            systemImage: status == "Purchased" ? "checkmark.circle.fill" : "circle"
                        )
                        .font(.popsCaption)
                        .foregroundStyle(
                            status == "Purchased" ? Color.popsSuccess : Color.popsMutedForeground)
                    }
                    TripSourceStateLines(source: source)
                }
            }
            .frame(minHeight: PopsSize.touchTarget, alignment: .leading)
            .accessibilityElement(children: .combine)
        }
    }
}
