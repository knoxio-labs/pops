import DesignSystem
import SwiftUI

internal struct TripsTimelineControls: View {
    @Binding internal var filter: TripTimelineFilter
    @Environment(\.timeZone) private var zone
    @State private var rangeEnabled = false
    @State private var from = Date.now
    @State private var through = Date.now

    internal var body: some View {
        Section("Timeline") {
            PopsTextField("Search this Trip", placeholder: "Search this Trip", text: $filter.query)
            Picker("Group by", selection: $filter.grouping) {
                ForEach(TripTimelineGrouping.allCases) { Text($0.rawValue).tag($0) }
            }
            Picker("Booking dates", selection: $filter.scope) {
                ForEach(TripBookingScope.allCases) { Text($0.rawValue).tag($0) }
            }
            Toggle("Include alternative journeys", isOn: $filter.includeAlternatives)
            Toggle("Date range", isOn: $rangeEnabled)
            if rangeEnabled {
                DatePicker("From", selection: $from, displayedComponents: .date)
                DatePicker("Through", selection: $through, displayedComponents: .date)
            }
            if filter.invalidRange {
                Label("Through is before From", systemImage: "exclamationmark.triangle")
                    .foregroundStyle(Color.popsWarning)
            }
            Text("Times in \(zone.identifier)").font(.popsCaption)
        }
        .onChange(of: rangeEnabled) { updateRange() }
        .onChange(of: from) { updateRange() }
        .onChange(of: through) { updateRange() }
        .onChange(of: zone) { updateRange() }
    }

    private func updateRange() {
        filter.fromDay = rangeEnabled ? day(from) : nil
        filter.throughDay = rangeEnabled ? day(through) : nil
    }

    private func day(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = zone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
}
