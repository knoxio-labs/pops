import DesignSystem
import SwiftUI

/// Native Today list compares priority grouping with source chronology from one fixed fictional projection.
internal struct TripTodayView: View {
    internal let state: TripsTodayState
    internal let layout: TripTodayLayout
    @State private var selected: TripsTodaySource?

    private var projection: TripsTodayProjection { tripsTodayProjection(state) }

    internal var body: some View {
        List {
            if let day = projection.day, let label = tripsTodayDayLabel(day) {
                Section {
                    Text(label).font(.popsHeadline)
                    Text(state.displayZone).font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                }
            }
            if layout == .nextFirst {
                nextFirst
            } else {
                Section("Day timeline") {
                    ForEach(projection.sources) { source in
                        TripTodayRow(
                            source: source, displayZone: state.displayZone, chronological: true
                        ) { selected = $0 }
                    }
                }
            }
            if projection.sources.isEmpty && projection.findings.isEmpty {
                Text("No recorded plans in this window")
                    .font(.popsBody).foregroundStyle(Color.popsMutedForeground)
            }
            TripTodayIssuesView(state: state, findings: projection.findings) { selected = $0 }
        }
        .foregroundStyle(Color.popsForeground)
        .sheet(item: $selected) { source in
            TripTodaySourceView(source: source, displayZone: state.displayZone)
        }
    }

    @ViewBuilder private var nextFirst: some View {
        if let journey = projection.nextJourney {
            Section("Next journey") {
                TripTodayRow(source: .journey(journey), displayZone: state.displayZone) {
                    selected = $0
                }
            }
        }
        if !projection.currentStays.isEmpty {
            Section("Current stay") {
                ForEach(projection.currentStays) { stay in
                    TripTodayRow(source: .stay(stay), displayZone: state.displayZone) {
                        selected = $0
                    }
                }
            }
        }
        let promoted = Set(projection.currentStays.map { TripsTodaySource.stay($0).id })
            .union(projection.nextJourney.map { [TripsTodaySource.journey($0).id] } ?? [])
        let remaining = projection.sources.filter { !promoted.contains($0.id) }
        if !remaining.isEmpty {
            Section("Today") {
                ForEach(remaining) { source in
                    TripTodayRow(source: source, displayZone: state.displayZone) { selected = $0 }
                }
            }
        }
    }
}
