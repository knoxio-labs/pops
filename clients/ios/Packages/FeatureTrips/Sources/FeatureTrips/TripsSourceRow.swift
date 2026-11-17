import AppCore
import DesignSystem
import SwiftUI

internal struct TripsSourceRow: View {
    internal let source: TripSource
    internal let zone: TimeZone
    internal let places: [TripPlace]
    internal var context: String?
    internal var isCurrent = false

    internal var body: some View {
        NavigationLink {
            TripsSourceView(source: source, places: places)
        } label: {
            TripsSourceCard(
                source: source, zone: zone, places: places, context: context, isCurrent: isCurrent)
        }
        .buttonStyle(.plain)
        .navigationLinkIndicatorVisibility(.hidden)
        .listRowSeparator(.hidden)
        .listRowBackground(Color.popsBackground)
    }
}
