import AppCore
import DesignSystem
import SwiftUI

internal struct TripsPlanLineRow: View {
    internal let item: TripPlanLineItem
    internal let places: [TripPlace]
    internal let openSource: (TripSource) -> Void

    internal var body: some View {
        Group {
            switch item.content {
            case .visit(let visit, let place, let sources):
                TripsPlanVisitRow(
                    visit: visit, place: place, sources: sources, places: places,
                    openSource: openSource)
            case .source(let source):
                TripsPlanLineSourceRow(source: source, places: places, openSource: openSource)
            case .missing(let source):
                placeholder(
                    source, title: "Source missing", detail: "Reported missing by the route.",
                    symbol: "exclamationmark.triangle", attention: true)
            case .unavailable(let source):
                placeholder(
                    source, title: "Source details unavailable",
                    detail: "Not present in this detail read. Refresh to try again.",
                    symbol: "arrow.clockwise", attention: false)
            case .gap:
                PopsCard(appearance: .featured) {
                    VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                        Label(
                            "Open route section",
                            systemImage: "point.topleft.down.to.point.bottomright.curvepath"
                        )
                        .font(.popsHeadline)
                        .foregroundStyle(Color.popsTrips)
                        Text(item.paths.isEmpty ? "No paths recorded." : "Paths are shown below.")
                            .font(.popsCaption)
                            .foregroundStyle(Color.popsMutedForeground)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
        }
        .lineLimit(nil)
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func placeholder(
        _ source: TripRouteSource, title: String, detail: String, symbol: String, attention: Bool
    ) -> some View {
        PopsCard(appearance: .featured) {
            VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                Label(title, systemImage: symbol)
                    .font(.popsHeadline)
                    .foregroundStyle(attention ? Color.popsTripsAttention : Color.popsForeground)
                Text(sourceLabel(source))
                    .font(.popsSubheadline)
                Text(detail)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            .accessibilityElement(children: .combine)
        }
    }

    private func sourceLabel(_ source: TripRouteSource) -> String {
        switch source {
        case .visit(let id): "Visit \(id)"
        case .journey(let id): "Journey \(id)"
        }
    }
}

internal struct TripsPlanLineSourceRow: View {
    internal let source: TripSource
    internal let places: [TripPlace]
    internal let openSource: (TripSource) -> Void
    @Environment(\.timeZone) private var zone

    internal var body: some View {
        let summary = TripNextSummary(source: source, places: places, zone: zone)
        Button {
            openSource(source)
        } label: {
            TripsCardHeader(symbol: source.symbol, decorated: false) {
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text(summary.title)
                        .font(.popsHeadline)
                        .foregroundStyle(Color.popsForeground)
                    Text(summary.when)
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                    if let state = summary.stateLine {
                        Text(state)
                            .font(.popsCaption)
                            .foregroundStyle(Color.popsMutedForeground)
                    }
                    if summary.hasConflictingTimes {
                        Label("Recorded times conflict", systemImage: "exclamationmark.triangle")
                            .font(.popsCaption)
                            .foregroundStyle(Color.popsTripsAttention)
                    }
                }
            }
            .frame(minHeight: PopsSize.touchTarget, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint("Open source details")
    }
}
