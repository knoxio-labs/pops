import AppCore
import DesignSystem
import SwiftUI

/// The receipt-capture screen: photograph a receipt, and hand what comes back
/// to the result screen.
///
/// It renders and it forwards taps. Every decision — whether the camera may
/// open, what an empty scan means, how many photos are too many — is
/// ``ReceiptCaptureViewModel``'s, which is what makes those answers assertable
/// without a camera.
///
/// ## No navigation chrome, on purpose
///
/// The two screens in this flow are one screen replacing the other, not a push.
/// A `NavigationStack` here would be the nested-navigation-controller shape
/// that `ReceiptDocumentScanner` documents an open UIKit crash for — and there
/// is nothing to navigate back to anyway: a captured receipt is either being
/// read or has been, and the way to a second one is to photograph a second one.
public struct ReceiptCaptureView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var model: ReceiptCaptureViewModel

    public init(model: ReceiptCaptureViewModel) {
        _model = State(wrappedValue: model)
    }

    public var body: some View {
        @Bindable var bindable = model

        return
            content
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.popsBackground)
            .onAppear { model.refreshCameraAccess() }
            // Somebody sent to Settings to allow the camera comes back to this
            // screen, not through `onAppear`. Without this the button stays
            // replaced by the refusal until the app is relaunched.
            .onChange(of: scenePhase) { _, phase in
                if phase == .active { model.refreshCameraAccess() }
            }
            // Spoken, not merely rendered. VoiceOver does not move focus to
            // text that appears where the camera used to be, so without this a
            // scan that produced nothing reads as the camera having simply
            // closed.
            .onChange(of: model.problem) { _, problem in
                guard let problem else { return }
                AccessibilityNotification.Announcement(ReceiptCaptureCopy.message(for: problem))
                    .post()
            }
            // `.fullScreenCover`, not `.sheet`: a page sheet on iPhone is
            // interactively dismissible by a downward swipe, and
            // `VNDocumentCameraViewControllerDelegate` is never told about
            // that dismissal — `documentCameraViewControllerDidCancel(_:)`
            // fires for the Cancel button only. A swipe mid-scan would
            // discard however many pages had been photographed with nothing
            // reported, no confirmation, and the model none the wiser. A
            // full-screen cover has no swipe-to-dismiss gesture, so the only
            // way out is the scanner's own Cancel button or a finished scan —
            // both of which already report through the delegate. It also
            // matches how the system document camera is meant to be shown:
            // undecorated and full-screen, not inset with a grabber.
            //
            // `#if os(iOS)`: `fullScreenCover` is unavailable on macOS, which
            // this package also targets so `swift test` runs on the host
            // toolchain (see `Package.swift`). Nothing macOS renders reaches
            // this branch — the scanner itself is `#if canImport(VisionKit)
            // && canImport(UIKit)` below — so `.sheet` here is unreachable at
            // runtime and exists only to keep the host build compiling.
            #if os(iOS)
                .fullScreenCover(isPresented: $bindable.isCameraPresented) { scanner }
            #else
                .sheet(isPresented: $bindable.isCameraPresented) { scanner }
            #endif
    }

    @ViewBuilder private var content: some View {
        switch model.state {
        case .ready:
            prompt
        case .reading(let submission):
            reading(submission)
        }
    }
}

extension ReceiptCaptureView {
    /// A `ScrollView` unconditionally, not only when the content overflows. At
    /// the accessibility Dynamic Type sizes the refusal copy plus a problem is
    /// taller than a phone, and a fixed layout there puts the button off-screen
    /// with no way to reach it.
    private var prompt: some View {
        ScrollView {
            ReceiptCapturePrompt(model: model)
                .padding(PopsSpacing.lg)
        }
    }

    /// The result screen, plus the one thing it deliberately does not own: the
    /// way back to the camera. `ReceiptResultView` draws no chrome, so whoever
    /// embeds it decides what surrounds it — and what surrounds it here is the
    /// answer to "and now the next receipt".
    ///
    /// Keyed on the submission so a second receipt is a second screen. Without
    /// it SwiftUI would reuse the first one's model, and the second receipt
    /// would show the first one's outcome having never been sent.
    private func reading(_ submission: ReceiptSubmission) -> some View {
        VStack(spacing: PopsSpacing.zero) {
            ReceiptResultView(model: model.result(for: submission))
                .id(submission.id)
            PopsButton(ReceiptCaptureCopy.captureAnother) { model.captureAnother() }
                .accessibilityIdentifier(ReceiptCaptureAccessibility.captureAnotherButton)
                .padding(PopsSpacing.lg)
        }
    }

    @ViewBuilder private var scanner: some View {
        #if canImport(VisionKit) && canImport(UIKit)
            ReceiptDocumentScanner(
                onCapture: { model.didCapture($0, from: $1) },
                onCancel: { model.didCancelCapture() },
                onFailure: { model.didFailCapture() }
            )
            .ignoresSafeArea()
        #else
            // No camera to present on the host toolchain, and nothing shipped
            // reaches this branch — see `ReceiptDocumentScanner.swift`.
            EmptyView()
        #endif
    }
}

#Preview("Receipt capture — light") {
    ReceiptCaptureView(model: ReceiptCaptureViewModel(dependencies: .unbound))
        .preferredColorScheme(.light)
}

#Preview("Receipt capture — dark") {
    ReceiptCaptureView(model: ReceiptCaptureViewModel(dependencies: .unbound))
        .preferredColorScheme(.dark)
}
