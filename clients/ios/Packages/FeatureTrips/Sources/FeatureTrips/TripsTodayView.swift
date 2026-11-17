import AppCore
import DesignSystem
import SwiftUI

internal struct TripsTodayView: View {
    internal let snapshot: TripSnapshot
    @Environment(\.timeZone) private var zone

    internal var body: some View {
        TimelineView(.everyMinute) { context in
            let projection = TripTodayProjection(snapshot: snapshot, at: context.date)
            ScrollView {
                VStack(alignment: .leading, spacing: PopsSpacing.xl) {
                    header(context.date)
                    if let current = projection.now.first {
                        TripsTodayFocusCard(
                            source: current, title: "Happening now", detail: "In progress",
                            snapshot: snapshot, zone: zone)
                    } else if let next = projection.next.first {
                        TripsTodayFocusCard(
                            source: next, title: "Up next", detail: date(next),
                            snapshot: snapshot, zone: zone)
                    } else {
                        breathingRoom
                    }
                    upcoming(projection.next, excluding: projection.now.isEmpty ? 1 : 0)
                    TripsPlanStopStrip(snapshot: snapshot)
                    if !projection.other.isEmpty { unscheduled(projection.other) }
                    if !snapshot.trip.notes.isEmpty { notes }
                }
                .padding(.horizontal, PopsSpacing.lg)
                .padding(.top, PopsSpacing.lg)
                .padding(.bottom, PopsSpacing.xxl)
            }
            .background(Color.popsBackground)
        }
    }

    private func header(_ instant: Date) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            Text(instant.formatted(.dateTime.weekday(.wide).month(.wide).day()))
                .font(.popsSectionLabel).foregroundStyle(Color.popsAccent)
            Text(tripName(snapshot.trip)).font(.popsLargeTitle)
                .foregroundStyle(Color.popsForeground)
                .fixedSize(horizontal: false, vertical: true)
            if !snapshot.trip.destination.isEmpty {
                Text(snapshot.trip.destination).font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
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

    @ViewBuilder private func upcoming(_ sources: [TripSource], excluding count: Int) -> some View {
        let items = Array(sources.dropFirst(count).prefix(4))
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: PopsSpacing.md) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Coming up").font(.popsTitle)
                    Spacer()
                    Text("\(sources.count) planned")
                        .font(.popsCaption).foregroundStyle(Color.popsMutedForeground)
                }
                ForEach(items) { source in
                    TripsTodaySourceCard(source: source, snapshot: snapshot, zone: zone)
                }
            }
        }
    }

    private func unscheduled(_ sources: [TripSource]) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            Text("Still in your plan").font(.popsTitle)
            ForEach(sources.prefix(3)) { source in
                TripsTodaySourceCard(source: source, snapshot: snapshot, zone: zone)
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

    private func date(_ source: TripSource) -> String {
        guard let start = source.start else { return "Time not set" }
        return
            "\(TripClock.dateLabel(start, zone: zone)) · \(TripClock.clockLabel(start, zone: zone))"
    }
}

private struct TripsTodayFocusCard: View {
    let source: TripSource
    let title: String
    let detail: String
    let snapshot: TripSnapshot
    let zone: TimeZone

    private var accent: Color { tripsSourceAccent(source) }

    var body: some View {
        NavigationLink {
            TripsSourceView(source: source, places: snapshot.places)
        } label: {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                HStack(spacing: PopsSpacing.sm) {
                    Image(systemName: source.symbol).font(.popsHeadline)
                    Text(title.uppercased()).font(.popsSectionLabel)
                    Spacer()
                    Image(systemName: "arrow.up.right").font(.popsCaption)
                }
                Text(source.displayName(places: snapshot.places))
                    .font(.popsLargeTitle).fixedSize(horizontal: false, vertical: true)
                Text(detail).font(.popsSubheadline)
                if !source.summary.isEmpty {
                    Text(source.summary).font(.popsBody)
                }
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
            .padding(PopsSpacing.xl)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                RoundedRectangle(cornerRadius: PopsRadius.card)
                    .fill(
                        LinearGradient(
                            colors: [accent.opacity(0.2), Color.popsSurface],
                            startPoint: .topLeading, endPoint: .bottomTrailing))
            }
            .overlay {
                RoundedRectangle(cornerRadius: PopsRadius.card)
                    .stroke(accent.opacity(0.35), lineWidth: PopsBorder.hairline)
            }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
    }
}

private struct TripsTodaySourceCard: View {
    let source: TripSource
    let snapshot: TripSnapshot
    let zone: TimeZone

    private var accent: Color { tripsSourceAccent(source) }

    var body: some View {
        NavigationLink {
            TripsSourceView(source: source, places: snapshot.places)
        } label: {
            HStack(alignment: .top, spacing: PopsSpacing.md) {
                Image(systemName: source.symbol)
                    .font(.popsHeadline).foregroundStyle(accent)
                    .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
                    .background(accent.opacity(0.12), in: Circle())
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text(source.displayName(places: snapshot.places)).font(.popsHeadline)
                        .foregroundStyle(Color.popsForeground)
                    Text(source.summary.isEmpty ? date : source.summary)
                        .font(.popsSubheadline).foregroundStyle(Color.popsMutedForeground)
                    if let status = source.status {
                        Text(status).font(.popsCaption).foregroundStyle(Color.popsMutedForeground)
                    }
                }
                Spacer(minLength: PopsSpacing.xs)
                Image(systemName: "chevron.right").font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                    .frame(minHeight: PopsSize.touchTarget)
            }
            .padding(PopsSpacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.popsSurface, in: RoundedRectangle(cornerRadius: PopsRadius.card))
            .overlay {
                RoundedRectangle(cornerRadius: PopsRadius.card)
                    .stroke(Color.popsSeparator, lineWidth: PopsBorder.hairline)
            }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
    }

    private var date: String {
        guard let start = source.start else { return "Date not set" }
        return
            "\(TripClock.dateLabel(start, zone: zone)) · \(TripClock.clockLabel(start, zone: zone))"
    }
}

private func tripsSourceAccent(_ source: TripSource) -> Color {
    switch source {
    case .stay: .popsSuccess
    case .journey: .popsAccent
    case .event: .popsPurchases
    }
}
