import AppCore
import DesignSystem
import SwiftUI

internal struct TripsJourneyLegView: View {
    internal let leg: TripJourneyLeg
    internal let places: [TripPlace]
    internal var showsReference = true
    @Environment(\.dynamicTypeSize) private var typeSize

    internal static func stacksEndpoints(at size: DynamicTypeSize) -> Bool {
        size.isAccessibilitySize
    }

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            let service = [leg.operator, leg.service].compactMap { $0 }.filter { !$0.isEmpty }
            if !service.isEmpty {
                Text(service.joined(separator: " · "))
                    .font(.popsSectionLabel)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            if Self.stacksEndpoints(at: typeSize) {
                verticalRoute
            } else {
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .top, spacing: PopsSpacing.lg) {
                        endpoint(leg.from, role: "Departure")
                        Image(systemName: "arrow.right")
                            .font(.popsHeadline)
                            .foregroundStyle(Color.popsTrips)
                            .accessibilityHidden(true)
                        endpoint(leg.to, role: "Arrival")
                    }
                    .fixedSize(horizontal: true, vertical: false)
                    verticalRoute
                }
            }
            metadata
        }
    }

    private var metadata: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            let states = [leg.intention, leg.arrangement].compactMap { $0 }
                .filter { !$0.isEmpty }
            if !states.isEmpty {
                Text(states.joined(separator: " · "))
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            if let purchase = leg.purchase, !purchase.isEmpty {
                Text(purchase)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            if showsReference, let reference = leg.reference, !reference.isEmpty {
                Text(reference)
                    .font(.popsMonospacedCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
    }

    private var verticalRoute: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            endpoint(leg.from, role: "Departure")
            Image(systemName: "arrow.down")
                .foregroundStyle(Color.popsTrips)
                .accessibilityHidden(true)
            endpoint(leg.to, role: "Arrival")
        }
    }

    private func endpoint(_ endpoint: TripEndpoint, role: String) -> some View {
        let value = TripEndpointPresentation(endpoint: endpoint, role: role, places: places)
        return VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text(value.place)
                .font(.popsHeadline)
                .foregroundStyle(Color.popsForeground)
            Text(value.time)
                .font(value.hasUnresolvedClock ? .popsBody : .popsTitle)
                .monospacedDigit()
                .foregroundStyle(Color.popsForeground)
            endpointDetails(value)
        }
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            [
                role, value.place, value.time, value.day, value.zone,
                value.hasUnresolvedClock ? "Time cannot be resolved" : nil,
            ]
            .compactMap { $0 }.joined(separator: ", ")
        )
    }

    @ViewBuilder private func endpointDetails(_ value: TripEndpointPresentation) -> some View {
        if let day = value.day {
            Text(day)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
        }
        if let zone = value.zone {
            Text(zone)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
        }
        if value.hasUnresolvedClock {
            Label("Time cannot be resolved", systemImage: "exclamationmark.triangle")
                .font(.popsCaption)
                .foregroundStyle(Color.popsTripsAttention)
        }
    }
}
