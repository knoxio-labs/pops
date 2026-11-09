import AppCore
import DesignSystem
import SwiftUI

/// Approved native Trips navigation backed only by injected source reads; it performs no writes or offline downloads.
public struct TripsRootView: View {
    @State private var model: TripsModel
    @State private var tab = TripsTab.today
    @State private var calendar = false
    @State private var people = false

    /// Creates the feature with an authenticated repository supplied by the app's composition root.
    public init(repository: any TripsReading) {
        _model = State(initialValue: TripsModel(repository: repository))
    }

    public var body: some View {
        TabView(selection: $tab) {
            Tab("Today", systemImage: "sun.max.fill", value: TripsTab.today) {
                stack("Today") { snapshot in
                    TripsTodayView(snapshot: snapshot)
                }
            }
            Tab("Plan", systemImage: "map.fill", value: TripsTab.plan) {
                stack("Plan") { snapshot in
                    TripsPlanView(snapshot: snapshot, calendar: $calendar)
                }
            }
            Tab("Bookings", systemImage: "ticket.fill", value: TripsTab.bookings) {
                stack("Bookings") { snapshot in TripsBookingsView(snapshot: snapshot) }
            }
            Tab("Documents", systemImage: "doc.fill", value: TripsTab.documents) {
                stack("Documents") { snapshot in TripsDocumentsView(snapshot: snapshot) }
            }
            Tab(value: TripsTab.search, role: .search) {
                NavigationStack {
                    TripsSearchView(trips: model.trips, snapshot: model.snapshot) { id in
                        Task { await model.select(id) }
                        tab = .plan
                    }
                }
            }
        }
        .tint(Color.popsAccent)
        .task { await model.load() }
        .sheet(isPresented: $people) {
            NavigationStack {
                ContentUnavailableView(
                    "People unavailable", systemImage: "person.2",
                    description: Text("The trip service does not provide linked people yet.")
                )
                .navigationTitle("People")
            }
        }
    }

    private func stack<Content: View>(
        _ title: String, @ViewBuilder content: @escaping (TripSnapshot) -> Content
    ) -> some View {
        NavigationStack {
            Group {
                if model.loading {
                    LoadingStateView()
                } else if let failure = model.failure {
                    TripsFailureView(failure: failure) { Task { await model.load() } }
                } else if let snapshot = model.snapshot {
                    content(snapshot)
                } else {
                    TripsSelectionView(model: model)
                }
            }
            .navigationTitle(title)
            .popsTitleDisplay(large: true)
            .toolbar {
                ToolbarItem(placement: .principal) { tripMenu }
                ToolbarItemGroup(placement: .primaryAction) {
                    if tab == .today {
                        Button("Calendar", systemImage: "calendar") {
                            calendar = true
                            tab = .plan
                        }
                        .frame(minHeight: PopsSize.touchTarget)
                    }
                    Button("People", systemImage: "person.2") { people = true }
                        .frame(minHeight: PopsSize.touchTarget).disabled(model.snapshot == nil)
                }
            }
            .refreshable { await model.load() }
        }
        .id(model.selectedID)
    }

    private var tripMenu: some View {
        Menu {
            ForEach(model.trips) { trip in
                Button {
                    Task { await model.select(trip.id) }
                } label: {
                    Text(tripName(trip))
                    if !trip.when.isEmpty { Text(trip.when) }
                }
            }
        } label: {
            Label(
                model.snapshot.map { tripName($0.trip) } ?? "Choose Trip",
                systemImage: "chevron.down"
            )
            .font(.popsSubheadline).frame(minHeight: PopsSize.touchTarget)
        }
        .accessibilityLabel("Choose Trip")
    }
}

internal enum TripsTab: Hashable { case today, plan, bookings, documents, search }
