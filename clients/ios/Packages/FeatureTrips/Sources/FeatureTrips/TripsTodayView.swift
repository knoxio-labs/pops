import AppCore
import DesignSystem
import SwiftUI

internal struct TripsTodayView: View {
    internal let snapshot: TripSnapshot

    internal var body: some View {
        TimelineView(.everyMinute) { context in
            TripsTodayContent(snapshot: snapshot, date: context.date)
        }
    }
}

internal struct TripsTodayContent: View {
    internal let snapshot: TripSnapshot
    internal let date: Date
    @Environment(\.timeZone) private var zone

    internal var body: some View {
        let sources = tripSources(snapshot)
        let projection = TripOverviewProjection(
            snapshot: snapshot, at: date, zone: zone,
            visibleSources: sources, visibleVisits: snapshot.visits)
        let groups = tripTimelineGroups(
            snapshot: snapshot, sources: sources, visits: snapshot.visits, grouping: .day,
            zone: zone)
        return ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.xl) {
                TripsOverviewView(projection: projection, date: date)
                if projection.focusSections.isEmpty {
                    breathingRoom
                }
                ForEach(projection.focusSections) { section in
                    focusContent(section)
                }
                if !groups.isEmpty {
                    VStack(alignment: .leading, spacing: PopsSpacing.md) {
                        Text("Your journey").font(.popsTitle)
                        ForEach(groups) { group in
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

    @ViewBuilder private func focusContent(_ section: TripOverviewFocusSection) -> some View {
        switch section {
        case .now(let sources):
            ForEach(sources) { source in
                TripsTodayFocusCard(
                    source: source, snapshot: snapshot, zone: zone)
            }
        case .next(let sources):
            VStack(alignment: .leading, spacing: PopsSpacing.md) {
                Text("Next").font(.popsSectionLabel).foregroundStyle(Color.popsTrips)
                ForEach(sources) { source in
                    TripsNextSummaryRow(source: source, zone: zone, places: snapshot.places)
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

private struct TripsTodayFocusCard: View {
    let source: TripSource
    let snapshot: TripSnapshot
    let zone: TimeZone

    private var accent: Color { TripsSourceStyle(source: source).accent }

    var body: some View {
        NavigationLink {
            TripsSourceView(source: source, places: snapshot.places)
        } label: {
            PopsCard(appearance: .featured) {
                VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                    HStack(spacing: PopsSpacing.sm) {
                        Image(systemName: source.symbol).font(.popsHeadline)
                        Text("NOW").font(.popsSectionLabel)
                        Spacer()
                        Image(systemName: "arrow.up.right").font(.popsCaption)
                    }
                    Text(source.displayName(places: snapshot.places))
                        .font(.popsLargeTitle).fixedSize(horizontal: false, vertical: true)
                    Text("In progress").font(.popsSubheadline)
                    focusDetails
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
            }
            .overlay(alignment: .leading) {
                Capsule()
                    .fill(accent)
                    .frame(width: PopsBorder.emphasis)
                    .padding(.vertical, PopsSpacing.md)
                    .accessibilityHidden(true)
            }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var focusDetails: some View {
        if case .journey(let journey) = source {
            ForEach(journey.legs) { leg in
                TripsJourneyLegView(leg: leg, places: snapshot.places, showsReference: false)
            }
        } else {
            TripsSourceScheduleView(
                value: TripSourceSchedulePresentation(source: source, isCurrent: true), zone: zone)
            if !source.summary.isEmpty {
                Text(source.summary).font(.popsBody)
            }
            if case .stay(let stay) = source,
                let address = stay.address?.trimmingCharacters(in: .whitespacesAndNewlines),
                !address.isEmpty
            {
                Label(address, systemImage: "mappin.and.ellipse")
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
    }
}
