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

    internal func handleScannedBarcode(_ payload: String) async -> InventoryScanOutcome {
        cancelScanPrefill()
        let identifier = scannedIdentifier(payload)
        if !draft.identifiers.contains(where: {
            $0.kind == identifier.kind && $0.value == identifier.value
        }) {
            draft.identifiers.append(identifier)
        }
        guard !isOffline else {
            prefillStatus = .lookupUnavailable
            return .miss
        }

        let result = try? await scan.lookUp(payload)
        guard !Task.isCancelled else { return .miss }
        switch result {
        case .found(let product):
            return fillFromProduct(product)
        case .notFound:
            prefillStatus = .productNotFound
        case .unavailable, nil:
            prefillStatus = .lookupUnavailable
        }
        return .miss
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
        let typeId = currentDraft.typeId
        let source = InventoryPrefillSource.product(InventoryBarcodeFacts.facts(product))
        prefillStatus = .running
        fillTask = Task {
            let values = await scan.engine.fill(source: source, type: type, draft: currentDraft)
            guard !Task.isCancelled else { return }
            applySuggestions(values, forTypeId: typeId)
        }
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
