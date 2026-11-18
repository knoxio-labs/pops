import DesignSystem
import SwiftUI

internal struct TripsTodayNeedsYouView: View {
    internal let attention: [TripOverviewAttention]
    internal let select: (TripOverviewAttention) -> Void

    internal var body: some View {
        PopsCard(appearance: .featured) {
            VStack(alignment: .leading, spacing: PopsSpacing.md) {
                HStack(alignment: .firstTextBaseline) {
                    Label("Needs your attention", systemImage: "sparkle")
                        .font(.popsHeadline)
                        .foregroundStyle(Color.popsTripsAttention)
                    Spacer()
                    Text("\(attention.count)")
                        .font(.popsCaption.monospacedDigit())
                        .foregroundStyle(Color.popsMutedForeground)
                }
                ForEach(Array(attention.prefix(3))) { item in
                    Button {
                        select(item)
                    } label: {
                        HStack(spacing: PopsSpacing.md) {
                            Image(systemName: item.symbol)
                                .font(.popsHeadline)
                                .foregroundStyle(Color.popsTripsAttention)
                                .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
                                .background(
                                    Color.popsTripsAttention.opacity(0.12), in: Circle())
                            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                                Text(item.title)
                                    .font(.popsSubheadline)
                                    .foregroundStyle(Color.popsForeground)
                                    .fixedSize(horizontal: false, vertical: true)
                                Text(item.detail)
                                    .font(.popsCaption)
                                    .foregroundStyle(Color.popsMutedForeground)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            Spacer(minLength: PopsSpacing.xs)
                            Image(systemName: "chevron.right")
                                .font(.popsCaption)
                                .foregroundStyle(Color.popsMutedForeground)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityElement(children: .combine)
                    .accessibilityHint("Review this part of the trip plan")
                }
                if attention.count > 3 {
                    Text("And \(attention.count - 3) more in Plan")
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }
            }
        }
    }
}

extension TripOverviewAttention {
    fileprivate var symbol: String {
        switch self {
        case .openDates: "calendar.badge.clock"
        case .openRouteSection: "point.topleft.down.to.point.bottomright.curvepath"
        }
    }
}
