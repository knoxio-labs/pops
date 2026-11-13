import AppCore
import DesignSystem
import FeatureEgo
import FeatureTrips
import SwiftUI

internal struct TripsContentView: View {
    internal let surface: FeatureSurface
    internal let composition: AppComposition

    @State private var isEgoPresented = false

    internal var body: some View {
        content
            .safeAreaInset(edge: .top) {
                ConnectionBanner(phase: surface.bootstrap)
            }
            .safeAreaInset(edge: .bottom, spacing: PopsSpacing.zero) {
                EgoEntryView(
                    isAvailable: surface.available.contains(FeatureEgo.feature),
                    onOpen: { isEgoPresented = true }
                )
            }
            .sheet(isPresented: $isEgoPresented) {
                EgoSheetView(
                    dependencies: dependencies,
                    context: { composition.egoContext },
                    presentation: composition.entityPresentation,
                    entityRouter: composition.entityRouter,
                    onClose: { isEgoPresented = false }
                )
            }
            .environment(
                \.startRePairing,
                RePairingAction { composition.session.send(.revoked(.credentialsRejected)) }
            )
    }

    @ViewBuilder private var content: some View {
        if case .paired(let device) = composition.session.state {
            TripsRootView(
                repository: composition.tripsRepository(for: device),
                documents: composition.documentsRepository(for: device),
                captureWriter: composition.tripCaptureRepository(for: device),
                captureStore: composition.tripCaptureDraftStore(for: device)
            )
            .id(device)
        } else {
            TripsPlaceholderView()
        }
    }

    private var dependencies: AppDependencies {
        guard case .paired(let device) = composition.session.state else {
            return composition.pairingDependencies
        }
        return composition.dependencies(for: device)
    }
}

internal struct TripsPlaceholderView: View {
    internal var body: some View {
        Text(TripsCopy.title)
            .font(.popsTitle)
            .foregroundStyle(Color.popsMutedForeground)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.popsBackground)
            .accessibilityIdentifier("trips-placeholder")
    }
}

internal enum TripsCopy {
    private static let localized = LocalizedCopy(bundle: .main)

    internal static var title: String { localized("Trips") }
}
