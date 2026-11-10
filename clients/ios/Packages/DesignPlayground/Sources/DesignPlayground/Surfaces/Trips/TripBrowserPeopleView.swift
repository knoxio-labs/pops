import DesignSystem
import SwiftUI

/// One alphabetical directory mixes contact types while retaining each original identity.
internal struct TripBrowserPeopleView: View {
    internal let trip: TripsBrowserTrip
    @Environment(\.dismiss) private var dismiss

    internal var body: some View {
        NavigationStack {
            List {
                ForEach(tripBrowserSortedContacts(trip.contacts)) { contact in
                    NavigationLink {
                        TripBrowserContactView(contact: contact, trip: trip)
                    } label: {
                        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                            Text(contact.name).font(.popsHeadline)
                            if let method = contact.methods.first {
                                Text(method.value).font(.popsSubheadline)
                                    .foregroundStyle(Color.popsMutedForeground)
                            }
                        }
                        .frame(minHeight: PopsSize.touchTarget, alignment: .leading)
                    }
                }
                if trip.contacts.isEmpty { Text("No Recorded Contacts") }
            }
            .navigationTitle("People")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close", systemImage: "xmark") { dismiss() }.labelStyle(.iconOnly)
                }
            }
        }
    }
}

/// Contact facts put the actual value first; method labels remain subordinate to it.
internal struct TripBrowserContactView: View {
    internal let contact: TripsBrowserContact
    internal let trip: TripsBrowserTrip

    internal var body: some View {
        List {
            Section {
                ForEach(contact.methods) { fact in factView(fact) }
            }
            if !contact.addresses.isEmpty {
                Section("Addresses") {
                    ForEach(contact.addresses) { fact in factView(fact) }
                }
            }
            if !contact.notes.isEmpty {
                Section("Notes") { Text(contact.notes).font(.popsBody) }
            }
            if !contact.sourceIDs.isEmpty {
                Section("Plans") {
                    ForEach(contact.sourceIDs, id: \.self) { id in
                        if let source = tripsTodaySource(trip.today, id: id) {
                            TripBrowserSourceLink(source: source, trip: trip)
                        }
                    }
                }
            }
        }
        .navigationTitle(contact.name)
        .playgroundTitleDisplay(large: true)
    }

    private func factView(_ fact: TripsBrowserContactFact) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text(fact.value).font(.popsBody).textSelection(.enabled)
            Text(fact.label).font(.popsCaption).foregroundStyle(Color.popsMutedForeground)
        }
        .frame(minHeight: PopsSize.touchTarget, alignment: .leading)
    }
}

/// Equal display names retain distinct identities and a deterministic order.
internal func tripBrowserSortedContacts(_ contacts: [TripsBrowserContact]) -> [TripsBrowserContact]
{
    contacts.sorted { left, right in
        let comparison = left.name.localizedCaseInsensitiveCompare(right.name)
        return comparison == .orderedSame ? left.id < right.id : comparison == .orderedAscending
    }
}
