import AppCore
import DesignSystem
import SwiftUI

internal struct TripsTodayJourneyLegCard: View {
    internal let leg: TripJourneyLeg
    internal let places: [TripPlace]
    @Environment(\.dynamicTypeSize) private var typeSize

    private var isFlight: Bool {
        leg.mode?.caseInsensitiveCompare("flight") == .orderedSame
    }

    private var accent: Color { isFlight ? .popsAccent : .popsTrips }

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
                    HStack(alignment: .top, spacing: PopsSpacing.md) {
                        endpoint(leg.from, role: "Departure")
                        routeMark
                        endpoint(leg.to, role: "Arrival")
                    }
                    verticalRoute
                }
            }
            metadata
        }
        .padding(PopsSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(accent.opacity(0.08), in: RoundedRectangle(cornerRadius: PopsRadius.control))
        .overlay {
            RoundedRectangle(cornerRadius: PopsRadius.control)
                .stroke(accent.opacity(0.22), lineWidth: PopsBorder.hairline)
        }
        .accessibilityElement(children: .combine)
    }

    private var verticalRoute: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            endpoint(leg.from, role: "Departure")
            routeMark
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.leading, PopsSpacing.md)
            endpoint(leg.to, role: "Arrival")
        }
    }

    private var routeMark: some View {
        HStack(spacing: PopsSpacing.xs) {
            Capsule()
                .fill(accent.opacity(0.6))
                .frame(maxWidth: .infinity)
                .frame(height: PopsBorder.emphasis)
            Image(systemName: isFlight ? "airplane" : "arrow.right")
                .font(.popsSubheadline)
                .foregroundStyle(accent)
            Capsule()
                .fill(accent.opacity(0.6))
                .frame(maxWidth: .infinity)
                .frame(height: PopsBorder.emphasis)
        }
        .frame(minWidth: PopsSize.touchTarget)
        .accessibilityHidden(true)
    }

    private func endpoint(_ endpoint: TripEndpoint, role: String) -> some View {
        let value = TripEndpointPresentation(endpoint: endpoint, role: role, places: places)
        return VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text(value.displayPlace)
                .font(.popsHeadline)
                .foregroundStyle(Color.popsForeground)
                .fixedSize(horizontal: false, vertical: true)
            Text(value.time)
                .font(value.hasUnresolvedClock ? .popsBody : .popsTitle)
                .monospacedDigit()
                .foregroundStyle(Color.popsForeground)
                .fixedSize(horizontal: false, vertical: true)
            if let day = value.day {
                Text(day)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let zone = value.zone {
                Text(zone)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if value.hasUnresolvedClock {
                Label("Time cannot be resolved", systemImage: "exclamationmark.triangle")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsTripsAttention)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            [
                role, value.displayPlace, value.time, value.day, value.zone,
                value.hasUnresolvedClock ? "Time cannot be resolved" : nil,
            ]
            .compactMap { $0 }.joined(separator: ", ")
        )
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
        }
    }
}
