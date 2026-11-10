import DesignSystem
import SwiftUI

/// Calendar filters use date-only selections and show source clocks only when actually recorded.
internal struct TripBrowserCalendarView: View {
    internal let trip: TripsBrowserTrip
    @State private var selected: Date?
    @State private var through: Date?
    @State private var range = false

    internal init(trip: TripsBrowserTrip) {
        self.trip = trip
        let day = tripsBrowserCalendarDays(trip).first
        let date = day.flatMap(TripBrowserCalendarDates.date)
        _selected = State(initialValue: date)
        _through = State(initialValue: date)
    }

    internal var body: some View {
        List {
            if let selected, let through {
                Section {
                    Picker("Dates", selection: $range) {
                        Text("Day").tag(false)
                        Text("Range").tag(true)
                    }
                    .pickerStyle(.segmented)
                    DatePicker(
                        range ? "From" : "Date",
                        selection: binding(for: $selected, fallback: selected),
                        displayedComponents: .date)
                    if range {
                        DatePicker(
                            "Through", selection: binding(for: $through, fallback: through),
                            in: selected..., displayedComponents: .date)
                    }
                    Text(trip.today.displayZone).font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                }
                let days = TripBrowserCalendarDates.days(
                    from: selected, through: range ? max(selected, through) : selected)
                ForEach(tripsBrowserTimingFindings(trip)) { finding in
                    Label(finding.message, systemImage: "exclamationmark.triangle")
                        .font(.popsCaption).foregroundStyle(Color.popsWarning)
                }
                ForEach(days, id: \.self) { day in
                    calendarDay(day)
                }
            } else {
                Text("No Recorded Dates")
            }
        }
        .environment(\.timeZone, TripBrowserCalendarDates.zone)
    }

    private func binding(for value: Binding<Date?>, fallback: Date) -> Binding<Date> {
        Binding(get: { value.wrappedValue ?? fallback }, set: { value.wrappedValue = $0 })
    }

    private func calendarDay(_ day: String) -> some View {
        let projection = tripsBrowserCalendar(trip, day: day)
        return Section(tripsTodayDayLabel(day) ?? day) {
            ForEach(projection.entries) { entry in
                NavigationLink {
                    TripBrowserSourceView(source: entry.source, trip: trip)
                } label: {
                    HStack(alignment: .top, spacing: PopsSpacing.md) {
                        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                            if let clock = entry.clock,
                                let time = tripsTodayLocalTime(clock, zone: trip.today.displayZone)
                            {
                                Text(time).font(.popsMonospacedCaption)
                            } else {
                                Text(untimedLabel(entry))
                                    .font(.popsCaption)
                            }
                            Text(boundary(entry)).font(.popsCaption)
                                .foregroundStyle(Color.popsMutedForeground)
                        }
                        TripBrowserSourceSummary(
                            source: entry.source, displayZone: trip.today.displayZone)
                    }
                }
            }
            if projection.entries.isEmpty { Text("No Recorded Plans") }
            ForEach(projection.findings) { finding in
                Label(finding.message, systemImage: "exclamationmark.triangle")
                    .font(.popsCaption).foregroundStyle(Color.popsWarning)
            }
        }
    }

    private func untimedLabel(_ entry: TripsTodayCommitment) -> String {
        if case .event(let event) = entry.source, event.day != nil { return "Date Only" }
        return "Continues"
    }

    private func boundary(_ entry: TripsTodayCommitment) -> String {
        switch entry.boundary {
        case .start: "Starts"
        case .end: "Ends"
        case .continuing: entry.clock == nil ? "" : "Continues"
        }
    }
}

/// Picker dates are Gregorian date-only values, independent of the device's calendar or clock.
internal enum TripBrowserCalendarDates {
    internal static var zone: TimeZone { TimeZone(identifier: "UTC") ?? .gmt }

    internal static func date(_ day: String) -> Date? {
        guard tripsTodayValidDay(day) else { return nil }
        return tripsBrowserCalendarDate(day, zone: "UTC")
    }

    internal static func days(from: Date, through: Date) -> [String] {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        var cursor = calendar.startOfDay(for: from)
        let end = calendar.startOfDay(for: through)
        var result: [String] = []
        while cursor <= end {
            if let day = tripsBrowserCalendarDay(cursor, zone: "UTC") { result.append(day) }
            guard let next = calendar.date(byAdding: .day, value: 1, to: cursor), next > cursor
            else {
                break
            }
            cursor = next
        }
        return result
    }
}
