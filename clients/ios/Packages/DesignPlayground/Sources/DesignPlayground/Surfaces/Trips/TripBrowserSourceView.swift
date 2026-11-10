import DesignSystem
import SwiftUI

/// A booking opens its original identity and its explicitly associated people and document records.
internal struct TripBrowserSourceLink: View {
    internal let source: TripsTodaySource
    internal let trip: TripsBrowserTrip

    internal var body: some View {
        NavigationLink {
            TripBrowserSourceView(source: source, trip: trip)
        } label: {
            TripBrowserSourceSummary(source: source, displayZone: trip.today.displayZone)
        }
    }
}

/// Compact booking metadata separates the source type from the commitment status.
internal struct TripBrowserSourceSummary: View {
    internal let source: TripsTodaySource
    internal let displayZone: String

    internal var body: some View {
        HStack(alignment: .top, spacing: PopsSpacing.md) {
            Image(systemName: symbol).foregroundStyle(Color.popsAccent).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                Text(source.name).font(.popsHeadline)
                TripBrowserSourceTiming(source: source, displayZone: displayZone)
                if source.purchased {
                    Text("Purchased").font(.popsCaption).foregroundStyle(Color.popsSuccess)
                } else if case .event(let event) = source, let agreement = event.agreement {
                    Text(agreement).font(.popsCaption).foregroundStyle(Color.popsMutedForeground)
                }
                if let reference = source.essentials.reference {
                    Text(reference).font(.popsMonospacedCaption)
                }
            }
        }
        .foregroundStyle(Color.popsForeground)
        .frame(minHeight: PopsSize.touchTarget, alignment: .leading)
    }

    private var symbol: String {
        switch source.kind {
        case .stay: "bed.double.fill"
        case .journey: "arrow.triangle.branch"
        case .event: "calendar"
        }
    }
}

/// Source details retain recorded facts without claiming a file is available on the device.
internal struct TripBrowserSourceView: View {
    internal let source: TripsTodaySource
    internal let trip: TripsBrowserTrip

    internal var body: some View {
        List {
            if source.purchased {
                Label("Purchased", systemImage: "checkmark.seal.fill")
                    .foregroundStyle(Color.popsSuccess)
            }
            schedule
            TripTodayEssentialsView(essentials: remainingEssentials)
            if !contacts.isEmpty {
                Section("People") {
                    ForEach(contacts) { contact in
                        NavigationLink(contact.name) {
                            TripBrowserContactView(contact: contact, trip: trip)
                        }
                    }
                }
            }
            if !documents.isEmpty {
                Section("Documents") {
                    ForEach(documents) { document in
                        TripBrowserDocumentLink(document: document, trip: trip)
                        if let original = source.essentials.documents.first(where: {
                            $0.id == document.id
                        }) {
                            Text("Source: \(original.availability.rawValue)").font(.popsCaption)
                                .foregroundStyle(Color.popsMutedForeground)
                        }
                    }
                }
            }
        }
        .navigationTitle(source.name)
        .playgroundTitleDisplay(large: false)
    }

    private var contacts: [TripsBrowserContact] {
        trip.contacts.filter { $0.sourceIDs.contains(source.id) }
    }

    private var documents: [TripsBrowserDocument] {
        trip.documents.filter { $0.sourceIDs.contains(source.id) }
    }

    private var remainingEssentials: TripsTodayEssentials {
        let linkedIDs = Set(documents.map(\.id))
        var essentials = source.essentials
        essentials.documents.removeAll { linkedIDs.contains($0.id) }
        return essentials
    }

    @ViewBuilder private var schedule: some View {
        switch source {
        case .stay(let stay):
            Section("Stay") {
                time("From", stay.from)
                time("Until", stay.to)
            }
        case .journey(let journey):
            ForEach(journey.legs) { leg in
                Section(leg.name) {
                    time("Departure", leg.departure)
                    time("Arrival", leg.arrival)
                }
            }
        case .event(let event):
            Section("Event") {
                if let agreement = event.agreement { Text(agreement) }
                time("Starts", event.start)
                time("Ends", event.end)
                if let day = event.day { Text(tripsTodayDayLabel(day) ?? day) }
            }
        }
    }

    private func time(_ title: String, _ clock: TripsTodayClock?) -> some View {
        TripTodayTimeView(title: title, clock: clock, displayZone: trip.today.displayZone)
    }
}
