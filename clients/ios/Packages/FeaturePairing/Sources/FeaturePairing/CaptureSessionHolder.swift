#if canImport(UIKit)

    import AVFoundation
    import Foundation

    /// An `AVCaptureSession` and the serial queue that makes driving it safe,
    /// held together because one is the reason the other is sound.
    ///
    /// `@unchecked Sendable` is an assertion, so here is what is being asserted.
    /// `AVCaptureSession` carries no `Sendable` annotation in the iOS 26 SDK —
    /// checked, not assumed — yet Apple's own guidance is that `startRunning()`
    /// blocks and must therefore be called from a serial queue the caller owns.
    /// Those two facts cannot both be honoured without saying something the
    /// compiler cannot derive. This type says it once, in six lines, next to the
    /// queue that provides the serialisation.
    ///
    /// The alternative the compiler suggests — `@preconcurrency import
    /// AVFoundation` — would silence every `Sendable` question this file could
    /// ever ask, including the ones that turn out to be real. This answers one.
    internal final class CaptureSessionHolder: @unchecked Sendable {
        /// Configured and attached to the preview layer from the main actor,
        /// before either method below is first called. `DispatchQueue.async`
        /// preserves submission order, so the configuration is complete and
        /// visible before the session starts.
        internal let session = AVCaptureSession()

        private let queue = DispatchQueue(label: "com.knoxiolabs.pops.qr-scanner")

        internal func startRunning() {
            queue.async { [self] in
                guard !session.isRunning else { return }
                session.startRunning()
            }
        }

        internal func stopRunning() {
            queue.async { [self] in
                guard session.isRunning else { return }
                session.stopRunning()
            }
        }
    }

#endif
