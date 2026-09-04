#if DEBUG

    import AppCore
    import Foundation
    import SwiftUI

    /// Doubles for the canvas, and the only reason they sit in `Sources` rather
    /// than in a test-support product: `#Preview` is compiled into the module it
    /// previews, so a fake in a separate target is not reachable from one.
    ///
    /// `#if DEBUG` keeps them out of anything shipped. The bar `Auth` sets — its
    /// `InMemoryKeyStore` lives in a product the app cannot link at all — is
    /// higher because the mistake there is silent: an app wired to a fake key
    /// store pairs, works, and protects nothing. Wiring a screen to
    /// ``PreviewPairingService`` produces a screen that cannot pair, which is
    /// not a failure anyone ships past.
    private struct PreviewPairingService: DevicePairingService {
        let failure: PairingError?

        func pair(_ request: PairingRequest) async throws -> PairedDevice {
            if let failure { throw failure }
            // Success echoes the request back rather than inventing a device.
            // Nothing sees it: the session flips and the root swaps this screen
            // away, so the interesting canvases are the failures below.
            return PairedDevice(id: "preview", baseURL: request.baseURL)
        }
    }

    private struct PreviewCamera: CameraAuthorizing {
        let access: CameraAccess

        func currentAccess() -> CameraAccess { access }
        func requestAccess() async -> CameraAccess { access }
    }

    @MainActor
    private func previewModel(
        camera: CameraAccess = .authorized,
        failing: PairingError? = nil
    ) -> PairingViewModel {
        PairingViewModel(
            session: SessionStore(),
            dependencies: AppDependencies(
                transactions: AppDependencies.unbound.transactions,
                pairing: PreviewPairingService(failure: failing),
                reachability: AppDependencies.unbound.reachability,
                receiptCapture: AppDependencies.unbound.receiptCapture,
                purchases: AppDependencies.unbound.purchases,
                accounts: AppDependencies.unbound.accounts
            ),
            camera: PreviewCamera(access: camera),
            device: SystemDeviceDescription(),
            initialBaseURL: URL(string: "http://localhost:3014")
        )
    }

    /// Drives the model into its failed state so the canvas shows the error
    /// rather than a form that has never been submitted.
    private struct FailedPairingPreview: View {
        let error: PairingError

        var body: some View {
            let model = previewModel(failing: error)
            PairingView(model: model)
                .task {
                    model.codeText = "7QK4-9M2X-P3ND"
                    await model.pair()
                }
        }
    }

    #Preview("Pairing — light") {
        PairingView(model: previewModel())
            .preferredColorScheme(.light)
    }

    #Preview("Pairing — dark") {
        PairingView(model: previewModel())
            .preferredColorScheme(.dark)
    }

    #Preview("Camera refused") {
        PairingView(model: previewModel(camera: .denied))
    }

    #Preview("Rate limited") {
        FailedPairingPreview(error: .rateLimited(retryAfterSeconds: 42))
    }

    /// The size the layout has to survive, and the one nothing automated checks
    /// — see this package's README on that gap.
    #Preview("Accessibility text size") {
        PairingView(model: previewModel())
            .dynamicTypeSize(.accessibility5)
    }

#endif
