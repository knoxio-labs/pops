import AppCore
import DesignSystem
import SwiftUI

internal struct TripsPlanLineView: View {
    internal let route: TripRouteSnapshot
    internal let snapshot: TripSnapshot?
    internal let openSource: (TripSource) -> Void

    internal var body: some View {
        let projection = TripPlanLineProjection(route: route, snapshot: snapshot)
        VStack(alignment: .leading, spacing: PopsSpacing.xl) {
            VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                Text("Your route").font(.popsTitle)
            }
            if projection.root.isEmpty {
                PopsCard(appearance: .featured) {
                    Text("No route items recorded").font(.popsHeadline)
                }
            }
            ForEach(projection.root) { item in
                VStack(alignment: .leading, spacing: PopsSpacing.md) {
                    routeRow(item, places: projection.places)
                    ForEach(item.paths) { path in
                        TripsPlanLinePathView(
                            path: path, places: projection.places, openSource: openSource)
                    }
                }
            }
            if !projection.recorded.isEmpty {
                VStack(alignment: .leading, spacing: PopsSpacing.md) {
                    Text("Not on the route").font(.popsHeadline)
                    Text("Not placed in the active route or its alternatives.")
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                    ForEach(projection.recorded) {
                        TripsPlanLineRow(
                            item: $0, places: projection.places, openSource: openSource)
                    }
                }
            }
        }
        .foregroundStyle(Color.popsForeground)
        .lineLimit(nil)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func routeRow(_ item: TripPlanLineItem, places: [TripPlace]) -> some View {
        HStack(alignment: .top, spacing: PopsSpacing.sm) {
            TripsPlanLineMarker(
                isGap: {
                    if case .gap = item.content { return true }
                    return false
                }())
            TripsPlanLineRow(item: item, places: places, openSource: openSource)
        }
    }
}

internal struct TripsPlanLinePathView: View {
    let path: TripPlanLinePath
    let places: [TripPlace]
    let openSource: (TripSource) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(path.state == .alternative ? "Alternative path" : "Applied path history")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                Text(path.title).font(.popsHeadline)
            }
            if path.members.isEmpty {
                Text("No members recorded")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            ForEach(path.members) {
                TripsPlanLineRow(item: $0, places: places, openSource: openSource)
            }
        }
        .lineLimit(nil)
        .padding(.leading, PopsSpacing.xl)
        .overlay(alignment: .leading) {
            RoundedRectangle(cornerRadius: PopsRadius.control)
                .strokeBorder(
                    Color.popsTrips,
                    style: StrokeStyle(
                        lineWidth: PopsBorder.emphasis,
                        dash: path.state == .alternative ? [PopsSpacing.xs, PopsSpacing.xs] : [])
                )
                .frame(width: PopsSpacing.xs)
                .accessibilityHidden(true)
        }
    }
}

private struct TripsPlanLineMarker: View {
    let isGap: Bool

    var body: some View {
        VStack(spacing: PopsSpacing.xs) {
            Circle()
                .strokeBorder(Color.popsTrips, lineWidth: PopsBorder.emphasis)
                .background(isGap ? Color.popsBackground : Color.popsTripsTint, in: Circle())
                .frame(width: PopsSpacing.md, height: PopsSpacing.md)
            RoundedRectangle(cornerRadius: PopsRadius.control)
                .strokeBorder(
                    Color.popsTrips,
                    style: StrokeStyle(
                        lineWidth: PopsBorder.emphasis,
                        dash: isGap ? [PopsSpacing.xs, PopsSpacing.xs] : [])
                )
                .frame(width: PopsSpacing.xs, height: PopsSpacing.xl)
        }
        .padding(.top, PopsSpacing.lg)
        .accessibilityHidden(true)
    }
}
