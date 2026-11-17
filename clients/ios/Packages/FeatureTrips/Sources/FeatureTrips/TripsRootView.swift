import AppCore
import DesignSystem
import SwiftUI

/// Native Today, Plan, Inbox and Search destinations sharing one explicit Trip selection.
/// Documents stay available as a trip shortcut, and capture writes retain their operation identities.
public struct TripsRootView: View {
    @State private var model: TripsModel
    private let documents: any DocumentsReading
    private let placePinWriter: (any TripPlacePinWriting)?
    @State private var captureDrafts: TripCaptureDrafts?

    /// Creates the feature with authenticated readers and explicitly authorized capture and place-pin writes.
    /// Omitting the writer keeps capture read-only. The app supplies an owner-bound durable store;
    /// omitting storage retains only in-memory drafts for injected previews and host tests.
    /// Optional selection retention restores only an earlier explicit selection, never the first Trip by default.
    /// Route, capture and detail readers complete independently and do not promise an atomic snapshot.
    /// Omitting a reader presents its destination as unbound, never as a successful empty read.
    /// Omitting the pin writer keeps the Map lens read-only.
    public init(
        repository: any TripsReading, documents: any DocumentsReading,
        captureWriter: (any TripCapturesWriting)? = nil,
        placePinWriter: (any TripPlacePinWriting)? = nil,
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
            placePinWriter: placePinWriter,
            captureDrafts: captureWriter.map {
                TripCaptureDrafts(writer: $0, storage: captureStore) { [weak model] tripID in
                    model?.captureAccepted(tripID: tripID)
                }
            })
    }

    internal init(
        model: TripsModel, documents: any DocumentsReading,
        placePinWriter: (any TripPlacePinWriting)? = nil,
        captureDrafts: TripCaptureDrafts? = nil
    ) {
        self.documents = documents
        self.placePinWriter = placePinWriter
        _model = State(initialValue: model)
        _captureDrafts = State(initialValue: captureDrafts)
    }

    public var body: some View {
        TabView(selection: $model.tab) {
            Tab("Today", systemImage: "sun.max", value: TripsTab.today) {
                stack(.today)
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
            model: model, tab: tab, documents: documents, placePinWriter: placePinWriter,
            capture: captureAction)
    }

    private var captureAction: (() -> Void)? {
        guard let id = model.selectedID, let captureDrafts else { return nil }
        return { model.capture = captureDrafts.draft(tripID: id) }
    }
}

internal enum TripsTab: Hashable { case today, plan, inbox, search }
