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
            ScrollView {
                VStack(alignment: .leading, spacing: PopsSpacing.xl) {
                    header
                    TripsPlanStopStrip(snapshot: snapshot)
                    TripsTimelineControls(filter: $filter)
                    findings
                    if filter.grouping == .sourceOrder {
                        TripsPlanRoute(snapshot: snapshot, sources: sources, visits: visits)
                    } else {
                        TripsPlanCalendar(sources: sources, places: snapshot.places, filter: filter)
                    }
                    if sources.isEmpty && visits.isEmpty {
                        ContentUnavailableView(
                            "No matching plans", systemImage: "map",
                            description: Text("Try widening the dates or changing the filter."))
                    }
                }
                .padding(.horizontal, PopsSpacing.lg)
                .padding(.top, PopsSpacing.lg)
                .padding(.bottom, PopsSpacing.xxl)
            }
            .background(Color.popsBackground)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text("Your route, your pace").font(.popsLargeTitle)
                .foregroundStyle(Color.popsForeground)
            Text(tripName(snapshot.trip)).font(.popsSubheadline)
                .foregroundStyle(Color.popsMutedForeground)
        }
    }

    @ViewBuilder private var findings: some View {
        let values = tripReferenceFindings(snapshot)
        if !values.isEmpty {
            VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                Label("Needs attention", systemImage: "exclamationmark.triangle.fill")
                    .font(.popsHeadline).foregroundStyle(Color.popsWarning)
                ForEach(values) { finding in
                    Text(finding.message).font(.popsSubheadline)
                        .foregroundStyle(Color.popsMutedForeground)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(PopsSpacing.md)
                        .background(
                            Color.popsSurface, in: RoundedRectangle(cornerRadius: PopsRadius.card))
                }
            }
        }
    }
}
