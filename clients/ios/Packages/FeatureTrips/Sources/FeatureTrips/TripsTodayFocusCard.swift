import AppCore
import DesignSystem
import SwiftUI

internal enum TripsTodayFocusDetail {
    case schedule(TripSourceSchedulePresentation)
    case journey([TripJourneyLeg])
}

internal func tripsTodayFocusDetail(source: TripSource, isCurrent: Bool) -> TripsTodayFocusDetail {
    switch source {
    case .journey(let journey): .journey(journey.legs)
    case .stay, .event:
        .schedule(TripSourceSchedulePresentation(source: source, isCurrent: isCurrent))
    }
}

internal struct TripsTodayFocusCard: View {
    internal let source: TripSource
    internal let title: String
    internal let snapshot: TripSnapshot
    internal let zone: TimeZone
    internal let isCurrent: Bool

    private var style: TripsSourceStyle { TripsSourceStyle(source: source) }

    internal var body: some View {
        NavigationLink {
            TripsSourceView(source: source, places: snapshot.places)
        } label: {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                header
                Text(source.displayName(places: snapshot.places))
                    .font(.popsLargeTitle)
                    .fixedSize(horizontal: false, vertical: true)
                recordedDetails
                if let status = source.status, !status.isEmpty {
                    Text(status)
                        .font(.popsCaption)
                        .foregroundStyle(style.accent)
                        .padding(.horizontal, PopsSpacing.md)
                        .padding(.vertical, PopsSpacing.xs)
                        .background(style.accent.opacity(0.14), in: Capsule())
                }
                TripSourceStateLines(source: source)
            }
            .foregroundStyle(Color.popsForeground)
            .padding(PopsSpacing.xl)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                RoundedRectangle(cornerRadius: PopsRadius.card)
                    .fill(
                        LinearGradient(
                            colors: [
                                style.accent.opacity(isCurrent ? 0.24 : 0.16),
                                Color.popsSurface,
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ))
            }
            .overlay {
                RoundedRectangle(cornerRadius: PopsRadius.card)
                    .stroke(style.accent.opacity(0.35), lineWidth: PopsBorder.hairline)
            }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
    }

    private var header: some View {
        HStack(alignment: .center, spacing: PopsSpacing.md) {
            Image(systemName: style.symbol)
                .font(.popsTitle)
                .foregroundStyle(style.accent)
                .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
                .background(
                    style.accent.opacity(0.14),
                    in: RoundedRectangle(cornerRadius: PopsRadius.control)
                )
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(title.uppercased())
                    .font(.popsSectionLabel)
                    .foregroundStyle(style.accent)
                Text(isCurrent ? "IN PROGRESS" : "COMING UP")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                Text(style.kind)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: PopsSpacing.xs)
            Image(systemName: "arrow.up.right")
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
                .accessibilityHidden(true)
        }
    }

    @ViewBuilder private var recordedDetails: some View {
        switch tripsTodayFocusDetail(source: source, isCurrent: isCurrent) {
        case .schedule(let schedule):
            TripsSourceScheduleView(value: schedule, zone: zone)
        case .journey(let legs):
            if legs.isEmpty {
                Text("No journey legs recorded")
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
            } else {
                ForEach(legs) { leg in
                    TripsTodayJourneyLegCard(leg: leg, places: snapshot.places)
                }
            }
        }
    }
}
