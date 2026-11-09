import DesignSystem
import SwiftUI

/// A whole native row opens the exact source identity, with source-backed codes and addresses kept readable.
internal struct TripTodayRow: View {
    internal let source: TripsTodaySource
    internal let displayZone: String
    internal var chronological = false
    internal let open: (TripsTodaySource) -> Void
    @ScaledMetric(relativeTo: .body) private var minimumTarget = PopsSize.touchTarget

    internal var body: some View {
        Button {
            open(source)
        } label: {
            HStack(alignment: .top, spacing: PopsSpacing.md) {
                Image(systemName: symbol).foregroundStyle(Color.popsAccent)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text(source.name).font(.popsHeadline)
                    summary
                    if source.purchased {
                        Label("Purchased", systemImage: "checkmark.seal.fill")
                            .font(.popsCaption).foregroundStyle(Color.popsSuccess)
                    }
                    if let reference = source.essentials.reference, !reference.isEmpty {
                        Text(reference).font(.popsMonospaced)
                    }
                    if let address = source.essentials.address, !address.isEmpty {
                        Text(address).font(.popsSubheadline)
                    }
                }
                Spacer(minLength: PopsSpacing.zero)
                Image(systemName: "chevron.right")
                    .font(.popsCaption).foregroundStyle(Color.popsMutedForeground)
                    .accessibilityHidden(true)
            }
            .foregroundStyle(Color.popsForeground)
            .frame(maxWidth: .infinity, minHeight: minimumTarget, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Open details")
    }

    private var symbol: String {
        switch source {
        case .stay: "bed.double"
        case .journey: "arrow.triangle.branch"
        case .event: "calendar"
        }
    }

    @ViewBuilder private var summary: some View {
        switch source {
        case .stay(let stay):
            if chronological {
                TripTodayRowClock(title: "From", clock: stay.from, zone: displayZone)
            }
            TripTodayRowClock(title: "Until", clock: stay.to, zone: displayZone)
        case .journey(let journey):
            TripTodayRowClock(
                title: "Departs", clock: journey.legs.first?.departure, zone: displayZone)
            TripTodayRowClock(
                title: "Arrives", clock: journey.legs.last?.arrival, zone: displayZone)
        case .event(let event):
            TripTodayRowClock(title: "Starts", clock: event.start, zone: displayZone)
            if let day = event.day, let label = tripsTodayDayLabel(day) {
                Text(label).font(.popsCaption).foregroundStyle(Color.popsMutedForeground)
            }
            if let agreement = event.agreement, !agreement.isEmpty {
                Text(agreement).font(.popsCaption)
            }
        }
    }
}

/// A compact display-zone clock omits absent values rather than labelling them all-day.
internal struct TripTodayRowClock: View {
    internal let title: String
    internal let clock: TripsTodayClock?
    internal let zone: String

    internal var body: some View {
        if let clock {
            Text("\(title) \(TripTodayClockCopy.label(clock, zone: zone, includeZone: false))")
                .font(.popsCaption).foregroundStyle(Color.popsMutedForeground)
        }
    }
}
