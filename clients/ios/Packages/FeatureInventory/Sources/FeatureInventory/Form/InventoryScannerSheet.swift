#if canImport(VisionKit) && canImport(UIKit)
    import DesignSystem
    import SwiftUI
    import UIKit
    import VisionKit

    internal struct InventoryScannerSheet: View {
        internal let model: InventoryItemFormModel
        @State private var session: InventoryScannerSession
        @Environment(\.dismiss) private var dismiss

        internal init(model: InventoryItemFormModel) {
            self.model = model
            _session = State(wrappedValue: InventoryScannerSession(model: model))
        }

        internal var body: some View {
            NavigationStack {
                InventoryLiveScanner(
                    session: session, onFound: { dismiss() },
                    onFailure: {
                        session.stop()
                        model.prefillStatus = .scannerUnavailable
                        dismiss()
                    }
                )
                .ignoresSafeArea(edges: .bottom)
                .safeAreaInset(edge: .bottom) {
                    VStack(spacing: PopsSpacing.sm) {
                        if session.showsTextPrompt {
                            if let message = model.prefillStatus?.message { Text(message) }
                            Text("Point at the label text and tap Use text")
                        }
                        Button {
                            let lines = InventoryLabelText.lines(from: session.recognizedText)
                            session.stop()
                            dismiss()
                            model.handleCapturedText(lines)
                        } label: {
                            Label {
                                Text("Use text")
                            } icon: {
                                InventorySymbol.useText.image
                            }
                            .frame(maxWidth: .infinity, minHeight: PopsSize.touchTarget)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.popsInventory)
                        .disabled(session.recognizedText.isEmpty)
                        .accessibilityIdentifier(InventoryAccessibility.itemScanUseText)
                    }
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsForeground)
                    .padding(PopsSpacing.lg)
                    .background(
                        .regularMaterial, in: RoundedRectangle(cornerRadius: PopsRadius.card)
                    )
                    .padding(PopsSpacing.lg)
                }
                .navigationTitle("Scan barcode or label")
                .popsTitleDisplay(large: false)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { dismiss() }
                    }
                }
            }
            .onDisappear { session.stop() }
        }
    }

    private struct InventoryLiveScanner: UIViewControllerRepresentable {
        let session: InventoryScannerSession
        let onFound: @MainActor () -> Void
        let onFailure: @MainActor () -> Void

        func makeCoordinator() -> InventoryLiveScannerCoordinator {
            InventoryLiveScannerCoordinator(
                session: session, onFound: onFound, onFailure: onFailure)
        }

        func makeUIViewController(context: Context) -> InventoryScannerContainer {
            let scanner = DataScannerViewController(
                recognizedDataTypes: [.barcode(symbologies: [.ean13, .ean8, .upce]), .text()],
                recognizesMultipleItems: true, isHighlightingEnabled: true)
            scanner.delegate = context.coordinator
            return InventoryScannerContainer(scanner: scanner, onFailure: onFailure)
        }

        func updateUIViewController(_ controller: InventoryScannerContainer, context: Context) {}
    }

    @MainActor
    private final class InventoryLiveScannerCoordinator: NSObject, DataScannerViewControllerDelegate
    {
        private let session: InventoryScannerSession
        private let onFound: @MainActor () -> Void
        private let onFailure: @MainActor () -> Void

        init(
            session: InventoryScannerSession, onFound: @escaping @MainActor () -> Void,
            onFailure: @escaping @MainActor () -> Void
        ) {
            self.session = session
            self.onFound = onFound
            self.onFailure = onFailure
        }

        func dataScanner(
            _ dataScanner: DataScannerViewController,
            didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]
        ) {
            updateRecognizedText(allItems)
            let payloads = addedItems.compactMap { item -> String? in
                guard case .barcode(let barcode) = item else { return nil }
                return barcode.payloadStringValue
            }
            session.recognizeBarcodes(payloads, onFound: onFound)
        }

        func dataScanner(
            _ dataScanner: DataScannerViewController,
            didUpdate updatedItems: [RecognizedItem], allItems: [RecognizedItem]
        ) {
            updateRecognizedText(allItems)
        }

        func dataScanner(
            _ dataScanner: DataScannerViewController,
            didRemove removedItems: [RecognizedItem], allItems: [RecognizedItem]
        ) {
            updateRecognizedText(allItems)
        }

        private func updateRecognizedText(_ items: [RecognizedItem]) {
            session.updateRecognizedText(
                items.compactMap { item in
                    guard case .text(let text) = item else { return nil }
                    return InventoryRecognizedText(
                        transcript: text.transcript,
                        topLeft: text.bounds.topLeft, topRight: text.bounds.topRight,
                        bottomRight: text.bounds.bottomRight, bottomLeft: text.bounds.bottomLeft)
                })
        }

        func dataScanner(
            _ dataScanner: DataScannerViewController,
            becameUnavailableWithError error: DataScannerViewController.ScanningUnavailable
        ) {
            onFailure()
        }
    }

    private final class InventoryScannerContainer: UIViewController {
        private let scanner: DataScannerViewController
        private let onFailure: @MainActor () -> Void

        init(scanner: DataScannerViewController, onFailure: @escaping @MainActor () -> Void) {
            self.scanner = scanner
            self.onFailure = onFailure
            super.init(nibName: nil, bundle: nil)
        }

        @available(*, unavailable)
        required init?(coder: NSCoder) { return nil }

        override func viewDidLoad() {
            super.viewDidLoad()
            addChild(scanner)
            view.addSubview(scanner.view)
            scanner.view.translatesAutoresizingMaskIntoConstraints = false
            NSLayoutConstraint.activate([
                scanner.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
                scanner.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
                scanner.view.topAnchor.constraint(equalTo: view.topAnchor),
                scanner.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            ])
            scanner.didMove(toParent: self)
        }

        override func viewDidAppear(_ animated: Bool) {
            super.viewDidAppear(animated)
            do {
                try scanner.startScanning()
            } catch {
                onFailure()
            }
        }

        override func viewDidDisappear(_ animated: Bool) {
            super.viewDidDisappear(animated)
            scanner.stopScanning()
        }
    }
#endif
