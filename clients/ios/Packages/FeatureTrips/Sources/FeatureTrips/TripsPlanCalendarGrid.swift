import AppCore
import DesignSystem
import SwiftUI

internal struct TripsPlanCalendarGrid: View {
    internal let month: TripPlanCalendarMonth
    internal let projection: TripPlanCalendarProjection
    internal let firstWeekday: Int
    internal let locale: Locale
    internal let selectedDay: String
    internal let selectDay: (String) -> Void
    internal let openSource: (TripSource) -> Void
    @ScaledMetric(relativeTo: .caption) private var dayWidth = PopsSize.touchTarget

    internal var body: some View {
        let cells = month.cells(firstWeekday: firstWeekday)
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            HStack(spacing: PopsSpacing.zero) {
                ForEach(Array(weekdayNames.enumerated()), id: \.offset) { _, name in
                    Text(name)
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                        .frame(minWidth: dayWidth, maxWidth: .infinity)
                }
            }
            ForEach(Array(stride(from: 0, to: cells.count, by: 7)), id: \.self) { start in
                week(Array(cells[start..<min(start + 7, cells.count)]))
            }
            Text("Stays run from arrival until checkout. The checkout day is not included.")
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
        }
        .frame(width: dayWidth * 7)
    }

    private func week(_ cells: [String?]) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            HStack(spacing: PopsSpacing.zero) {
                ForEach(Array(cells.enumerated()), id: \.offset) { _, day in
                    if let day {
                        dayButton(day)
                    } else {
                        Color.popsBackground
                            .frame(minWidth: dayWidth, maxWidth: .infinity, minHeight: dayWidth)
                            .accessibilityHidden(true)
                    }
                }
            }
            ForEach(projection.staySpans(in: cells.compactMap { $0 })) { span in
                stayBand(span, cells: cells)
            }
        }
    }

    private func stayBand(_ span: TripPlanCalendarStaySpan, cells: [String?]) -> some View {
        Button {
            openSource(.stay(span.stay))
        } label: {
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(TripSource.stay(span.stay).name)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsForeground)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: PopsSpacing.zero) {
                    ForEach(Array(cells.enumerated()), id: \.offset) { _, day in
                        Capsule()
                            .fill(Color.popsTrips)
                            .opacity(day.map(span.covers) == true ? 1 : 0)
                            .frame(minWidth: dayWidth, maxWidth: .infinity)
                    }
                }
                .frame(height: PopsSpacing.xs)
                .accessibilityHidden(true)
            }
            .frame(minHeight: PopsSize.touchTarget, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(
            "\(TripSource.stay(span.stay).name), \(span.arrivalDay) to checkout \(span.departureDay)"
        )
        .accessibilityHint("Open stay details")
    }

    private func dayButton(_ day: String) -> some View {
        let count = projection.entries(on: day).count
        return Button {
            selectDay(day)
        } label: {
            VStack(spacing: PopsSpacing.xs) {
                Text(String(day.suffix(2)))
                    .font(.popsSubheadline)
                    .monospacedDigit()
                Text(count == 0 ? " " : "\(count)")
                    .font(.popsCaption)
            }
            .foregroundStyle(day == selectedDay ? Color.popsTrips : Color.popsForeground)
            .frame(minWidth: dayWidth, maxWidth: .infinity, minHeight: dayWidth)
            .background(
                day == selectedDay ? Color.popsTripsTint : Color.popsBackground,
                in: RoundedRectangle(cornerRadius: PopsRadius.control)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(TripClock.dayLabel(day))
        .accessibilityValue("\(count) items")
        .accessibilityAddTraits(day == selectedDay ? .isSelected : [])
    }

    private var weekdayNames: [String] {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.calendar = Calendar(identifier: .gregorian)
        let names = formatter.shortStandaloneWeekdaySymbols ?? []
        guard names.count == 7, (1...7).contains(firstWeekday) else { return names }
        let start = firstWeekday - 1
        return Array(names[start...] + names[..<start])
    }
}
