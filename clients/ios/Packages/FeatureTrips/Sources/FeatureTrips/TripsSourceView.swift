import AppCore
import DesignSystem
import SwiftUI

internal struct TripsSourceView: View {
    internal let source: TripSource
    internal let places: [TripPlace]

    internal var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                TripsSourceHero(
                    title: source.displayName(places: places),
                    subtitle: subtitle,
                    symbol: source.symbol,
                    accent: tripsSourceAccent(source),
                    states: states
                )
                details
            }
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.top, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.xxl)
        }
        .background(Color.popsBackground)
        .navigationTitle(source.displayName(places: places))
        .popsTitleDisplay(large: false)
    }

    @ViewBuilder private var details: some View {
        switch source {
        case .stay(let stay):
            TripsStayDetailView(stay: stay)
        case .journey(let journey):
            TripsJourneyDetailView(journey: journey, places: places)
        case .event(let event):
            TripsEventDetailView(event: event)
        }
    }

    private var subtitle: String {
        switch source {
        case .journey: source.routeLabel(places: places)
        case .stay(let stay): stay.kind ?? "Stay details"
        case .event: "An experience on your trip"
        }
    }

    private var states: [TripSourceState] {
        switch source {
        case .journey(let journey):
            journey.legs.flatMap { leg in
                [
                    leg.intention.map { TripSourceState(axis: "Plan", value: $0) },
                    leg.arrangement.map { TripSourceState(axis: "Arrangement", value: $0) },
                    leg.purchase.map { TripSourceState(axis: "Purchase", value: $0) },
                ].compactMap { $0 }
            }
        case .stay(let stay):
            stay.status.map { [TripSourceState(axis: "Booking", value: $0)] } ?? []
        case .event(let event):
            [
                event.intention.map { TripSourceState(axis: "Plan", value: $0) },
                event.arrangement.map { TripSourceState(axis: "Arrangement", value: $0) },
                event.purchase.map { TripSourceState(axis: "Purchase", value: $0) },
            ].compactMap { $0 }
        }
    }
}

internal func tripsSourceAccent(_ source: TripSource) -> Color {
    switch source {
    case .stay: .popsSuccess
    case .journey: .popsAccent
    case .event: .popsPurchases
    }
}
