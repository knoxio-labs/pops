import DesignSystem
import SwiftUI

/// A local navigation rehearsal whose trip selection is shared by every native tab.
internal struct TripBrowserView: View {
    @State private var state: TripsBrowserState
    @State private var tab: TripBrowserTab
    @State private var calendar: Bool
    @State private var people = false

    internal init(
        state: TripsBrowserState, tab: TripBrowserTab = .today, calendar: Bool = false
    ) {
        _state = State(initialValue: state)
        _tab = State(initialValue: tab)
        _calendar = State(initialValue: calendar)
    }

    internal var body: some View {
        TabView(selection: $tab) {
            Tab("Today", systemImage: "sun.max.fill", value: TripBrowserTab.today) {
                stack("Today") {
                    if let trip {
                        TripTodayView(state: tripsBrowserTodayState(trip), layout: .nextFirst)
                    }
                }
            }
            Tab("Plan", systemImage: "map.fill", value: TripBrowserTab.plan) {
                stack("Plan") {
                    if let trip { TripBrowserPlanView(trip: trip, calendar: $calendar) }
                }
            }
            Tab("Bookings", systemImage: "ticket.fill", value: TripBrowserTab.bookings) {
                stack("Bookings") {
                    if let trip { TripBrowserBookingsView(trip: trip) }
                }
            }
            Tab("Documents", systemImage: "doc.fill", value: TripBrowserTab.documents) {
                stack("Documents") {
                    if let trip { TripBrowserDocumentsView(trip: trip) }
                }
            }
            Tab(value: TripBrowserTab.search, role: .search) {
                NavigationStack { TripBrowserSearchView(state: state) }
            }
        }
        .id(state.selectedTripID)
        .tint(Color.popsAccent)
        .sheet(isPresented: $people) {
            if let trip { TripBrowserPeopleView(trip: trip) }
        }
    }

    private var trip: TripsBrowserTrip? { tripsBrowserSelectedTrip(state) }

    private func stack<Content: View>(
        _ title: String, @ViewBuilder content: () -> Content
    ) -> some View {
        NavigationStack {
            Group {
                if trip == nil {
                    ContentUnavailableView("No Selected Trip", systemImage: "map")
                } else {
                    content()
                }
            }
            .navigationTitle(title)
            .playgroundTitleDisplay(large: true)
            .toolbar {
                ToolbarItem(placement: .principal) { tripMenu }
                ToolbarItemGroup(placement: .primaryAction) {
                    if tab == .today {
                        Button("Calendar", systemImage: "calendar") {
                            calendar = true
                            tab = .plan
                        }
                    }
                    Button("People", systemImage: "person.2") { people = true }
                        .disabled(trip == nil)
                }
            }
        }
    }

    private var tripMenu: some View {
        Menu {
            ForEach(TripsBrowserPeriod.allCases, id: \.self) { period in
                Section(period.title) {
                    ForEach(state.trips.filter { tripsBrowserPeriod($0) == period }) { trip in
                        Button {
                            state.selectedTripID = trip.id
                            if tripsBrowserPeriod(trip) == .history { tab = .plan }
                        } label: {
                            if trip.id == state.selectedTripID {
                                Label(trip.name, systemImage: "checkmark")
                            } else {
                                Text(trip.name)
                            }
                            Text(trip.when)
                        }
                    }
                }
            }
        } label: {
            HStack(spacing: PopsSpacing.xs) {
                Text(trip?.name ?? "Choose Trip").font(.popsSubheadline).fontWeight(.semibold)
                Image(systemName: "chevron.down").font(.popsCaption)
            }
            .frame(minHeight: PopsSize.touchTarget)
        }
        .accessibilityLabel("Choose Trip")
    }
}

/// Native top-level destinations retain their own navigation stacks.
internal enum TripBrowserTab: Hashable {
    case today, plan, bookings, documents, search
}
