import AppCore
import DesignSystem
import SwiftUI

/// What the capture screen shows before there is a receipt: what to do, what
/// went wrong last time, and either the camera or the reason there isn't one.
///
/// A view of its own rather than a section of ``ReceiptCaptureView`` for the
/// same reason `ReceiptResultCard` is one: the screen's root is a `ScrollView`,
/// and `ImageRenderer` lays a scroll view out but rasterises none of its
/// content — measured on both the host toolchain and the Simulator, where a
/// screenful of copy comes back as an empty canvas of the right height. So the
/// half that can be *seen* in a test is the half that has to be separable from
/// the scrolling.
internal struct ReceiptCapturePrompt: View {
    internal let model: ReceiptCaptureViewModel

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xl) {
            header
            problemMessage
            cameraSection
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            Text(ReceiptCaptureCopy.title)
                .font(.popsTitle)
                .foregroundStyle(Color.popsForeground)
            Text(ReceiptCaptureCopy.instruction)
                .font(.popsSubheadline)
                .foregroundStyle(Color.popsMutedForeground)
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }

    @ViewBuilder private var problemMessage: some View {
        if let problem = model.problem {
            Text(ReceiptCaptureCopy.message(for: problem))
                .font(.popsBody)
                .foregroundStyle(Color.popsDestructive)
                .accessibilityIdentifier(ReceiptCaptureAccessibility.problem)
        }
    }

    /// The camera, or the reason there isn't one. Never absent: a section that
    /// vanished when permission was refused would leave somebody wondering
    /// where the button went.
    private var cameraSection: some View {
        PopsCard {
            switch model.cameraAccess {
            case .notDetermined, .authorized:
                PopsButton(ReceiptCaptureCopy.captureButton) {
                    Task { await model.startCapture() }
                }
                .accessibilityIdentifier(ReceiptCaptureAccessibility.captureButton)
            case .denied:
                refusal(ReceiptCaptureCopy.cameraDenied, offeringSettings: true)
            case .restricted:
                refusal(ReceiptCaptureCopy.cameraRestricted, offeringSettings: false)
            case .unavailable:
                refusal(ReceiptCaptureCopy.cameraUnavailable, offeringSettings: false)
            }
        }
    }

    /// `offeringSettings` is false for `restricted` and `unavailable` on
    /// purpose: neither can be changed from Settings, and a button that leads
    /// somewhere with nothing to change is worse than no button.
    private func refusal(_ message: String, offeringSettings: Bool) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            Text(message)
                .font(.popsBody)
                .foregroundStyle(Color.popsMutedForeground)
            if offeringSettings, let settings = SystemSettings.url {
                Link(ReceiptCaptureCopy.openSettings, destination: settings)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsAccent)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier(ReceiptCaptureAccessibility.cameraRefusal)
    }
}
