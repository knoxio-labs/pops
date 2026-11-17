import AppCore
import DesignSystem
import SwiftUI

internal struct TripsBookingGroup: Identifiable {
    internal let kind: Kind
    internal let sources: [TripSource]

    internal var id: Kind { kind }

    internal enum Kind: String, CaseIterable, Identifiable {
        case transport
        case stays
        case plans

        internal var id: Self { self }
        internal var title: String {
            switch self {
            case .transport: "Flights & getting around"
            case .stays: "Places to stay"
            case .plans: "Things to do"
            }
        }
        internal var symbol: String {
            switch self {
            case .transport: "airplane"
            case .stays: "bed.double.fill"
            case .plans: "ticket.fill"
            }
        }
    }
}

internal func tripBookingGroups(_ snapshot: TripSnapshot) -> [TripsBookingGroup] {
    let sources = allTripSources(snapshot)
    return TripsBookingGroup.Kind.allCases.compactMap { kind in
        let matching = sources.filter { source in
            switch (kind, source) {
            case (.transport, .journey), (.stays, .stay), (.plans, .event): true
            default: false
            }
        }
        return matching.isEmpty ? nil : TripsBookingGroup(kind: kind, sources: matching)
    }
}

internal struct TripsBookingsView: View {
    internal let snapshot: TripSnapshot
    @Environment(\.timeZone) private var zone

    internal var body: some View {
        let groups = tripBookingGroups(snapshot)
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.xl) {
                header(groups: groups)
                if groups.isEmpty {
                    ContentUnavailableView(
                        "No bookings yet", systemImage: "ticket",
                        description: Text("Add a flight, stay or plan to keep it close."))
                } else {
                    ForEach(groups) { group in groupCard(group) }
                }
            }
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.top, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.xxl)
        }
        .background(Color.popsBackground)
    }

    private func header(groups: [TripsBookingGroup]) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            Text("Everything arranged").font(.popsLargeTitle)
                .foregroundStyle(Color.popsForeground)
            Text("Flights, stays and plans for \(tripName(snapshot.trip))")
                .font(.popsSubheadline).foregroundStyle(Color.popsMutedForeground)
            HStack(spacing: PopsSpacing.sm) {
                ForEach(groups) { group in
                    Label("\(group.sources.count)", systemImage: group.kind.symbol)
                        .font(.popsCaption).foregroundStyle(accent(group.kind))
                        .padding(.horizontal, PopsSpacing.md)
                        .padding(.vertical, PopsSpacing.sm)
                        .background(accent(group.kind).opacity(0.12), in: Capsule())
                }
            }
            .padding(.top, PopsSpacing.xs)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func groupCard(_ group: TripsBookingGroup) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            HStack(spacing: PopsSpacing.sm) {
                Image(systemName: group.kind.symbol)
                    .foregroundStyle(accent(group.kind))
                Text(group.kind.title).font(.popsTitle)
                Spacer()
                Text("\(group.sources.count)").font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            VStack(spacing: PopsSpacing.zero) {
                ForEach(Array(group.sources.enumerated()), id: \.element.id) { index, source in
                    TripsBookingRow(source: source, snapshot: snapshot, zone: zone)
                    if index < group.sources.count - 1 {
                        Rectangle().fill(Color.popsSeparator).frame(height: PopsBorder.hairline)
                            .padding(.leading, PopsSize.touchTarget + PopsSpacing.md)
                    }
                }
            }
            .background(Color.popsSurface, in: RoundedRectangle(cornerRadius: PopsRadius.card))
            .overlay {
                RoundedRectangle(cornerRadius: PopsRadius.card)
                    .stroke(Color.popsSeparator, lineWidth: PopsBorder.hairline)
            }
        }
    }

    private func accent(_ kind: TripsBookingGroup.Kind) -> Color {
        switch kind {
        case .transport: .popsAccent
        case .stays: .popsSuccess
        case .plans: .popsPurchases
        }
    }
}

private struct TripsBookingRow: View {
    let source: TripSource
    let snapshot: TripSnapshot
    let zone: TimeZone

    private var accent: Color {
        switch source {
        case .journey: .popsAccent
        case .stay: .popsSuccess
        case .event: .popsPurchases
        }
    }

    var body: some View {
        NavigationLink {
            TripsSourceView(source: source, places: snapshot.places)
        } label: {
            HStack(alignment: .top, spacing: PopsSpacing.md) {
                Image(systemName: source.symbol)
                    .foregroundStyle(accent)
                    .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
                    .background(accent.opacity(0.12), in: Circle())
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text(source.displayName(places: snapshot.places)).font(.popsHeadline)
                        .foregroundStyle(Color.popsForeground)
                    if case .journey = source,
                        !source.routeLabel(places: snapshot.places).isEmpty,
                        source.displayName(places: snapshot.places)
                            != source.routeLabel(places: snapshot.places)
                    {
                        Text(source.routeLabel(places: snapshot.places)).font(.popsSubheadline)
                            .foregroundStyle(Color.popsMutedForeground)
                    }
                    Text(schedule).font(.popsCaption).foregroundStyle(Color.popsMutedForeground)
                    if let status = source.status {
                        Label(
                            status,
                            systemImage: status == "Purchased" ? "checkmark.circle.fill" : "circle"
                        )
                        .font(.popsCaption)
                        .foregroundStyle(
                            status == "Purchased" ? Color.popsSuccess : Color.popsMutedForeground)
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
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
    }

    private var schedule: String {
        let days = source.days.map(TripClock.dayLabel)
        if !days.isEmpty { return days.joined(separator: " – ") }
        guard let start = source.start else { return "Date not set" }
        return
            "\(TripClock.dateLabel(start, zone: zone)) · \(TripClock.clockLabel(start, zone: zone))"
    }
}
