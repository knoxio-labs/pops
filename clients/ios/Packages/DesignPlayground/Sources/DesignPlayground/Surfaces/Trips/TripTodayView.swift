import DesignSystem
import SwiftUI

/// Native Today prioritises active sources, then known future starts, while retaining a secondary chronology.
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
                nowThenNext
            } else {
                Section("Timeline") {
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

    @ViewBuilder private var nowThenNext: some View {
        prioritySection("Now", phase: .now)
        prioritySection("Next", phase: .next)
        prioritySection("Today", phase: .other)
    }

    @ViewBuilder private func prioritySection(
        _ title: String, phase: TripsTodaySourcePhase
    ) -> some View {
        let sources = projection.sources.filter {
            tripsTodaySourcePhase($0, now: state.now) == phase
        }
        if !sources.isEmpty {
            Section(title) {
                ForEach(sources) { source in
                    TripTodayRow(
                        source: source, displayZone: state.displayZone,
                        chronological: phase == .next
                    ) { selected = $0 }
                }
            }
        }
    }
}
