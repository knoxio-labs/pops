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
        /// fresh `AVCaptureDevice.default(for:)` lookup would name the same
        /// physical device, but locking a second instance for configuration
        /// while the session already holds the first is the kind of thing
        /// that works on some phones and freezes others.
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

        /// Configures for QR and nothing else.
        ///
        /// A silent no-op if the device has no camera or the input is refused:
        /// the caller has already checked authorisation, and the manual form is
        /// underneath either way. Throwing here would replace a working
        /// fallback with an error about a fallback that is working.
        private func configure() {
            let session = capture.session
            session.beginConfiguration()
            defer { session.commitConfiguration() }

            guard let device = AVCaptureDevice.default(for: .video),
                let input = try? AVCaptureDeviceInput(device: device),
                session.canAddInput(input)
            else { return }
            session.addInput(input)
            self.device = device
            configureFocus(device)

            let output = AVCaptureMetadataOutput()
            guard session.canAddOutput(output) else { return }
            session.addOutput(output)

            // Set after `addOutput`: the available metadata types are empty
            // until the output belongs to a session, so assigning `[.qr]` first
            // raises an "unsupported type" exception.
            output.setMetadataObjectsDelegate(self, queue: .main)
            if output.availableMetadataObjectTypes.contains(.qr) {
                output.metadataObjectTypes = [.qr]
            }
        }

        /// A QR code is scanned close to the lens with the phone hunting for
        /// distance, which is exactly the case continuous AF exists for — but
        /// the session default is a property of whatever the device was doing
        /// before this session opened it, not something this call can rely on.
        /// Smooth AF trades focus speed for less visible hunting, which reads
        /// as "it works" instead of "it's fighting the code" while framing.
        private func configureFocus(_ device: AVCaptureDevice) {
            guard device.isFocusModeSupported(.continuousAutoFocus) else { return }
            do {
                try device.lockForConfiguration()
            } catch {
                // Locking failed (device disconnected mid-configure, or another
                // client grabbed it) — the session default focus mode still
                // applies, so scanning keeps working, just without the tuning.
                return
            }
            defer { device.unlockForConfiguration() }

            device.focusMode = .continuousAutoFocus
            if device.isSmoothAutoFocusSupported {
                device.isSmoothAutoFocusEnabled = true
            }
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
