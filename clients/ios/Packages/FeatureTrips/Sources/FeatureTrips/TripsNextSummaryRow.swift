import AppCore
import DesignSystem
import SwiftUI

internal struct TripsNextSummaryRow: View {
    internal let source: TripSource
    internal let zone: TimeZone
    internal let places: [TripPlace]

    internal var body: some View {
        let summary = TripNextSummary(source: source, places: places, zone: zone)
        NavigationLink {
            TripsSourceView(source: source, places: places)
        } label: {
            PopsCard(appearance: .featured) {
                TripsCardHeader(symbol: source.symbol, decorated: false) {
                    TripsNextSummaryContent(summary: summary)
                }
                .frame(minHeight: PopsSize.touchTarget, alignment: .leading)
            }
            .accessibilityElement(children: .combine)
        }
        .buttonStyle(.plain)
        .navigationLinkIndicatorVisibility(.hidden)
        .listRowSeparator(.hidden)
        .listRowBackground(Color.popsBackground)
    }
}
