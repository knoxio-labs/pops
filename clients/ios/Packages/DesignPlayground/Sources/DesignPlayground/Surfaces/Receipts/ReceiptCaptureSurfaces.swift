import AppCore
import FeatureReceiptCapture

/// The capture prompt: a camera to open, a refusal to explain, or a scan that
/// came back with nothing to send.
///
/// This is `ReceiptCaptureView` itself, not a look-alike — the whole reason
/// this package now depends on `FeatureReceiptCapture`. Every state here is
/// reached by driving `ReceiptCaptureViewModel` the way the real screen does:
/// a fixed ``ReceiptCameraAuthorization`` standing in for the camera the
/// playground does not have, and the model's own `didCapture`/`didFailCapture`
/// producing the same ``ReceiptCaptureProblem`` a real scan would.
@MainActor
internal enum ReceiptCaptureSurfaces {
    internal static let surface = DesignSurface(
        id: SurfaceID(area: "receipts", slug: "capture"),
        title: "Receipt capture",
        synopsis: "Photograph a receipt, or say why the camera cannot open.",
        chrome: .tabbed,
        states: [
            DesignState.standard { ReceiptCaptureView(model: model(access: .authorized)) },
            DesignState("denied", "Camera access denied") {
                ReceiptCaptureView(model: model(access: .denied))
            },
            DesignState("restricted", "Camera access restricted") {
                ReceiptCaptureView(model: model(access: .restricted))
            },
            DesignState("no-camera", "No camera on this device") {
                ReceiptCaptureView(model: model(access: .unavailable))
            },
            DesignState("camera-failed", "Camera failed mid-scan") {
                ReceiptCaptureView(model: problemModel { $0.didFailCapture() })
            },
            DesignState("no-pages", "Scan produced nothing") {
                ReceiptCaptureView(model: problemModel { $0.didCapture([], from: 0) })
            },
            DesignState("too-many-pages", "Too many pages") {
                ReceiptCaptureView(model: problemModel { $0.didCapture([], from: 11) })
            },
            DesignState("unprepared-pages", "A page failed to encode") {
                ReceiptCaptureView(
                    model: problemModel {
                        $0.didCapture(ReceiptPlaygroundPaper.pages(2), from: 3)
                    })
            },
        ]
    )

    /// `.notDetermined` is not a state of its own here: `CameraRefusal`
    /// answers `nil` for it exactly as it does for `.authorized`, so the two
    /// draw the same screen before anything has been asked. A row for it
    /// would be a second copy of the default with nothing left to see.
    private static func model(access: CameraAccess) -> ReceiptCaptureViewModel {
        let model = ReceiptCaptureViewModel(
            dependencies: .unbound, camera: ReceiptCameraAuthorization(access))
        model.refreshCameraAccess()
        return model
    }

    /// A model with the camera available, then driven straight into the
    /// problem a real scan would have left it in — so the screen shows the
    /// capture button doing its job (there is a camera) alongside the message
    /// saying what the last attempt produced.
    private static func problemModel(
        _ drive: (ReceiptCaptureViewModel) -> Void
    ) -> ReceiptCaptureViewModel {
        let model = model(access: .authorized)
        drive(model)
        return model
    }
}
