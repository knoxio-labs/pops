import AppCore
import DesignSystem
import SwiftUI

internal struct TripsPlanCalendarView: View {
    internal let route: TripRouteSnapshot
    internal let snapshot: TripSnapshot?
    @Binding internal var selectedDay: String?
    internal let openSource: (TripSource) -> Void
    @Environment(\.timeZone) private var zone
    @Environment(\.calendar) private var calendar
    @Environment(\.locale) private var locale
    @Environment(\.dynamicTypeSize) private var typeSize

    internal var body: some View {
        let projection = TripPlanCalendarProjection(route: route, snapshot: snapshot, zone: zone)
        let day = selectedDay ?? TripPlanCalendarMonth.dayKey(.now, zone: zone)
        VStack(alignment: .leading, spacing: PopsSpacing.xl) {
            Text("Your calendar").font(.popsTitle)
            if let month = TripPlanCalendarMonth(containing: day) {
                monthControls(month, projection: projection, day: day)
                if typeSize.isAccessibilitySize {
                    monthAgenda(month, projection: projection)
                } else {
                    ViewThatFits(in: .horizontal) {
                        TripsPlanCalendarGrid(
                            month: month, projection: projection,
                            firstWeekday: calendar.firstWeekday,
                            locale: locale, selectedDay: day, selectDay: { selectedDay = $0 },
                            openSource: openSource)
                        monthAgenda(month, projection: projection)
                    }
                }
                dayAgenda(day, entries: projection.entries(on: day), places: projection.line.places)
            }
            remaining(projection)
        }
        .lineLimit(nil)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func monthControls(
        _ month: TripPlanCalendarMonth, projection: TripPlanCalendarProjection, day: String
    ) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            HStack(alignment: .center, spacing: PopsSpacing.sm) {
                Button("Previous month", systemImage: "chevron.left") {
                    selectedDay = month.moved(by: -1)?.firstDay
                }
                .labelStyle(.iconOnly)
                .frame(minWidth: PopsSize.touchTarget, minHeight: PopsSize.touchTarget)
                .disabled(month.moved(by: -1) == nil)
                Text(monthLabel(month))
                    .font(.popsHeadline)
                    .frame(maxWidth: .infinity)
                    .multilineTextAlignment(.center)
                Button("Next month", systemImage: "chevron.right") {
                    selectedDay = month.moved(by: 1)?.firstDay
                }
                .labelStyle(.iconOnly)
                .frame(minWidth: PopsSize.touchTarget, minHeight: PopsSize.touchTarget)
                .disabled(month.moved(by: 1) == nil)
            }
            DatePicker(
                "Date",
                selection: Binding(
                    get: { TripClock.day(day) ?? .now },
                    set: { selectedDay = TripPlanCalendarMonth.dayKey($0, zone: .gmt) }),
                displayedComponents: .date
            )
            .labelsHidden()
            .environment(\.calendar, gregorianCalendar)
            .environment(\.timeZone, TimeZone.gmt)
            if let first = projection.recordedDays.first {
                PopsButton("First dated item") { selectedDay = first }
            }
            Text(
                "Times shown in \(zone.identifier) when available. Dates without times stay as entered."
            )
            .font(.popsCaption)
            .foregroundStyle(Color.popsMutedForeground)
        }
    }

    private func monthAgenda(
        _ month: TripPlanCalendarMonth, projection: TripPlanCalendarProjection
    ) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            ForEach(month.days.filter { !projection.entries(on: $0).isEmpty }, id: \.self) { day in
                PopsButton(TripClock.dayLabel(day)) { selectedDay = day }
            }
            if month.days.allSatisfy({ projection.entries(on: $0).isEmpty }) {
                Text("No dated items this month")
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func dayAgenda(
        _ day: String, entries: [TripPlanCalendarEntry], places: [TripPlace]
    ) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.lg) {
            Text(TripClock.dayLabel(day)).font(.popsTitle)
            if entries.isEmpty {
                Text("No dated items for this day")
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            ForEach(entries) { entry in
                PopsCard(appearance: .featured) {
                    VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                        Text(entry.labels.joined(separator: " · "))
                            .font(.popsCaption)
                            .foregroundStyle(Color.popsTrips)
                        TripsPlanLineRow(item: entry.item, places: places, openSource: openSource)
                    }
                }
            }
        }
    }

    @ViewBuilder private func remaining(_ projection: TripPlanCalendarProjection) -> some View {
        if !projection.unallocated.isEmpty {
            VStack(alignment: .leading, spacing: PopsSpacing.md) {
                Text("Not fully dated").font(.popsHeadline)
                Text("Items without complete dates appear below.")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                ForEach(projection.unallocated) {
                    TripsPlanLineRow(
                        item: $0, places: projection.line.places, openSource: openSource)
                }
            }
        }
        let paths = projection.line.root.flatMap(\.paths)
        if !paths.isEmpty {
            DisclosureGroup("Alternatives and applied history") {
                VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                    ForEach(paths) {
                        TripsPlanLinePathView(
                            path: $0, places: projection.line.places, openSource: openSource)
                    }
                }
            }
            .frame(minHeight: PopsSize.touchTarget)
        }
        if !projection.line.recorded.isEmpty {
            DisclosureGroup("Not on the route") {
                VStack(alignment: .leading, spacing: PopsSpacing.md) {
                    ForEach(projection.line.recorded) {
                        TripsPlanLineRow(
                            item: $0, places: projection.line.places, openSource: openSource)
                    }
                }
            }
            .frame(minHeight: PopsSize.touchTarget)
        }
    }

    private func monthLabel(_ month: TripPlanCalendarMonth) -> String {
        guard let date = TripClock.day(month.firstDay) else { return month.firstDay }
        var style = Date.FormatStyle.dateTime.month(.wide).year()
        style.calendar = gregorianCalendar
        style.timeZone = .gmt
        style.locale = locale
        return date.formatted(style)
    }

    private var gregorianCalendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .gmt
        calendar.locale = locale
        return calendar
    }
}
