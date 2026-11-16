import AppCore
import DesignSystem
import SwiftUI

internal struct TripsTimelineView: View {
    internal let snapshot: TripSnapshot
    @Environment(\.timeZone) private var zone
    @State private var filter = TripTimelineFilter()

    internal var body: some View {
        TimelineView(.everyMinute) { context in
            let sources = filter.sources(in: snapshot, at: context.date, zone: zone)
            let visits = filter.visits(in: snapshot, sources: sources)
            let overview = TripOverviewProjection(
                snapshot: snapshot, at: context.date, zone: zone,
                visibleSources: sources, visibleVisits: visits)
            let groups = tripTimelineGroups(
                snapshot: snapshot, sources: sources, visits: visits,
                grouping: filter.grouping, zone: zone)

            ScrollView {
                LazyVStack(alignment: .leading, spacing: PopsSpacing.xxl) {
                    TripsOverviewView(
                        projection: overview, date: context.date, trip: snapshot.trip)
                    focus(overview)
                    attention
                    timeline(groups)
                }
                .padding(.horizontal, PopsSpacing.lg)
                .padding(.top, PopsSpacing.lg)
                .padding(.bottom, PopsSpacing.xxl)
            }
            .scrollIndicators(.hidden)
            .background(Color.popsBackground)
        }
    }

    @ViewBuilder private func focus(_ overview: TripOverviewProjection) -> some View {
        if !overview.now.isEmpty || !overview.nextFocus.isEmpty {
            VStack(alignment: .leading, spacing: PopsSpacing.md) {
                if !overview.now.isEmpty {
                    sectionTitle("Now")
                    ForEach(overview.now) { source in
                        TripsSourceRow(
                            source: source, zone: zone, places: snapshot.places,
                            context: "In progress", isCurrent: true)
                    }
                }
                if !overview.nextFocus.isEmpty {
                    sectionTitle(overview.now.isEmpty ? "Up next" : "Coming up")
                    ForEach(overview.nextFocus) { source in
                        TripsSourceRow(
                            source: source, zone: zone, places: snapshot.places,
                            context: "Next")
                    }
                }
            }
        }
    }

    @ViewBuilder private var attention: some View {
        let findings = tripReferenceFindings(snapshot)
        if !findings.isEmpty {
            VStack(alignment: .leading, spacing: PopsSpacing.md) {
                sectionTitle("Needs you")
                PopsCard(appearance: .featured) {
                    VStack(alignment: .leading, spacing: PopsSpacing.md) {
                        ForEach(findings) { finding in
                            Label(finding.message, systemImage: "exclamationmark.triangle")
                                .font(.popsSubheadline)
                                .foregroundStyle(Color.popsTripsAttention)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder private func timeline(_ groups: [TripTimelineGroup]) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            sectionTitle("Your timeline")
            timelineOptions
            if groups.isEmpty {
                ContentUnavailableView(
                    "Nothing recorded yet", systemImage: "sparkles",
                    description: Text("Add a place, booking or idea to start your trip."))
            } else {
                ForEach(groups) { group in
                    TripsTimelineGroupView(group: group, places: snapshot.places, zone: zone)
                }
            }
        }
    }

    private var timelineOptions: some View {
        DisclosureGroup("Timeline options") {
            TripsTimelineControls(filter: $filter)
        }
        .font(.popsSubheadline)
        .foregroundStyle(Color.popsMutedForeground)
        .padding(.top, PopsSpacing.sm)
    }

    private func sectionTitle(_ title: String) -> some View {
        Text(title)
            .font(.popsTitle)
            .foregroundStyle(Color.popsForeground)
            .accessibilityAddTraits(.isHeader)
    }
}
