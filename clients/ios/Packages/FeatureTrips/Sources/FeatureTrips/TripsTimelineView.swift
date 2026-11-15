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
            ScrollViewReader { reader in
                List {
                    TripsOverviewView(projection: overview, date: context.date)
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.popsBackground)
                    if !overview.chaptersFollowFocus {
                        chapters(overview.chapters, reader: reader)
                    }
                    ForEach(overview.now) {
                        TripsSourceRow(
                            source: $0, zone: zone, places: snapshot.places, isCurrent: true)
                    }
                    ForEach(overview.nextFocus) {
                        TripsNextSummaryRow(source: $0, zone: zone, places: snapshot.places)
                    }
                    attention
                    if overview.chaptersFollowFocus {
                        chapters(overview.chapters, reader: reader)
                    }
                    DisclosureGroup("Timeline options") {
                        TripsTimelineControls(filter: $filter)
                    }
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.popsBackground)
                    if filter.grouping == .sourceOrder {
                        TripsTimelineRoute(snapshot: snapshot, sources: sources, visits: visits)
                    } else {
                        TripsTimelineVisits(snapshot: snapshot, sources: [], visits: visits)
                        TripsTimelineCalendar(
                            sources: sources, places: snapshot.places, filter: filter)
                    }
                    if sources.isEmpty && visits.isEmpty {
                        Text("No matching recorded sources")
                            .foregroundStyle(Color.popsMutedForeground)
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .background(Color.popsBackground)
            }
        }
    }

    @ViewBuilder private var attention: some View {
        let findings = tripReferenceFindings(snapshot)
        if !findings.isEmpty {
            Section {
                PopsCard(appearance: .featured) {
                    VStack(alignment: .leading, spacing: PopsSpacing.md) {
                        ForEach(findings) { finding in
                            Label(finding.message, systemImage: "exclamationmark.triangle")
                                .font(.popsSubheadline)
                                .foregroundStyle(Color.popsTripsAttention)
                        }
                    }
                }
                .listRowSeparator(.hidden)
                .listRowBackground(Color.popsBackground)
            } header: {
                sectionTitle("Needs you")
            }
        }
    }

    @ViewBuilder private func chapters(
        _ chapters: [TripOverviewChapter], reader: ScrollViewProxy
    ) -> some View {
        if !chapters.isEmpty {
            TripsChapterRail(chapters: chapters) { id in
                reader.scrollTo(id, anchor: .top)
            }
        }
    }

    private func sectionTitle(_ title: String) -> some View {
        Text(title)
            .font(.popsTitle)
            .foregroundStyle(Color.popsForeground)
            .textCase(nil)
            .accessibilityAddTraits(.isHeader)
    }
}
