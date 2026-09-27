import AppCore
import Foundation

internal enum InventoryScanOutcome: Equatable {
    case found
    case miss
}

extension InventoryItemFormModel {
    internal var showsScanButton: Bool {
        mode == .create && protocol2Type != nil && scan.availability.isAvailable
    }

    /// Fills untouched fields for the type selected at capture time, without staging a photo.
    internal func handleCapturedText(_ lines: [String]) {
        cancelScanPrefill()
        guard !lines.isEmpty else {
            prefillStatus = .noText
            return
        }
        guard let currentDraft = protocol2Draft, let type = protocol2Type else {
            prefillStatus = .nothingFound
            return
        }
        startPrefill(source: .text(lines), type: type, currentDraft: currentDraft)
    }

    internal func handleScannedBarcode(_ payload: String) async -> InventoryScanOutcome {
        cancelScanPrefill()
        let identifier = scannedIdentifier(payload)
        if !draft.identifiers.contains(where: {
            $0.kind == identifier.kind && $0.value == identifier.value
        }) {
            draft.identifiers.append(identifier)
        }
        let result: InventoryBarcodeLookup
        do {
            result = try await scan.lookUp(payload)
        } catch {
            guard !Task.isCancelled, !(error is CancellationError) else { return .miss }
            recordLookupFailure(error as? PopsError ?? Self.unknownLookupFailure)
            return .miss
        }
        guard !Task.isCancelled else { return .miss }
        switch result {
        case .found(let product):
            return fillFromProduct(product)
        case .notFound:
            prefillStatus = .productNotFound
        case .unsupported:
            prefillStatus = .barcodeUnsupported
        case .unavailable:
            recordLookupFailure(Self.unknownLookupFailure)
        }
        return .miss
    }

    private func recordLookupFailure(_ error: PopsError) {
        scanFailure = error
        prefillStatus = .lookupFailed(error)
    }

    private static var unknownLookupFailure: PopsError {
        PopsError(
            code: "ios.barcode.unavailable",
            message: "Barcode lookup is unavailable. Try again or use text.",
            retryable: true, kind: .server)
    }

    internal func cancelScanPrefill() {
        fillTask?.cancel()
        fillTask = nil
    }

    internal func canPresentScanner(
        camera: any CameraAuthorizing, isScannerAvailable: @MainActor () -> Bool
    ) async -> Bool {
        let access = await camera.requestAccess()
        guard !Task.isCancelled else { return false }
        switch access {
        case .authorized:
            guard isScannerAvailable() else {
                prefillStatus = .scannerUnavailable
                return false
            }
            return true
        case .denied, .restricted, .notDetermined:
            prefillStatus = .cameraDenied
        case .unavailable:
            prefillStatus = .scannerUnavailable
        }
        return false
    }

    private func fillFromProduct(_ product: InventoryBarcodeProduct) -> InventoryScanOutcome {
        guard let currentDraft = protocol2Draft, let type = protocol2Type else {
            prefillStatus = .nothingFound
            return .miss
        }
        if draft.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            draft.name = product.title
        }
        let source = InventoryPrefillSource.product(InventoryBarcodeFacts.facts(product))
        let deterministicValues = InventoryBarcodeFacts.deterministicValues(
            product, fields: type.fields)
        startPrefill(
            source: source, type: type, currentDraft: currentDraft,
            initialValues: deterministicValues)
        return .found
    }

    private func scannedIdentifier(_ payload: String) -> InventoryIdentifierDraft {
        if payload.utf8.count == 13,
            payload.utf8.allSatisfy({ (48...57).contains($0) }),
            payload.hasPrefix("978") || payload.hasPrefix("979"),
            let normalised = InventoryISBN.normalised(payload)
        {
            return InventoryIdentifierDraft(kind: .isbn, value: normalised)
        }
        return InventoryIdentifierDraft(kind: .barcode, value: payload)
    }
}
