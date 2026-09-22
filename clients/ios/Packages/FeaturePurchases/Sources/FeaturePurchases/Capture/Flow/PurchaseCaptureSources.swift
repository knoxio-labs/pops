import AppCore
import Foundation

#if canImport(PhotosUI) && canImport(UIKit)
    import PhotosUI
#endif

internal enum PurchaseCapturePicker: String, Identifiable {
    case scanner
    case photos
    case file

    internal var id: String { rawValue }
}

extension PurchaseCaptureFlow {
    internal func start(_ source: PurchaseCaptureSource) async {
        guard isIdle else { return }
        switch source {
        case .hand:
            handEntry = PurchaseHandEntryViewModel(dependencies: dependencies)
            sheet = .handEntry
        case .scan, .photos, .file:
            staging = PurchaseStagingModel()
            await open(source)
        }
    }

    internal func pick(_ source: PurchaseCaptureSource, replacing pageID: String? = nil) async {
        guard sheet == .batch, let staging else {
            invalid("A picker can open only from staging")
            return
        }
        guard source != .hand else {
            invalid("Hand entry cannot replace a staged page")
            return
        }
        replacing = pageID
        if let pageID { staging.beginReplacing(pageID) }
        await open(source)
    }

    internal func didScan(parts: [ReceiptPart], pageCount: Int) {
        guard let staging else {
            invalid("A scan result requires staging")
            return
        }
        if replacing != nil, pageCount > 0, parts.count >= pageCount, let first = parts.first {
            _ = staging.replaceIfPending(
                with: StagedPage(
                    id: UUID().uuidString,
                    label: "Scan page 1",
                    part: first))
            replacing = nil
        } else {
            staging.addScanned(parts, pageCount: pageCount)
        }
    }

    #if canImport(PhotosUI) && canImport(UIKit)
        internal func didPickPhotos(_ items: [PhotosPickerItem]) async {
            guard let staging else {
                invalid("Picked photos require staging")
                return
            }
            await staging.addFromPhotoLibrary(items)
            replacing = nil
        }
    #endif

    internal func didPickFiles(_ picked: [(url: URL, data: Data)]) async {
        guard let staging else {
            invalid("Picked files require staging")
            return
        }
        await staging.addFromFileURLs(picked)
        replacing = nil
    }

    internal func pickerDismissed() {
        guard picker != nil else { return }
        let startedFromHome = sheet == nil
        picker = nil
        staging?.beginReplacing("")
        replacing = nil
        guard startedFromHome else { return }
        if staging?.isEmpty == false || staging?.refusal != nil {
            sheet = .batch
        } else {
            reset()
        }
    }

    internal func acknowledgeCameraRefusal() {
        cameraRefusal = nil
        staging?.beginReplacing("")
        replacing = nil
        if sheet == nil { reset() }
    }

    private var isIdle: Bool {
        sheet == nil && picker == nil && staging == nil && handEntry == nil
    }

    private func open(_ source: PurchaseCaptureSource) async {
        switch source {
        case .scan:
            let access = await camera.requestAccess()
            if let refusal = CameraRefusal.refusing(access) {
                cameraRefusal = refusal
            } else {
                picker = .scanner
            }
        case .photos:
            picker = .photos
        case .file:
            picker = .file
        case .hand:
            invalid("Hand entry is not a picker")
        }
    }
}
