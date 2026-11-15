import AppCore
import DesignSystem
import SwiftUI

internal struct TripsSelectedTripStack: View {
    @Bindable internal var model: TripsModel
    internal let tab: TripsTab
    internal let documents: any DocumentsReading
    internal let capture: (() -> Void)?

    internal var body: some View {
        NavigationStack {
            Group {
                if model.selectedID != nil {
                    TripsWorkspaceView(model: model, tab: tab, capture: capture)
                } else if model.loading {
                    LoadingStateView()
                } else if let failure = model.failure {
                    TripsFailureView(failure: failure) { Task { await model.load() } }
                } else {
                    TripsSelectionView(model: model)
                }
            }
            .navigationTitle(selectedTrip.map(tripName) ?? "Trips")
            .popsTitleDisplay(large: selectedTrip == nil)
            .toolbar {
                ToolbarItem(placement: .principal) { tripMenu }
                ToolbarItem(placement: .primaryAction) {
                    if let capture {
                        Button("Capture", systemImage: "plus", action: capture)
                    }
                }
                ToolbarItem(placement: .primaryAction) {
                    if let snapshot = model.snapshot {
                        TripsDocumentShortcut(snapshot: snapshot, repository: documents)
                    }
                }
            }
            .navigationDestination(item: sourceSelection) { source in
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

    internal var sourceSelection: Binding<TripSource?> {
        let epoch = model.sourceEpoch
        let selectedID = model.selectedID
        return Binding(
            get: {
                model.tab == tab && model.selectedID == selectedID && model.sourceEpoch == epoch
                    ? model.source : nil
            },
            set: {
                if model.tab == tab && model.selectedID == selectedID && model.sourceEpoch == epoch
                {
                    model.source = $0
                }
            })
    }

    private var selectedTrip: TripRecord? {
        model.snapshot?.trip ?? model.trips.first { $0.id == model.selectedID }
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
            HStack(spacing: PopsSpacing.xs) {
                Text(selectedTrip.map(tripName) ?? "Choose Trip")
                    .lineLimit(1)
                Image(systemName: "chevron.down")
                    .font(.popsCaption)
                    .accessibilityHidden(true)
            }
            .font(.popsSubheadline)
            .frame(minHeight: PopsSize.touchTarget)
        }
        .accessibilityLabel("Choose Trip")
        .accessibilityValue(selectedTrip.map(tripName) ?? "No selected Trip")
    }
}
