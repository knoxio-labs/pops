import AppCore
import DesignSystem
import SwiftUI

/// One selected-Trip timeline and app-level search backed only by injected source reads.
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
            Tab("Trips", systemImage: "map.fill", value: TripsTab.trips) {
                stack
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
        .tint(Color.popsTrips)
        .task { await model.load() }
        .sheet(item: $model.capture) { draft in
            TripCaptureComposer(draft: draft)
        }
    }

    private var stack: some View {
        NavigationStack {
            Group {
                if model.loading {
                    LoadingStateView()
                } else if let failure = model.failure {
                    TripsFailureView(failure: failure) { Task { await model.load() } }
                } else if let snapshot = model.snapshot {
                    TripsTimelineView(snapshot: snapshot)
                } else {
                    TripsSelectionView(model: model)
                }
            }
            .navigationTitle(model.snapshot.map { tripName($0.trip) } ?? "Trips")
            .popsTitleDisplay(large: model.snapshot == nil)
            .toolbar {
                ToolbarItem(placement: .principal) { tripMenu }
                ToolbarItem(placement: .primaryAction) {
                    if let id = model.snapshot?.trip.id, let captureDrafts {
                        Button("Capture", systemImage: "plus") {
                            model.capture = captureDrafts.draft(tripID: id)
                        }
                    }
                }
                ToolbarItem(placement: .primaryAction) {
                    if let snapshot = model.snapshot {
                        TripsDocumentShortcut(snapshot: snapshot, repository: documents)
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
        .id(model.selectedID)
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
            HStack(spacing: PopsSpacing.xs) {
                Text(model.snapshot.map { tripName($0.trip) } ?? "Choose Trip")
                    .lineLimit(1)
                Image(systemName: "chevron.down")
                    .font(.popsCaption)
                    .accessibilityHidden(true)
            }
            .font(.popsSubheadline)
            .frame(minHeight: PopsSize.touchTarget)
        }
        .accessibilityLabel("Choose Trip")
        .accessibilityValue(model.snapshot.map { tripName($0.trip) } ?? "No selected Trip")
    }
}

internal enum TripsTab: Hashable { case trips, search }
