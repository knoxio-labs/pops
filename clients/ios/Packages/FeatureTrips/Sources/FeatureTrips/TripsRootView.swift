import AppCore
import DesignSystem
import SwiftUI

/// One selected-Trip timeline and app-level search backed only by injected source reads.
/// It performs no trip writes and opens files only after an actual authenticated download.
public struct TripsRootView: View {
    @State private var model: TripsModel
    @State private var tab = TripsTab.trips
    @State private var source: TripSource?
    private let documents: any DocumentsReading

    /// Creates the feature with authenticated trip and original-document readers from the composition root.
    public init(repository: any TripsReading, documents: any DocumentsReading) {
        self.init(model: TripsModel(repository: repository), documents: documents)
    }

    internal init(model: TripsModel, documents: any DocumentsReading) {
        self.documents = documents
        _model = State(initialValue: model)
    }

    public var body: some View {
        TabView(selection: $tab) {
            Tab("Trips", systemImage: "map.fill", value: TripsTab.trips) {
                stack
            }
            Tab(value: TripsTab.search, role: .search) {
                NavigationStack {
                    TripsSearchView(trips: model.trips, snapshot: model.snapshot) { id in
                        openTrip(id)
                    } openSource: { source in
                        guard let id = model.snapshot?.trip.id else { return }
                        openTrip(id, sourceID: source.id)
                    }
                }
            }
        }
        .tint(Color.popsAccent)
        .task { await model.load() }
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
            .navigationTitle(model.snapshot == nil ? "Trips" : "Timeline")
            .popsTitleDisplay(large: true)
            .toolbar {
                ToolbarItem(placement: .principal) { tripMenu }
                ToolbarItem(placement: .primaryAction) {
                    if let snapshot = model.snapshot {
                        TripsDocumentShortcut(snapshot: snapshot, repository: documents)
                    }
                }
            }
            .navigationDestination(item: $source) { source in
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
        source = nil
        tab = .trips
        Task {
            await model.select(id)
            if let sourceID, model.selectedID == id, let snapshot = model.snapshot,
                snapshot.trip.id == id
            {
                source = allTripSources(snapshot).first { $0.id == sourceID }
            }
        }
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

internal enum TripsTab: Hashable { case trips, search }
