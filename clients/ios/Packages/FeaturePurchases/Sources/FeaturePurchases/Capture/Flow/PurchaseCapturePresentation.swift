import AppCore
import DesignSystem
import SwiftUI

#if canImport(PhotosUI) && canImport(UIKit)
    import PhotosUI
#endif

extension View {
    /// Installs purchase capture and presents each capture step over this view.
    ///
    /// When capture is unavailable, descendants receive no ``PurchaseCapturePresenter``. A
    /// completed or partially saved run reports its purchase identifiers once in save order.
    public func purchaseCapturePresentation(
        dependencies: AppDependencies,
        isAvailable: Bool,
        onSaved: @escaping ([Purchase.ID]) -> Void
    ) -> some View {
        modifier(
            PurchaseCapturePresentationModifier(
                dependencies: dependencies,
                isAvailable: isAvailable,
                onSaved: onSaved))
    }
}

@MainActor
internal struct PurchaseCapturePresentationModifier: ViewModifier {
    @State private var flow: PurchaseCaptureFlow
    private let isAvailable: Bool
    private let merchantDirectory: PurchaseCaptureMerchantDirectory

    internal init(
        dependencies: AppDependencies,
        isAvailable: Bool,
        onSaved: @escaping ([Purchase.ID]) -> Void
    ) {
        _flow = State(
            initialValue: PurchaseCaptureFlow(dependencies: dependencies, onSaved: onSaved))
        self.isAvailable = isAvailable
        merchantDirectory = PurchaseCaptureMerchantDirectory(repository: dependencies.merchants)
    }

    internal init(
        flow: PurchaseCaptureFlow,
        isAvailable: Bool,
        merchantDirectory: PurchaseCaptureMerchantDirectory
    ) {
        _flow = State(initialValue: flow)
        self.isAvailable = isAvailable
        self.merchantDirectory = merchantDirectory
    }

    internal var presenter: PurchaseCapturePresenter {
        PurchaseCapturePresenter { source in
            Task { await flow.start(source) }
        }
    }

    internal func body(content: Content) -> some View {
        @Bindable var flow = flow

        content
            .environment(\.purchaseCapture, isAvailable ? presenter : nil)
            .sheet(item: $flow.sheet, onDismiss: flow.reset) { sheet in
                captureSheet(sheet)
            }
            .modifier(PurchaseCapturePickerModifier(flow: flow))
            .alert(
                flow.cameraRefusal?.title ?? "Camera unavailable",
                isPresented: cameraRefusalPresented,
                presenting: flow.cameraRefusal
            ) { refusal in
                if refusal.offersSettings, let settings = SystemSettings.url {
                    Link(ReceiptCaptureCopy.openSettings, destination: settings)
                }
                Button("OK", role: .cancel) { flow.acknowledgeCameraRefusal() }
            } message: { refusal in
                Text(refusal.message)
            }
    }

    @ViewBuilder private func captureSheet(_ sheet: PurchaseCaptureSheet) -> some View {
        switch sheet {
        case .batch:
            batch
                .presentationDetents([.large])
                .interactiveDismissDisabled(flow.staging?.isEmpty == false)
                .tint(.popsPurchases)
        case .handEntry:
            NavigationStack {
                if let handEntry = flow.handEntry {
                    PurchaseHandEntryView(
                        model: handEntry,
                        searchMerchants: merchantDirectory.search,
                        merchantPreview: merchantDirectory.merchant,
                        addressesForMerchant: merchantDirectory.addresses,
                        addressPreview: merchantDirectory.address,
                        onFinished: { flow.finish(savedIDs: $0) })
                }
            }
            .interactiveDismissDisabled()
            .tint(.popsPurchases)
        }
    }

    private var batch: some View {
        @Bindable var flow = flow

        // The destination belongs inside the stack: attached to the NavigationStack itself it is
        // never registered, and every push renders SwiftUI's missing-destination placeholder.
        return NavigationStack(path: $flow.path) {
            Group {
                if let staging = flow.staging {
                    PurchaseStagingGrid(
                        model: staging,
                        onRead: flow.read,
                        onCancel: flow.cancel,
                        onAdd: { source in Task { await flow.pick(source) } },
                        onReplace: { pageID, source in
                            Task { await flow.pick(source, replacing: pageID) }
                        })
                }
            }
            .navigationDestination(for: PurchaseCaptureRoute.self) { route in
                destination(route)
            }
        }
    }

    @ViewBuilder private func destination(_ route: PurchaseCaptureRoute) -> some View {
        switch route {
        case .reading:
            if let reading = flow.reading {
                PurchaseReadingView(
                    model: reading,
                    onCancel: flow.cancel,
                    onReview: flow.review)
            }
        case .review:
            if let review = flow.review {
                PurchaseReviewView(
                    model: review,
                    searchMerchants: merchantDirectory.search,
                    merchantPreview: merchantDirectory.merchant,
                    addressesForMerchant: merchantDirectory.addresses,
                    addressPreview: merchantDirectory.address,
                    onCancel: flow.cancel,
                    onFinished: { flow.finish(savedIDs: $0) })
            }
        }
    }

    private var cameraRefusalPresented: Binding<Bool> {
        Binding(
            get: { flow.cameraRefusal != nil },
            set: { presented in
                if !presented { flow.acknowledgeCameraRefusal() }
            })
    }
}

@MainActor
private struct PurchaseCapturePickerModifier: ViewModifier {
    let flow: PurchaseCaptureFlow

    func body(content: Content) -> some View {
        scanner(filePicker(photoPicker(content)))
    }

    @ViewBuilder private func photoPicker(_ content: Content) -> some View {
        #if canImport(PhotosUI) && canImport(UIKit)
            content.receiptPhotoPicker(
                isPresented: presented(.photos),
                onPicked: { items in
                    Task {
                        await flow.didPickPhotos(items)
                        flow.pickerDismissed()
                    }
                },
                onCancel: flow.pickerDismissed)
        #else
            content
        #endif
    }

    @ViewBuilder private func filePicker(_ content: some View) -> some View {
        #if canImport(UIKit)
            content.sheet(isPresented: presented(.file)) {
                ReceiptFilePicker(
                    onPicked: { picked in
                        Task {
                            await flow.didPickFiles(picked.map { ($0.url, $0.data) })
                            flow.pickerDismissed()
                        }
                    },
                    onCancel: flow.pickerDismissed)
            }
        #else
            content
        #endif
    }

    @ViewBuilder private func scanner(_ content: some View) -> some View {
        #if os(iOS) && canImport(VisionKit) && canImport(UIKit)
            content.fullScreenCover(
                isPresented: presented(.scanner),
                onDismiss: flow.pickerDismissed
            ) {
                ReceiptDocumentScanner(
                    onCapture: { parts, pageCount in
                        flow.didScan(parts: parts, pageCount: pageCount)
                        flow.pickerDismissed()
                    },
                    onCancel: flow.pickerDismissed,
                    onFailure: {
                        flow.didScan(parts: [], pageCount: 0)
                        flow.pickerDismissed()
                    }
                )
                .ignoresSafeArea()
            }
        #else
            content
        #endif
    }

    private func presented(_ picker: PurchaseCapturePicker) -> Binding<Bool> {
        Binding(
            get: { flow.picker == picker },
            set: { presented in
                if presented {
                    flow.picker = picker
                }
            })
    }
}
