import AppCore
import DesignSystem
import SwiftUI

internal struct TripsSelectionView: View {
    internal let model: TripsModel

    internal var body: some View {
        if model.trips.isEmpty {
            ContentUnavailableView("No Trips", systemImage: "map")
        } else {
            List {
                if model.selectedID != nil {
                    Label("Selected trip is unavailable", systemImage: "exclamationmark.triangle")
                        .foregroundStyle(Color.popsWarning).font(.popsSubheadline)
                }
                ForEach(model.trips) { trip in
                    Button {
                        Task { await model.select(trip.id) }
                    } label: {
                        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                            Text(tripName(trip)).font(.popsHeadline)
                            if !trip.when.isEmpty {
                                Text(trip.when).font(.popsCaption).foregroundStyle(
                                    Color.popsMutedForeground)
                            }
                        }
                        .frame(minHeight: PopsSize.touchTarget, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

internal struct TripsFailureView: View {
    internal let failure: RepositoryError
    internal let retry: () -> Void

    internal var body: some View {
        if !Self.canRetry(failure) {
            NonRetryableErrorStateView(message: message)
        } else {
            ErrorStateView(message: message, retryTitle: "Try Again", retry: retry)
        }
    }

    internal static func canRetry(_ failure: RepositoryError) -> Bool {
        switch failure {
        case .dependencyNotBound, .contractMismatch, .requestRejected, .featureUnavailable,
            .unauthorized:
            false
        default: true
        }
    }

    private var message: String {
        switch failure {
        case .featureUnavailable: "This device does not have access to Trips."
        case .unauthorized: "Your session has ended."
        case .dependencyNotBound: "Trips is not connected in this app."
        case .contractMismatch, .requestRejected: "This app cannot read the trip service response."
        case .conflict(let reason) where reason == TripsReadPolicy.sourceChangedReason:
            "Trip sources changed while loading. Try again."
        default: "Trips could not be loaded."
        }
    }
}
