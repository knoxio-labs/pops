import DesignSystem
import SwiftUI

/// Plan keeps authoritative route order alongside a separately selected calendar chronology.
internal struct TripBrowserPlanView: View {
    internal let trip: TripsBrowserTrip
    @Binding internal var calendar: Bool

    internal var body: some View {
        VStack(spacing: PopsSpacing.zero) {
            Picker("Plan", selection: $calendar) {
                Text("Route").tag(false)
                Text("Calendar").tag(true)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.vertical, PopsSpacing.sm)
            if calendar {
                TripBrowserCalendarView(trip: trip).id(trip.id)
            } else {
                List {
                    ForEach(tripsBrowserRouteRows(trip)) { row in
                        if case .gap = row.entry {
                            TripBrowserRouteLabel(row: row)
                        } else if row.missingReference && row.sourceIDs.isEmpty {
                            TripBrowserRouteLabel(row: row)
                        } else {
                            NavigationLink {
                                TripBrowserRouteDetail(row: row, trip: trip)
                            } label: {
                                TripBrowserRouteLabel(row: row)
                            }
                        }
                    }
                    if !trip.ideas.isEmpty {
                        Section("Saved Ideas") {
                            ForEach(trip.ideas) { idea in
                                NavigationLink(idea.title) {
                                    TripBrowserIdeaView(idea: idea, trip: trip)
                                }
                            }
                        }
                    }
                    ForEach(tripsBrowserFindings(trip)) { finding in
                        Label(finding.message, systemImage: "exclamationmark.triangle")
                            .font(.popsSubheadline).foregroundStyle(Color.popsWarning)
                    }
                    if trip.route.isEmpty { Text("No Recorded Route") }
                }
            }
        }
    }
}

/// The route rail distinguishes visits, movement and unresolved transport without changing sequence.
internal struct TripBrowserRouteLabel: View {
    internal let row: TripsBrowserRouteRow

    internal var body: some View {
        HStack(alignment: .top, spacing: PopsSpacing.md) {
            VStack(spacing: PopsSpacing.xs) {
                Image(systemName: symbol).foregroundStyle(Color.popsAccent)
                Rectangle().fill(Color.popsSeparator)
                    .frame(width: PopsBorder.hairline)
            }
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(row.title).font(row.visit == nil ? .popsBody : .popsHeadline)
                if !row.detail.isEmpty {
                    Text(row.detail).font(.popsCaption).foregroundStyle(Color.popsMutedForeground)
                }
                if row.missingReference {
                    Label("Missing Source", systemImage: "exclamationmark.triangle")
                        .font(.popsCaption).foregroundStyle(Color.popsWarning)
                }
                if let source = row.source, source.purchased {
                    Text("Purchased").font(.popsCaption).foregroundStyle(Color.popsSuccess)
                }
            }
        }
        .frame(minHeight: PopsSize.touchTarget, alignment: .leading)
    }

    private var symbol: String {
        switch row.entry {
        case .visit: "mappin.circle.fill"
        case .transport: "arrow.down"
        case .gap: "questionmark.circle"
        case .alternative: "arrow.triangle.branch"
        }
    }
}

/// Visit context links only explicitly associated source records, contacts and document metadata.
internal struct TripBrowserRouteDetail: View {
    internal let row: TripsBrowserRouteRow
    internal let trip: TripsBrowserTrip

    internal var body: some View {
        List {
            if !row.detail.isEmpty { Section { Text(row.detail) } }
            if !row.sourceIDs.isEmpty {
                Section("Bookings") {
                    ForEach(row.sourceIDs, id: \.self) { id in
                        if let source = tripsTodaySource(trip.today, id: id) {
                            TripBrowserSourceLink(source: source, trip: trip)
                        } else {
                            Label("Missing Source · \(id)", systemImage: "exclamationmark.triangle")
                        }
                    }
                }
            }
            let contacts = trip.contacts.filter { row.contactIDs.contains($0.id) }
            if !contacts.isEmpty {
                Section("People") {
                    ForEach(contacts) { contact in
                        NavigationLink(contact.name) {
                            TripBrowserContactView(contact: contact, trip: trip)
                        }
                    }
                }
            }
            if let visit = row.visit {
                let documents = trip.documents.filter { $0.visitIDs.contains(visit.id) }
                if !documents.isEmpty {
                    Section("Documents") {
                        ForEach(documents) { document in
                            TripBrowserDocumentLink(document: document, trip: trip)
                        }
                    }
                }
                let ideas = trip.ideas.filter { $0.placeID == visit.placeID }
                if !ideas.isEmpty {
                    Section("Saved Ideas") {
                        ForEach(ideas) { idea in
                            NavigationLink(idea.title) {
                                TripBrowserIdeaView(idea: idea, trip: trip)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle(row.title)
        .playgroundTitleDisplay(large: false)
    }
}

/// Saved ideas stay separate from agreed or purchased arrangements.
internal struct TripBrowserIdeaView: View {
    internal let idea: TripsBrowserIdea
    internal let trip: TripsBrowserTrip

    internal var body: some View {
        List {
            if let place = trip.places.first(where: { $0.id == idea.placeID }) {
                Label(place.name, systemImage: "mappin")
            }
            if !idea.notes.isEmpty { Text(idea.notes) }
        }
        .navigationTitle(idea.title)
        .playgroundTitleDisplay(large: false)
    }
}
