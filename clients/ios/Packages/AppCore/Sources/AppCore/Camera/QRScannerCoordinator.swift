#if canImport(UIKit)

    import AVFoundation
    import Foundation
    import UIKit

    /// Owns the capture session for as long as the scanner is on screen.
    ///
    /// Lives in `AppCore` rather than a feature because more than one feature
    /// scans a QR code — `FeaturePairing`'s device pairing and the Inventory
    /// scan screen both read one — and "no feature imports another feature" is
    /// a `ModuleBoundaryTests` rule, not a suggestion. `CameraAuthorizing` moved
    /// here for the same reason; see `AppCore`'s README.
    ///
    /// `@MainActor` because everything it touches afterwards — the preview
    /// layer, the view model — is, and because the metadata delegate is
    /// deliberately given the main queue. The one thing that must *not* happen
    /// on the main queue is `startRunning`, which Apple documents as blocking;
    /// on a cold camera that is a visible stall the moment the sheet appears.
    @MainActor
    public final class QRScannerCoordinator: NSObject {
        public var onScan: (String) -> Bool

        private let capture = CaptureSessionHolder()
        /// Stops the second and later reads of the same code being acted on
        /// while the sheet is still dismissing — a QR in view produces frames
        /// continuously, not once.
        private var hasScanned = false
        /// The input device ``configure()`` opened, kept for the torch: a
        /// fresh ``scanningCamera()`` lookup would name the same device, but
        /// locking a second instance for configuration while the session
        /// already holds the first is the kind of thing that works on some
        /// phones and freezes others.
        private var device: AVCaptureDevice?

        public init(onScan: @escaping (String) -> Bool) {
            self.onScan = onScan
        }

        public func start(previewing view: QRScannerPreviewView) {
            configure()
            view.previewLayer.session = capture.session
            view.previewLayer.videoGravity = .resizeAspectFill
            capture.startRunning()
        }

        public func stop() {
            capture.stopRunning()
        }

        /// Whether this device has a torch to turn on at all — absent on
        /// every simulator and on an iPad without a rear camera, so the
        /// screen hides the control rather than offering one that silently
        /// does nothing.
        public var hasTorch: Bool {
            device?.hasTorch ?? false
        }

        /// Turns the torch on or off. A silent no-op without a torch, and
        /// while another client holds the device for configuration: the
        /// screen still reflects whatever was asked, and the next toggle
        /// tries again.
        public func setTorch(on: Bool) {
            guard let device, device.hasTorch else { return }
            do {
                try device.lockForConfiguration()
            } catch {
                return
            }
            defer { device.unlockForConfiguration() }
            device.torchMode = on ? .on : .off
        }

        /// Configures for QR and nothing else, then tunes the lens for it.
        ///
        /// The tuning runs after the session commits, not inside the
        /// configuration block: committing applies the session preset, and a
        /// preset that changes the device's active format resets its zoom
        /// factor with it. A zoom set before the commit would be undone by it.
        private func configure() {
            guard let device = attachCamera() else { return }
            self.device = device
            tuneForScanning(device)
        }

        /// A silent no-op (returning `nil`) if the device has no camera or the
        /// input is refused: the caller has already checked authorisation, and
        /// the manual form is underneath either way. Throwing here would
        /// replace a working fallback with an error about a fallback that is
        /// working.
        private func attachCamera() -> AVCaptureDevice? {
            let session = capture.session
            session.beginConfiguration()
            defer { session.commitConfiguration() }

            guard let device = Self.scanningCamera(),
                let input = try? AVCaptureDeviceInput(device: device),
                session.canAddInput(input)
            else { return nil }
            session.addInput(input)

            let output = AVCaptureMetadataOutput()
            guard session.canAddOutput(output) else { return device }
            session.addOutput(output)

            // Set after `addOutput`: the available metadata types are empty
            // until the output belongs to a session, so assigning `[.qr]` first
            // raises an "unsupported type" exception.
            output.setMetadataObjectsDelegate(self, queue: .main)
            if output.availableMetadataObjectTypes.contains(.qr) {
                output.metadataObjectTypes = [.qr]
            }
            return device
        }

        /// The back camera best able to focus on something close, most capable
        /// first.
        ///
        /// `AVCaptureDevice.default(for: .video)` — what this used to open —
        /// is the main wide lens alone, and on a Pro iPhone that lens cannot
        /// focus nearer than about 20 cm. A QR code framed at a natural size
        /// sits closer than that, so the preview stayed soft however long
        /// continuous autofocus hunted: it read as "autofocus does not work".
        /// The triple and dual-wide *virtual* cameras include the ultra-wide,
        /// and switch to it on their own when the subject is too close for the
        /// main lens — the Camera app's macro, for free. The single wide lens
        /// is the fallback for phones with neither, and `default(for:)` the
        /// last resort for a device with no back camera at all.
        private static func scanningCamera() -> AVCaptureDevice? {
            let preference: [AVCaptureDevice.DeviceType] = [
                .builtInTripleCamera,
                .builtInDualWideCamera,
                .builtInWideAngleCamera,
            ]
            for type in preference {
                if let device = AVCaptureDevice.default(type, for: .video, position: .back) {
                    return device
                }
            }
            return AVCaptureDevice.default(for: .video)
        }

        /// Focus continuously, favour near subjects, and start at a zoom the
        /// lens can actually focus at.
        ///
        /// Smooth autofocus is deliberately left off. It slows the lens down
        /// so a recording does not visibly hunt — the right trade for video,
        /// the wrong one here, where the only thing that matters is how soon
        /// the code is sharp.
        private func tuneForScanning(_ device: AVCaptureDevice) {
            do {
                try device.lockForConfiguration()
            } catch {
                // Locking failed (device disconnected mid-configure, or another
                // client grabbed it) — the session defaults still apply, so
                // scanning keeps working, just without the tuning.
                return
            }
            defer { device.unlockForConfiguration() }

            if device.isFocusModeSupported(.continuousAutoFocus) {
                device.focusMode = .continuousAutoFocus
            }
            if device.isAutoFocusRangeRestrictionSupported {
                device.autoFocusRangeRestriction = .near
            }
            if device.primaryConstituentDeviceSwitchingBehavior != .unsupported {
                device.setPrimaryConstituentDeviceSwitchingBehavior(
                    .auto,
                    restrictedSwitchingBehaviorConditions: []
                )
            }
            device.videoZoomFactor = Self.scanningZoom(for: device)
        }

        /// On a virtual camera that includes the ultra-wide, zoom factor 1 *is*
        /// the ultra-wide; the first switch-over factor is where the main lens
        /// takes over, which is what the Camera app labels 1×. Starting there
        /// frames like any other camera and leaves the close-range switch to
        /// the device. A single lens has no such switch, so it is zoomed until
        /// a code framed at a readable size is also one it can focus on.
        private static func scanningZoom(for device: AVCaptureDevice) -> CGFloat {
            let lower = device.minAvailableVideoZoomFactor
            let upper = device.maxAvailableVideoZoomFactor
            if device.isVirtualDevice,
                let mainLens = device.virtualDeviceSwitchOverVideoZoomFactors.first
            {
                return min(max(CGFloat(mainLens.doubleValue), lower), upper)
            }
            let zoom = QRFocusGeometry.zoomFactor(
                minimumFocusDistanceMillimetres: device.minimumFocusDistance,
                fieldOfViewDegrees: Double(device.activeFormat.videoFieldOfView),
                minimum: Double(lower),
                maximum: Double(upper)
            )
            return CGFloat(zoom)
        }
    }

    extension QRScannerCoordinator: AVCaptureMetadataOutputObjectsDelegate {
        /// The delegate queue set in ``configure()`` is `.main`, which is what
        /// makes the hop below an assumption rather than a hope. The two have to
        /// move together; `assumeIsolated` traps loudly rather than corrupting
        /// state if they ever do not.
        public nonisolated func metadataOutput(
            _ output: AVCaptureMetadataOutput,
            didOutput metadataObjects: [AVMetadataObject],
            from connection: AVCaptureConnection
        ) {
            // Read to plain strings before crossing: `AVMetadataObject` is not
            // `Sendable`, and the payload is all this needs.
            let payloads = metadataObjects.compactMap {
                ($0 as? AVMetadataMachineReadableCodeObject)?.stringValue
            }
            MainActor.assumeIsolated { consume(payloads) }
        }

        private func consume(_ payloads: [String]) {
            guard !hasScanned else { return }
            for payload in payloads where onScan(payload) {
                hasScanned = true
                stop()
                return
            }
        }
    }

#endif
