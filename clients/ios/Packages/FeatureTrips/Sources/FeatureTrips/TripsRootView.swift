import AppCore
import DesignSystem
import SwiftUI

/// Native Today, Plan, Inbox and Search destinations sharing one explicit Trip selection.
/// Documents open only after an authenticated download; capture writes retain their operation identities.
public struct TripsRootView: View {
    @State private var model: TripsModel
    private let documents: any DocumentsReading
    @State private var captureDrafts: TripCaptureDrafts?

    /// Creates the feature with authenticated readers and optional explicitly authorized capture writes.
    /// Omitting the writer keeps capture read-only. The app supplies an owner-bound durable store;
    /// omitting storage retains only in-memory drafts for injected previews and host tests.
    /// Optional selection retention restores only an earlier explicit selection, never the first Trip by default.
    /// Route, capture and detail readers complete independently and do not promise an atomic snapshot.
    /// Omitting a reader presents its destination as unbound, never as a successful empty read.
    public init(
        repository: any TripsReading, documents: any DocumentsReading,
        captureWriter: (any TripCapturesWriting)? = nil,
        captureStore: (any TripCaptureDraftStore)? = nil,
        selection: (any TripOfflineSelection)? = nil,
        routeReader: (any TripsRouteReading)? = nil,
        captureReader: (any TripCapturesReading)? = nil
    ) {
        let model = TripsModel(
            repository: repository, selection: selection, routeReader: routeReader,
            captureReader: captureReader)
        self.init(
            model: model,
            documents: documents,
            captureDrafts: captureWriter.map {
                TripCaptureDrafts(writer: $0, storage: captureStore) { [weak model] tripID in
                    model?.captureAccepted(tripID: tripID)
                }
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
            Tab("Today", systemImage: "sun.max", value: TripsTab.trips) {
                stack(.trips)
            }
            Tab("Plan", systemImage: "map", value: TripsTab.plan) {
                stack(.plan)
            }
            Tab("Inbox", systemImage: "tray", value: TripsTab.inbox) {
                stack(.inbox)
            }
            Tab(
                "Search", systemImage: "magnifyingglass", value: TripsTab.search,
                role: searchTabRole
            ) {
                NavigationStack {
                    TripsSearchView(
                        trips: model.trips, snapshot: model.snapshot, query: $model.searchQuery,
                        dismissSearch: model.dismissSearch
                    ) { id in
                        model.openTrip(id)
                    } openSource: { source in
                        model.openTrip(source.tripID, sourceID: source.id)
                    }
                }
            }
        }
        .tint(Color.popsTrips)
        .task { await model.load() }
        .sheet(item: $model.capture) { draft in
            TripCaptureComposer(draft: draft)
        }
    }

    private var searchTabRole: TabRole {
        if #available(iOS 27.0, macOS 27.0, *) {
            .prominent
        } else {
            .search
        }
    }

    private func stack(_ tab: TripsTab) -> some View {
        TripsSelectedTripStack(
            model: model, tab: tab, documents: documents,
            capture: captureAction)
    }

    private var captureAction: (() -> Void)? {
        guard let id = model.selectedID, let captureDrafts else { return nil }
        return { model.capture = captureDrafts.draft(tripID: id) }
    }
}

internal enum TripsTab: Hashable { case trips, plan, inbox, search }
