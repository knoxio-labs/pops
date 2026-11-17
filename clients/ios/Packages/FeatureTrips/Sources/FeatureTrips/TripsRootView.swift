import AppCore
import DesignSystem
import SwiftUI

/// A selected-Trip workspace with Today, Plan, Bookings, Documents and native Search tabs.
/// Optional device-authorized capture writes retain their own operation identities; documents open only after
/// an authenticated download.
public struct TripsRootView: View {
    @State private var model: TripsModel
    private let documents: any DocumentsReading
    @State private var captureDrafts: TripCaptureDrafts?

    /// Creates the feature with authenticated readers and optional explicitly authorized capture writes.
    /// Omitting the writer keeps source browsing read-only. The app supplies an owner-bound durable store;
    /// omitting storage retains only in-memory drafts for injected previews and host tests.
    /// Optional selection retention restores only an earlier explicit selection, never the first Trip by default.
    public init(
        repository: any TripsReading, documents: any DocumentsReading,
        captureWriter: (any TripCapturesWriting)? = nil,
        captureStore: (any TripCaptureDraftStore)? = nil,
        selection: (any TripOfflineSelection)? = nil
    ) {
        self.init(
            model: TripsModel(repository: repository, selection: selection), documents: documents,
            captureDrafts: captureWriter.map {
                TripCaptureDrafts(writer: $0, storage: captureStore)
            })
    }

    internal init(
        model: TripsModel, documents: any DocumentsReading, captureDrafts: TripCaptureDrafts? = nil
    ) {
        self.documents = documents
        _model = State(initialValue: model)
        _captureDrafts = State(initialValue: captureDrafts)
    }

    public var body: some View {
        TabView(selection: $model.tab) {
            Tab("Today", systemImage: "sun.max.fill", value: TripsTab.today) {
                workspace(.today)
            }
            Tab("Plan", systemImage: "map", value: TripsTab.plan) {
                workspace(.plan)
            }
            Tab("Bookings", systemImage: "ticket", value: TripsTab.bookings) {
                workspace(.bookings)
            }
            Tab("Documents", systemImage: "doc.text", value: TripsTab.documents) {
                workspace(.documents)
            }
            Tab(value: TripsTab.search, role: .search) {
                NavigationStack {
                    TripsSearchView(trips: model.trips, snapshot: model.snapshot) { id in
                        openTrip(id)
                    } openSource: { source in
                        openTrip(source.tripID, sourceID: source.id)
                    }
                }
            }
        }
        .tint(Color.popsAccent)
        .task { await model.load() }
        .sheet(item: $model.capture) { draft in
            TripCaptureComposer(draft: draft)
        }
    }

    private func workspace(_ tab: TripsTab) -> some View {
        NavigationStack {
            Group {
                if model.loading {
                    LoadingStateView()
                } else if let failure = model.failure {
                    TripsFailureView(failure: failure) { Task { await model.load() } }
                } else if let snapshot = model.snapshot {
                    destination(tab, snapshot: snapshot)
                } else {
                    TripsSelectionView(model: model)
                }
            }
            .navigationTitle(model.snapshot == nil ? "Trips" : tab.title)
            .popsTitleDisplay(large: tab == .today)
            .toolbar {
                ToolbarItem(placement: .principal) { tripMenu }
                ToolbarItem(placement: .primaryAction) {
                    if let id = model.snapshot?.trip.id, let captureDrafts {
                        Button("Capture", systemImage: "plus") {
                            model.capture = captureDrafts.draft(tripID: id)
                        }
                    }
                }
            }
            .navigationDestination(item: $model.source) { source in
                if let current = model.canonicalSource(source), let snapshot = model.snapshot {
                    TripsSourceView(source: current, places: snapshot.places)
                } else {
                    ContentUnavailableView(
                        "Recorded source unavailable", systemImage: "exclamationmark.triangle")
                }
            }
            .refreshable { await model.load() }
        }
        .id("\(model.selectedID ?? -1)-\(tab.rawValue)")
    }

    @ViewBuilder private func destination(_ tab: TripsTab, snapshot: TripSnapshot) -> some View {
        switch tab {
        case .today:
            TripsTodayView(snapshot: snapshot)
        case .plan:
            TripsTimelineView(snapshot: snapshot)
        case .bookings:
            TripsBookingsView(snapshot: snapshot)
        case .documents:
            TripsDocumentsView(snapshot: snapshot, repository: documents)
        case .search:
            TripsTimelineView(snapshot: snapshot)
        }
    }

    private func openTrip(_ id: Int, sourceID: String? = nil) {
        model.openTrip(id, sourceID: sourceID)
    }

    private var tripMenu: some View {
        Menu {
            ForEach(model.trips) { trip in
                Button {
                    openTrip(trip.id)
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

internal enum TripsTab: String, Hashable {
    case today
    case plan
    case bookings
    case documents
    case search

    internal var title: String {
        switch self {
        case .today: "Today"
        case .plan: "Plan"
        case .bookings: "Bookings"
        case .documents: "Documents"
        case .search: "Search"
        }
    }
}
