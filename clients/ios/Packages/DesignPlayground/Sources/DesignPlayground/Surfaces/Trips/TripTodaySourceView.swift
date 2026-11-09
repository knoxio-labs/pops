import DesignSystem
import SwiftUI

/// The selected source's own schedule and essentials; opening it never implies a booking or accessible file.
internal struct TripTodaySourceView: View {
    internal let source: TripsTodaySource
    internal let displayZone: String
    @Environment(\.dismiss) private var dismiss

    internal var body: some View {
        NavigationStack {
            List {
                if source.purchased {
                    Label("Purchased", systemImage: "checkmark.seal.fill")
                        .foregroundStyle(Color.popsSuccess)
                }
                schedule
                TripTodayEssentialsView(essentials: source.essentials)
            }
            .font(.popsBody)
            .foregroundStyle(Color.popsForeground)
            .navigationTitle(source.name)
            .playgroundTitleDisplay(large: false)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close", systemImage: "xmark") { dismiss() }
                        .labelStyle(.iconOnly)
                }
            }
        }
    }

    @ViewBuilder private var schedule: some View {
        switch source {
        case .stay(let stay):
            Section("Stay") {
                TripTodayTimeView(title: "From", clock: stay.from, displayZone: displayZone)
                TripTodayTimeView(title: "Until", clock: stay.to, displayZone: displayZone)
            }
        case .journey(let journey):
            ForEach(journey.legs) { leg in
                Section(leg.name) {
                    TripTodayTimeView(
                        title: "Departure", clock: leg.departure, displayZone: displayZone)
                    TripTodayTimeView(
                        title: "Arrival", clock: leg.arrival, displayZone: displayZone)
                }
            }
        case .event(let event):
            Section("Event") {
                if let agreement = event.agreement, !agreement.isEmpty {
                    Text(agreement).font(.popsHeadline)
                }
                TripTodayTimeView(title: "Starts", clock: event.start, displayZone: displayZone)
                TripTodayTimeView(title: "Ends", clock: event.end, displayZone: displayZone)
                if let day = event.day {
                    Text(tripsTodayDayLabel(day) ?? "Invalid source date · \(day)")
                }
            }
        }
    }
}
