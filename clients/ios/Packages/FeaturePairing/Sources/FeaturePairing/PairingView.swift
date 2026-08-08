import AppCore
import DesignSystem
import SwiftUI

/// The app's first screen when unpaired, and the only one anybody sees before
/// anything else works.
///
/// It renders and it forwards taps. Every decision — whether the scanner may
/// open, what a scanned payload means, which sentence a failure produces — is
/// ``PairingViewModel``'s, which is what makes those answers assertable without
/// a simulator.
public struct PairingView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var model: PairingViewModel

    public init(model: PairingViewModel) {
        _model = State(wrappedValue: model)
    }

    public var body: some View {
        @Bindable var bindable = model

        return
            content
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.popsBackground)
            .onAppear { model.refreshCameraAccess() }
            // Someone sent to Settings to allow the camera comes back to this
            // screen, not through `onAppear`. Without this the scan button
            // stays replaced by the "cannot use the camera" line until the app
            // is relaunched.
            .onChange(of: scenePhase) { _, phase in
                if phase == .active { model.refreshCameraAccess() }
            }
            // Spoken, not merely rendered. VoiceOver does not move focus to
            // text that appears below the button that was just pressed, so
            // without this a rejected code reads as the button having done
            // nothing at all.
            .onChange(of: model.failure) { _, failure in
                guard let failure else { return }
                AccessibilityNotification.Announcement(PairingCopy.message(for: failure)).post()
            }
            .sheet(isPresented: $bindable.isScannerPresented) { scannerSheet }
    }

    @ViewBuilder private var content: some View {
        if model.isPairing {
            LoadingStateView(message: PairingCopy.pairing)
        } else {
            form
        }
    }

    /// A `ScrollView` unconditionally, not only when the content overflows.
    /// At the accessibility Dynamic Type sizes this form is taller than any
    /// iPhone, and a fixed layout there puts the Pair button off-screen with no
    /// way to reach it.
    private var form: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.xl) {
                header
                scanSection
                PairingFormFields(model: model)
                failureMessage
                pairButton
            }
            .padding(PopsSpacing.lg)
        }
    }
}

extension PairingView {
    private var header: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            Text(PairingCopy.title)
                .font(.popsTitle)
                .foregroundStyle(Color.popsForeground)
            Text(PairingCopy.subtitle)
                .font(.popsSubheadline)
                .foregroundStyle(Color.popsMutedForeground)
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }

    /// The camera, or the reason there isn't one. Never absent: a section that
    /// vanished when permission was refused would leave the person wondering
    /// where the scan button went.
    @ViewBuilder private var scanSection: some View {
        PopsCard {
            switch model.cameraAccess {
            case .notDetermined, .authorized:
                PopsButton(PairingCopy.scanButton) { Task { await model.scanQRCode() } }
            case .denied:
                cameraUnavailable(PairingCopy.cameraDenied, offeringSettings: true)
            case .restricted:
                cameraUnavailable(PairingCopy.cameraRestricted, offeringSettings: false)
            case .unavailable:
                cameraUnavailable(PairingCopy.cameraUnavailable, offeringSettings: false)
            }
        }
    }

    /// `offeringSettings` is false for `restricted` and `unavailable` on
    /// purpose: neither can be changed from Settings, and a button that leads
    /// somewhere with nothing to change is worse than no button.
    @ViewBuilder private func cameraUnavailable(
        _ message: String,
        offeringSettings: Bool
    ) -> some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            Text(message)
                .font(.popsBody)
                .foregroundStyle(Color.popsMutedForeground)
            if offeringSettings, let settings = SystemSettings.url {
                Link(PairingCopy.openSettings, destination: settings)
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsAccent)
            }
        }
    }

    @ViewBuilder private var failureMessage: some View {
        if let failure = model.failure {
            Text(PairingCopy.message(for: failure))
                .font(.popsBody)
                .foregroundStyle(Color.popsDestructive)
        }
    }

    private var pairButton: some View {
        PopsButton(PairingCopy.pairButton) { Task { await model.pair() } }
            .disabled(!model.canSubmit)
            .accessibilityHint(model.submissionProblem.map(PairingCopy.blockedHint) ?? "")
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder private var scannerSheet: some View {
        #if canImport(UIKit)
            QRScannerSheet(
                onScan: { model.didScan($0) },
                onCancel: { model.dismissScanner() }
            )
        #else
            // No camera to preview on the host toolchain, and nothing shipped
            // ever reaches this branch — see `QRScannerView.swift`.
            EmptyView()
        #endif
    }
}
