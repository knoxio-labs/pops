import DesignSystem
import SwiftUI

/// Document grouping follows explicit trip and visit associations, preserving route context.
internal struct TripBrowserDocumentsView: View {
    internal let trip: TripsBrowserTrip

    internal var body: some View {
        List {
            let wholeTrip = trip.documents.filter { $0.visitIDs.isEmpty && $0.sourceIDs.isEmpty }
            if !wholeTrip.isEmpty { Section("Trip Documents") { documents(wholeTrip) } }
            ForEach(tripsBrowserRouteRows(trip)) { row in
                let linked = trip.documents.filter { belongs($0, to: row) }
                if !linked.isEmpty {
                    Section(row.title) { documents(linked) }
                }
            }
            let rows = tripsBrowserRouteRows(trip)
            let unlinked = trip.documents.filter { document in
                (!document.visitIDs.isEmpty || !document.sourceIDs.isEmpty)
                    && !rows.contains { belongs(document, to: $0) }
            }
            if !unlinked.isEmpty { Section("Other Documents") { documents(unlinked) } }
            if trip.documents.isEmpty { Text("No Recorded Documents") }
        }
    }

    private func belongs(_ document: TripsBrowserDocument, to row: TripsBrowserRouteRow) -> Bool {
        let visitMatch = row.visit.map { document.visitIDs.contains($0.id) } ?? false
        return visitMatch || !Set(document.sourceIDs).isDisjoint(with: row.sourceIDs)
    }

    private func documents(_ documents: [TripsBrowserDocument]) -> some View {
        ForEach(documents) { document in
            TripBrowserDocumentLink(document: document, trip: trip)
        }
    }
}

/// A file row exposes supplied metadata and opens a metadata detail, never a simulated download.
internal struct TripBrowserDocumentLink: View {
    internal let document: TripsBrowserDocument
    internal let trip: TripsBrowserTrip

    internal var body: some View {
        NavigationLink {
            TripBrowserDocumentView(document: document, trip: trip)
        } label: {
            HStack(alignment: .top, spacing: PopsSpacing.md) {
                Image(systemName: "doc.text.fill").foregroundStyle(Color.popsAccent)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                    Text(document.title).font(.popsHeadline)
                    Text(document.fileName).font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                }
            }
            .frame(minHeight: PopsSize.touchTarget, alignment: .leading)
        }
    }
}

/// The document's original metadata and linked bookings remain navigable independently of file access.
internal struct TripBrowserDocumentView: View {
    internal let document: TripsBrowserDocument
    internal let trip: TripsBrowserTrip

    internal var body: some View {
        List {
            Section("File") {
                Text(document.fileName).font(.popsBody).textSelection(.enabled)
                Text(document.mimeType).font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            if !document.notes.isEmpty {
                Section("Notes") { Text(document.notes) }
            }
            if !document.sourceIDs.isEmpty {
                Section("Bookings") {
                    ForEach(document.sourceIDs, id: \.self) { id in
                        if let source = tripsTodaySource(trip.today, id: id) {
                            TripBrowserSourceLink(source: source, trip: trip)
                        } else {
                            Label("Missing Source · \(id)", systemImage: "exclamationmark.triangle")
                        }
                    }
                }
            }
        }
        .navigationTitle(document.title)
        .playgroundTitleDisplay(large: false)
    }
}
