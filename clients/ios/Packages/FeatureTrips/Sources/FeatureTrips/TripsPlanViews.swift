import AppCore
import DesignSystem
import SwiftUI

internal struct TripsPlanStopStrip: View {
    internal let snapshot: TripSnapshot

    internal var body: some View {
        if !snapshot.visits.isEmpty {
            VStack(alignment: .leading, spacing: PopsSpacing.sm) {
                HStack(alignment: .firstTextBaseline) {
                    Text("The route").font(.popsTitle)
                    Spacer()
                    Text("\(snapshot.visits.count) stops").font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                }
                ScrollView(.horizontal) {
                    HStack(spacing: PopsSpacing.sm) {
                        ForEach(Array(snapshot.visits.enumerated()), id: \.element.id) {
                            index, visit in
                            stop(visit, index: index)
                        }
                    }
                    .padding(.vertical, PopsSpacing.xs)
                }
                .scrollIndicators(.hidden)
            }
        }
    }

    private func stop(_ visit: TripVisit, index: Int) -> some View {
        let place = snapshot.places.first { $0.id == visit.placeId }
        let dates = [visit.timing.arrival, visit.timing.departure]
            .compactMap { $0 }
            .map(TripClock.dayLabel)
            .joined(separator: " – ")
        let duration = visit.timing.duration.flatMap(tripVisitDurationLabel)

        return VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            HStack(spacing: PopsSpacing.xs) {
                Circle().fill(Color.popsAccent).frame(width: 7, height: 7)
                Text("STOP \(index + 1)").font(.popsSectionLabel)
                    .foregroundStyle(Color.popsAccent)
            }
            Text(place?.name ?? "Place unavailable").font(.popsHeadline)
                .foregroundStyle(Color.popsForeground)
                .lineLimit(2)
            Text(dates.isEmpty ? "Dates open" : dates).font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
            if let duration {
                Text(duration).font(.popsCaption).foregroundStyle(Color.popsSuccess)
            }
        }
        .frame(width: 180, alignment: .leading)
        .padding(PopsSpacing.md)
        .background {
            RoundedRectangle(cornerRadius: PopsRadius.card)
                .fill(
                    LinearGradient(
                        colors: [Color.popsAccent.opacity(0.14), Color.popsSurface],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ))
        }
        .overlay {
            RoundedRectangle(cornerRadius: PopsRadius.card)
                .stroke(Color.popsAccent.opacity(0.24), lineWidth: PopsBorder.hairline)
        }
        .accessibilityElement(children: .combine)
    }
}

internal struct TripsPlanRoute: View {
    internal let snapshot: TripSnapshot
    internal let sources: [TripSource]
    internal let visits: [TripVisit]
    @Environment(\.timeZone) private var zone

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xl) {
            ForEach(Array(visits.enumerated()), id: \.element.id) { index, visit in
                visitCard(visit, index: index)
            }
            if !journeys.isEmpty {
                sourceGroup("Flights & getting around", symbol: "airplane", sources: journeys)
            }
            if !otherSources.isEmpty {
                sourceGroup("Not linked to a stop", symbol: "tray", sources: otherSources)
            }
        }
    }

    private var journeys: [TripSource] {
        sources.filter { if case .journey = $0 { true } else { false } }
    }

    private var otherSources: [TripSource] {
        sources.filter { source in
            if case .journey = source { return false }
            return !visits.contains { $0.id == source.visitID }
        }
    }

    private func visitCard(_ visit: TripVisit, index: Int) -> some View {
        let place = snapshot.places.first { $0.id == visit.placeId }
        let linked = sources.filter { $0.visitID == visit.id }
        let dates = [visit.timing.arrival, visit.timing.departure]
            .compactMap { $0 }
            .map(TripClock.dayLabel)
            .joined(separator: " – ")

        return VStack(alignment: .leading, spacing: PopsSpacing.md) {
            HStack(alignment: .top, spacing: PopsSpacing.md) {
                Text("\(index + 1)").font(.popsSectionLabel)
                    .foregroundStyle(Color.popsAccent)
                    .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
                    .background(Color.popsAccent.opacity(0.12), in: Circle())
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text(place?.name ?? "Place unavailable").font(.popsTitle)
                        .foregroundStyle(Color.popsForeground)
                    Text(dates.isEmpty ? "Dates open" : dates).font(.popsSubheadline)
                        .foregroundStyle(Color.popsMutedForeground)
                    if let duration = visit.timing.duration.flatMap(tripVisitDurationLabel) {
                        Text(duration).font(.popsCaption).foregroundStyle(Color.popsSuccess)
                    }
                    if !visit.notes.isEmpty {
                        Text(visit.notes).font(.popsSubheadline)
                            .foregroundStyle(Color.popsMutedForeground)
                    }
                }
            }
            if !linked.isEmpty {
                VStack(spacing: PopsSpacing.sm) {
                    ForEach(linked) { sourceCard($0) }
                }
                .padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
            } else {
                Label("No bookings linked here", systemImage: "plus.circle")
                    .font(.popsCaption).foregroundStyle(Color.popsMutedForeground)
                    .padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
            }
        }
        .padding(PopsSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.popsSurface, in: RoundedRectangle(cornerRadius: PopsRadius.card))
        .overlay {
            RoundedRectangle(cornerRadius: PopsRadius.card)
                .stroke(Color.popsSeparator, lineWidth: PopsBorder.hairline)
        }
    }

    private func sourceGroup(_ title: String, symbol: String, sources: [TripSource]) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            Label(title, systemImage: symbol).font(.popsTitle)
            ForEach(sources) { source in sourceCard(source) }
        }
    }

    private func sourceCard(_ source: TripSource) -> some View {
        NavigationLink {
            TripsSourceView(source: source, places: snapshot.places)
        } label: {
            HStack(alignment: .top, spacing: PopsSpacing.md) {
                Image(systemName: source.symbol).foregroundStyle(accent(source))
                    .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
                    .background(accent(source).opacity(0.12), in: Circle())
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text(source.displayName(places: snapshot.places)).font(.popsHeadline)
                        .foregroundStyle(Color.popsForeground)
                    if !source.summary.isEmpty {
                        Text(source.summary).font(.popsSubheadline)
                            .foregroundStyle(Color.popsMutedForeground)
                    }
                    if let status = source.status {
                        Text(status).font(.popsCaption)
                            .foregroundStyle(
                                status == "Purchased"
                                    ? Color.popsSuccess : Color.popsMutedForeground)
                    }
                    TripSourceStateLines(source: source)
                }
                Spacer(minLength: PopsSpacing.xs)
                Image(systemName: "chevron.right").font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                    .frame(minHeight: PopsSize.touchTarget)
            }
            .padding(PopsSpacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.popsBackground, in: RoundedRectangle(cornerRadius: PopsRadius.card))
            .overlay {
                RoundedRectangle(cornerRadius: PopsRadius.card)
                    .stroke(Color.popsSeparator, lineWidth: PopsBorder.hairline)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
    }

    private func accent(_ source: TripSource) -> Color {
        switch source {
        case .stay: .popsSuccess
        case .journey: .popsAccent
        case .event: .popsPurchases
        }
    }
}

internal struct TripsPlanCalendar: View {
    internal let sources: [TripSource]
    internal let places: [TripPlace]
    internal let filter: TripTimelineFilter
    @Environment(\.timeZone) private var zone

    internal var body: some View {
        let facts = tripCalendarFacts(sources: sources, zone: zone).filter {
            filter.includes(day: $0.day)
        }
        let keys = Set(facts.map(key)).sorted()
        VStack(alignment: .leading, spacing: PopsSpacing.xl) {
            ForEach(keys, id: \.self) { group in
                VStack(alignment: .leading, spacing: PopsSpacing.md) {
                    Text(groupTitle(group)).font(.popsTitle)
                    ForEach(facts.filter { key($0) == group }) { fact in
                        NavigationLink {
                            TripsSourceView(source: fact.source, places: places)
                        } label: {
                            HStack(alignment: .top, spacing: PopsSpacing.md) {
                                Image(systemName: fact.source.symbol)
                                    .foregroundStyle(accent(fact.source))
                                    .frame(
                                        width: PopsSize.touchTarget, height: PopsSize.touchTarget)
                                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                                    Text(fact.source.displayName(places: places)).font(
                                        .popsHeadline
                                    )
                                    .foregroundStyle(Color.popsForeground)
                                    Text("\(TripClock.dayLabel(fact.day)) · \(fact.label)")
                                        .font(.popsCaption).foregroundStyle(
                                            Color.popsMutedForeground)
                                    if let instant = fact.instant {
                                        Text(TripClock.clockLabel(instant, zone: zone))
                                            .font(.popsSubheadline)
                                            .foregroundStyle(Color.popsMutedForeground)
                                    }
                                }
                                Spacer()
                                Image(systemName: "chevron.right").font(.popsCaption)
                                    .foregroundStyle(Color.popsMutedForeground)
                            }
                            .padding(PopsSpacing.md)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(
                                Color.popsSurface,
                                in: RoundedRectangle(cornerRadius: PopsRadius.card)
                            )
                            .overlay {
                                RoundedRectangle(cornerRadius: PopsRadius.card)
                                    .stroke(Color.popsSeparator, lineWidth: PopsBorder.hairline)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            let undated = sources.filter { tripCalendarFacts(sources: [$0], zone: zone).isEmpty }
            if !undated.isEmpty {
                VStack(alignment: .leading, spacing: PopsSpacing.md) {
                    Text("Dates not set").font(.popsTitle)
                    ForEach(undated) { source in
                        NavigationLink {
                            TripsSourceView(source: source, places: places)
                        } label: {
                            TripsSourceRow(source: source, zone: zone, places: places)
                                .padding(PopsSpacing.md)
                                .background(
                                    Color.popsSurface,
                                    in: RoundedRectangle(cornerRadius: PopsRadius.card))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func key(_ fact: TripCalendarFact) -> String {
        filter.grouping == .month ? String(fact.day.prefix(7)) : fact.day
    }

    private func groupTitle(_ value: String) -> String {
        guard filter.grouping == .month else { return TripClock.dayLabel(value) }
        let parts = value.split(separator: "-")
        guard parts.count == 2,
            let month = Int(parts[1]),
            (1...12).contains(month)
        else { return value }
        return Calendar.current.monthSymbols[month - 1] + " " + parts[0]
    }

    private func accent(_ source: TripSource) -> Color {
        switch source {
        case .stay: .popsSuccess
        case .journey: .popsAccent
        case .event: .popsPurchases
        }
    }
}
