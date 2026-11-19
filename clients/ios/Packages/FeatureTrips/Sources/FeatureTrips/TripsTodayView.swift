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
                source: next, title: "Up next", detail: dateLabel(next),
                snapshot: snapshot, zone: zone)
        }
    }

    @ViewBuilder private func currentFocus(_ sources: [TripSource]) -> some View {
        if let source = sources.first, sources.count == 1 {
            TripsTodayFocusCard(
                source: source, title: "Happening now", detail: "In progress",
                snapshot: snapshot, zone: zone)
        } else if !sources.isEmpty {
            VStack(alignment: .leading, spacing: PopsSpacing.md) {
                Text("Happening now").font(.popsTitle)
                ForEach(sources) { source in
                    TripsTodayFocusCard(
                        source: source, title: "Now", detail: dateLabel(source),
                        snapshot: snapshot, zone: zone)
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

    private func dateLabel(_ source: TripSource) -> String {
        guard let start = source.start else { return "Time not set" }
        return
            "\(TripClock.dateLabel(start, zone: zone)) · \(TripClock.clockLabel(start, zone: zone))"
    }
}

private struct TripsTodayFocusCard: View {
    let source: TripSource
    let title: String
    let detail: String
    let snapshot: TripSnapshot
    let zone: TimeZone

    private var accent: Color { TripsSourceStyle(source: source).accent }

    var body: some View {
        NavigationLink {
            TripsSourceView(source: source, places: snapshot.places)
        } label: {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                HStack(spacing: PopsSpacing.sm) {
                    Image(systemName: source.symbol).font(.popsHeadline)
                    Text(title.uppercased()).font(.popsSectionLabel)
                    Spacer()
                    Image(systemName: "arrow.up.right").font(.popsCaption)
                }
                Text(source.displayName(places: snapshot.places))
                    .font(.popsLargeTitle).fixedSize(horizontal: false, vertical: true)
                Text(detail).font(.popsSubheadline)
                if !source.summary.isEmpty {
                    Text(source.summary).font(.popsBody)
                }
                if let status = source.status {
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
                            colors: [accent.opacity(0.2), Color.popsSurface],
                            startPoint: .topLeading, endPoint: .bottomTrailing))
            }
            .overlay {
                RoundedRectangle(cornerRadius: PopsRadius.card)
                    .stroke(accent.opacity(0.35), lineWidth: PopsBorder.hairline)
            }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
    }
}
