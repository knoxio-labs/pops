import AppCore
import SwiftUI

/// The Purchases tab, including the navigation state for every screen it opens.
public struct PurchasesFlowView: View {
    @State private var path: [PurchasesScreenRoute] = []
    @State private var home: PurchasesHomeModel
    private let dependencies: AppDependencies
    private let captureAvailable: Bool
    private let captureObserver: (@MainActor (Bool) -> Void)?

    /// Creates the Purchases flow with its repositories and capture availability.
    public init(dependencies: AppDependencies, captureAvailable: Bool) {
        self.dependencies = dependencies
        self.captureAvailable = captureAvailable
        captureObserver = nil
        _home = State(initialValue: PurchasesHomeModel(dependencies: dependencies))
    }

    internal init(
        dependencies: AppDependencies,
        captureAvailable: Bool,
        captureObserver: @escaping @MainActor (Bool) -> Void
    ) {
        self.dependencies = dependencies
        self.captureAvailable = captureAvailable
        self.captureObserver = captureObserver
        _home = State(initialValue: PurchasesHomeModel(dependencies: dependencies))
    }

    public var body: some View {
        NavigationStack(path: $path) {
            PurchasesHomeScreen(model: home)
                .modifier(PurchasesCaptureAvailabilityObserver(observe: captureObserver))
                .navigationDestination(for: PurchasesScreenRoute.self) { route in
                    PurchasesDestinationView(route: route, dependencies: dependencies)
                }
        }
        .purchaseCapturePresentation(
            dependencies: dependencies,
            isAvailable: captureAvailable,
            onSaved: { savedIDs in Task { await home.land(savedIDs: savedIDs) } })
    }
}

private struct PurchasesCaptureAvailabilityObserver: ViewModifier {
    @Environment(\.purchaseCapture) private var purchaseCapture
    let observe: (@MainActor (Bool) -> Void)?

    func body(content: Content) -> some View {
        content.onAppear { observe?(purchaseCapture != nil) }
    }
}
