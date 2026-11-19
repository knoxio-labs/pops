import AppCore
import DesignSystem
import SwiftUI

internal struct TripsJourneyDetailView: View {
    internal let journey: TripJourney
    internal let places: [TripPlace]
    @Environment(\.dynamicTypeSize) private var typeSize

    internal static func stacksEndpoints(at size: DynamicTypeSize) -> Bool {
        size.isAccessibilitySize
    }

    internal var body: some View {
        let detail = TripJourneyDetailPresentation(journey: journey, places: places)
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            if detail.legs.isEmpty {
                ContentUnavailableView(
                    "No route segments recorded",
                    systemImage: "point.3.connected.trianglepath.dotted",
                    description: Text("Route details will appear here when they are added."))
            } else {
                ForEach(detail.legs) { leg in
                    legCard(leg, total: detail.legs.count)
                }
            }
            TripsSourceFactsCard(
                title: "Good to know", symbol: "ticket",
                facts: sourceFacts(detail.facts))
            TripsSourceFactsCard(
                title: "Connection guidance", symbol: "clock",
                facts: sourceFacts(detail.buffers))
            ForEach(Array(detail.legs.enumerated()), id: \.element.id) { _, leg in
                ForEach(Array(leg.references.enumerated()), id: \.offset) { _, group in
                    TripsSourceReferencesCard(title: group.title, links: group.links)
                }
            }
            ForEach(Array(detail.references.enumerated()), id: \.offset) { _, group in
                TripsSourceReferencesCard(title: group.title, links: group.links)
            }
        }
    }

    private func legCard(_ leg: TripJourneyLegDetailPresentation, total: Int) -> some View {
        PopsCard(appearance: .featured) {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                HStack(alignment: .center, spacing: PopsSpacing.sm) {
                    Label("Leg \(leg.ordinal) of \(total)", systemImage: "point.3.connected.trianglepath.dotted")
                        .font(.popsHeadline)
                        .foregroundStyle(Color.popsForeground)
                    Spacer(minLength: PopsSpacing.zero)
                    if let mode = leg.mode {
                        Text(mode)
                            .font(.popsCaption.weight(.semibold))
                            .foregroundStyle(Color.popsTrips)
                            .padding(.horizontal, PopsSpacing.md)
                            .padding(.vertical, PopsSpacing.xs)
                            .background(Color.popsTripsTint, in: Capsule())
                    }
                }
                operatorAndService(leg)
                route(leg)
                if !leg.states.isEmpty {
                    stateFacts(leg.states)
                }
                if !leg.facts.isEmpty {
                    VStack(alignment: .leading, spacing: PopsSpacing.md) {
                        ForEach(Array(leg.facts.enumerated()), id: \.offset) { _, fact in
                            TripsSourceFactLine(
                                label: fact.label, value: fact.value,
                                monospaced: fact.label == "Reference")
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder private func operatorAndService(_ leg: TripJourneyLegDetailPresentation) -> some View {
        if leg.operatorName != nil || leg.service != nil {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: PopsSpacing.lg) {
                    if let operatorName = leg.operatorName {
                        TripsSourceFactLine(label: "Operator", value: operatorName)
                    }
                    if let service = leg.service {
                        TripsSourceFactLine(label: "Service", value: service, monospaced: true)
                    }
                }
                .fixedSize(horizontal: true, vertical: false)
                VStack(alignment: .leading, spacing: PopsSpacing.md) {
                    if let operatorName = leg.operatorName {
                        TripsSourceFactLine(label: "Operator", value: operatorName)
                    }
                    if let service = leg.service {
                        TripsSourceFactLine(label: "Service", value: service, monospaced: true)
                    }
                }
            }
        }
    }

    @ViewBuilder private func route(_ leg: TripJourneyLegDetailPresentation) -> some View {
        if Self.stacksEndpoints(at: typeSize) {
            verticalRoute(leg)
        } else {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: PopsSpacing.md) {
                    endpoint(leg.departure, role: "Departure")
                    routeMarker("arrow.right")
                    endpoint(leg.arrival, role: "Arrival")
                }
                .fixedSize(horizontal: true, vertical: false)
                verticalRoute(leg)
            }
        }
    }

    private func verticalRoute(_ leg: TripJourneyLegDetailPresentation) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            endpoint(leg.departure, role: "Departure")
            routeMarker("arrow.down")
            endpoint(leg.arrival, role: "Arrival")
        }
    }

    private func routeMarker(_ symbol: String) -> some View {
        Image(systemName: symbol)
            .font(.popsHeadline)
            .foregroundStyle(Color.popsTrips)
            .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
            .background(Color.popsTripsTint, in: Circle())
            .accessibilityHidden(true)
    }

    private func endpoint(_ value: TripEndpointPresentation, role: String) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text(role.uppercased())
                .font(.popsSectionLabel)
                .foregroundStyle(Color.popsTrips)
            Text(value.displayPlace)
                .font(.popsHeadline)
                .foregroundStyle(Color.popsForeground)
                .fixedSize(horizontal: false, vertical: true)
            Text(value.time)
                .font(.popsTitle)
                .monospacedDigit()
                .foregroundStyle(value.hasUnresolvedClock ? Color.popsTripsAttention : Color.popsForeground)
            if let day = value.day {
                Text(day)
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            if let zone = value.zone {
                Text(zone)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                    .textSelection(.enabled)
            }
            if value.hasUnresolvedClock {
                Label("Recorded time cannot be resolved", systemImage: "exclamationmark.triangle")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsTripsAttention)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            [
                role, value.displayPlace, value.time, value.day, value.zone,
                value.hasUnresolvedClock ? "Time cannot be resolved" : nil,
            ]
                .compactMap { $0 }
                .joined(separator: ", "))
    }

    private func stateFacts(_ facts: [TripSourceDetailFact]) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.zero) {
            ForEach(Array(facts.enumerated()), id: \.offset) { index, fact in
                HStack(alignment: .firstTextBaseline, spacing: PopsSpacing.md) {
                    Text(fact.label)
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                    Spacer(minLength: PopsSpacing.sm)
                    Text(fact.value)
                        .font(.popsSubheadline.weight(.semibold))
                        .foregroundStyle(Color.popsForeground)
                        .multilineTextAlignment(.trailing)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.vertical, PopsSpacing.sm)
                if index < facts.count - 1 {
                    Rectangle()
                        .fill(Color.popsSeparator)
                        .frame(height: PopsBorder.hairline)
                        .accessibilityHidden(true)
                }
            }
        }
        .padding(.horizontal, PopsSpacing.md)
        .background(Color.popsBackground, in: RoundedRectangle(cornerRadius: PopsRadius.card))
        .accessibilityElement(children: .combine)
    }

    private func sourceFacts(_ facts: [TripSourceDetailFact]) -> [TripsSourceFact] {
        facts.map { TripsSourceFact(label: $0.label, value: $0.value) }
    }
}
