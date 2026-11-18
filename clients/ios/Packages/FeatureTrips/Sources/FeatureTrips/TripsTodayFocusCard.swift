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
                HStack(spacing: PopsSpacing.sm) {
                    Image(systemName: style.symbol)
                        .font(.popsHeadline)
                        .foregroundStyle(style.accent)
                    Text(title.uppercased()).font(.popsSectionLabel)
                    Spacer()
                    Image(systemName: "arrow.up.right").font(.popsCaption)
                }
                Text(source.displayName(places: snapshot.places))
                    .font(.popsLargeTitle)
                    .fixedSize(horizontal: false, vertical: true)
                recordedDetails
                if let status = source.status, !status.isEmpty {
                    Label(
                        status,
                        systemImage: status == "Purchased" ? "checkmark.circle.fill" : "circle"
                    )
                    .font(.popsSubheadline)
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
                            colors: [style.accent.opacity(0.2), Color.popsSurface],
                            startPoint: .topLeading, endPoint: .bottomTrailing))
            }
            .overlay {
                RoundedRectangle(cornerRadius: PopsRadius.card)
                    .stroke(style.accent.opacity(0.35), lineWidth: PopsBorder.hairline)
            }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
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
                    TripsJourneyLegView(leg: leg, places: snapshot.places, showsReference: false)
                }
            }
        }
    }
}
