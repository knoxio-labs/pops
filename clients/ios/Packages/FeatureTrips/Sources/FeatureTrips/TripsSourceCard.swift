import AppCore
import DesignSystem
import SwiftUI

internal struct TripsSourceCard: View {
    internal let source: TripSource
    internal let zone: TimeZone
    internal let places: [TripPlace]
    internal var context: String?
    internal var isCurrent = false
    @Environment(\.dynamicTypeSize) private var typeSize

    internal var body: some View {
        let style = TripsSourceStyle(source: source)
        PopsCard(appearance: .featured) {
            Group {
                if typeSize.isAccessibilitySize {
                    VStack(alignment: .leading, spacing: PopsSpacing.md) {
                        heading(style)
                        details
                    }
                } else {
                    HStack(alignment: .top, spacing: PopsSpacing.md) {
                        Image(systemName: style.symbol)
                            .font(.popsTitle)
                            .foregroundStyle(style.accent)
                            .frame(minWidth: PopsSize.touchTarget, minHeight: PopsSize.touchTarget)
                            .background(
                                style.accent.opacity(0.14),
                                in: RoundedRectangle(
                                    cornerRadius: PopsRadius.control)
                            )
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: PopsSpacing.md) {
                            heading(style)
                            details
                        }
                        Spacer(minLength: PopsSpacing.zero)
                        Image(systemName: "chevron.right")
                            .font(.popsCaption)
                            .foregroundStyle(Color.popsMutedForeground)
                            .accessibilityHidden(true)
                    }
                }
            }
            .frame(minHeight: PopsSize.touchTarget, alignment: .leading)
        }
        .overlay(alignment: .leading) {
            Capsule()
                .fill(style.accent)
                .frame(width: PopsBorder.emphasis)
                .padding(.vertical, PopsSpacing.md)
                .accessibilityHidden(true)
        }
        .accessibilityElement(children: .combine)
    }

    private func heading(_ style: TripsSourceStyle) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text(style.kind)
                .font(.popsCaption)
                .foregroundStyle(style.accent)
            Text(source.displayName(places: places))
                .font(.popsHeadline)
                .foregroundStyle(Color.popsForeground)
                .fixedSize(horizontal: false, vertical: true)
            if let context {
                Text(context)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder private var details: some View {
        if case .journey(let journey) = source {
            ForEach(journey.legs) {
                TripsJourneyLegView(leg: $0, places: places, showsReference: !isCurrent)
            }
        } else {
            TripsSourceScheduleView(
                value: TripSourceSchedulePresentation(source: source, isCurrent: isCurrent),
                zone: zone)
        }
        if let status = source.status, !status.isEmpty {
            Text(status)
                .font(.popsSubheadline)
                .foregroundStyle(Color.popsMutedForeground)
        }
        TripSourceStateLines(source: source, showsReferences: !isCurrent)
    }
}

internal struct TripsSourceStyle {
    let kind: String
    let symbol: String
    let accent: Color

    init(source: TripSource) {
        switch source {
        case .stay(let stay):
            if let kind = stay.kind, !kind.isEmpty {
                self.kind = "Stay · \(kind.capitalized)"
            } else {
                kind = "Stay"
            }
            symbol = "bed.double.fill"
            accent = .popsTripsStay
        case .journey(let journey):
            let modes = journey.legs.compactMap { $0.mode }
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
            if let mode = modes.first, modes.count == journey.legs.count,
                modes.allSatisfy({ $0.caseInsensitiveCompare(mode) == .orderedSame })
            {
                kind = "Journey · \(mode.capitalized)"
                symbol =
                    mode.caseInsensitiveCompare("flight") == .orderedSame
                    ? "airplane" : "arrow.triangle.swap"
                accent =
                    mode.caseInsensitiveCompare("flight") == .orderedSame
                    ? .popsAccent : .popsTrips
            } else {
                kind = "Journey"
                symbol = "arrow.triangle.swap"
                accent = .popsTrips
            }
        case .event:
            kind = "Event"
            symbol = "calendar"
            accent = .popsTripsActivity
        }
    }
}
