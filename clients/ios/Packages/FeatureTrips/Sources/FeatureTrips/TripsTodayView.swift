import AppCore
import DesignSystem
import SwiftUI

internal struct TripsTodayView: View {
    internal let snapshot: TripSnapshot
    internal let route: TripRouteSnapshot?
    internal let selectPlanTarget: (TripPlanLineIdentity) -> Void

    internal init(
        snapshot: TripSnapshot, route: TripRouteSnapshot? = nil,
        selectPlanTarget: @escaping (TripPlanLineIdentity) -> Void = { _ in }
    ) {
        self.snapshot = snapshot
        self.route = route
        self.selectPlanTarget = selectPlanTarget
    }

    internal var body: some View {
        TimelineView(.everyMinute) { context in
            TripsTodayContent(
                snapshot: snapshot, date: context.date, route: route,
                selectPlanTarget: selectPlanTarget)
        }
    }
}

internal struct TripsTodayContent: View {
    internal let snapshot: TripSnapshot
    internal let route: TripRouteSnapshot?
    internal let date: Date
    internal let selectPlanTarget: (TripPlanLineIdentity) -> Void
    @Environment(\.timeZone) private var zone

    internal init(
        snapshot: TripSnapshot, date: Date, route: TripRouteSnapshot? = nil,
        selectPlanTarget: @escaping (TripPlanLineIdentity) -> Void = { _ in }
    ) {
        self.snapshot = snapshot
        self.date = date
        self.route = route
        self.selectPlanTarget = selectPlanTarget
    }

    internal var body: some View {
        let projection = TripOverviewProjection(
            snapshot: snapshot, at: date, zone: zone,
            visibleSources: tripSources(snapshot), visibleVisits: snapshot.visits,
            route: route)
        return ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.xl) {
                TripsOverviewView(projection: projection, date: date, trip: snapshot.trip)
                if !projection.now.isEmpty {
                    currentFocus(projection.now)
                }
                if !projection.nextFocus.isEmpty {
                    nextFocus(projection)
                }
                if projection.now.isEmpty && projection.nextFocus.isEmpty {
                    breathingRoom
                }
                if route != nil, !projection.chapters.isEmpty {
                    TripsChapterRail(chapters: projection.chapters) {
                        selectPlanTarget(.root(.visit($0)))
                    }
                }
                if !projection.attention.isEmpty {
                    TripsTodayNeedsYouView(attention: projection.attention) {
                        selectPlanTarget($0.target)
                    }
                }
                if !projection.timeline.isEmpty {
                    VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                        Text("The journey").font(.popsTitle)
                        ForEach(projection.timeline) { group in
                            TripsTimelineGroupView(
                                group: group, places: snapshot.places, zone: zone)
                        }
                    }
                }
                if !snapshot.trip.notes.isEmpty { notes }
            }
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.top, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.xxl)
        }
        .background(Color.popsBackground)
    }

    @ViewBuilder private func nextFocus(_ projection: TripOverviewProjection) -> some View {
        if let next = projection.nextFocus.first {
            TripsTodayFocusCard(
                source: next, title: "Up next", snapshot: snapshot, zone: zone,
                isCurrent: false)
        }
    }

    @ViewBuilder private func currentFocus(_ sources: [TripSource]) -> some View {
        if let source = sources.first, sources.count == 1 {
            TripsTodayFocusCard(
                source: source, title: "Happening now", snapshot: snapshot, zone: zone,
                isCurrent: true)
        } else if !sources.isEmpty {
            VStack(alignment: .leading, spacing: PopsSpacing.md) {
                Text("Happening now").font(.popsTitle)
                ForEach(sources) { source in
                    TripsTodayFocusCard(
                        source: source, title: "Now", snapshot: snapshot, zone: zone,
                        isCurrent: true)
                }
            }
        }
    }

    private var breathingRoom: some View {
        PopsCard {
            HStack(alignment: .top, spacing: PopsSpacing.md) {
                Image(systemName: "sun.max.fill")
                    .font(.title2).foregroundStyle(Color.popsAccent)
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text("A little breathing room").font(.popsHeadline)
                    Text("Nothing is happening right now. Your trip plan is here when you need it.")
                        .font(.popsSubheadline).foregroundStyle(Color.popsMutedForeground)
                }
            }
        }
    }

    private var notes: some View {
        PopsCard {
            VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                Label("Trip notes", systemImage: "text.alignleft")
                    .font(.popsSectionLabel).foregroundStyle(Color.popsMutedForeground)
                Text(snapshot.trip.notes).font(.popsBody).textSelection(.enabled)
            }
        }
    }
}
