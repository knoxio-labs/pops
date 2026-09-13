import AppCore

// Turning what a screen holds into what the BFM's contract expects.
//
// Split from BFMReceiptCaptureRepository.swift on the seam that file already
// marked: the two halves share only the repository they extend, and together
// they exceeded the file-length cap.

// MARK: - request mapping

extension BFMReceiptCaptureRepository {
    static func saveDraftBody(
        from payload: ReceiptDraftSavePayload
    ) -> SaveReceiptDraft.Input.Body.JsonPayload {
        SaveReceiptDraft.Input.Body.JsonPayload(
            capture: captureWire(payload.fields.capture),
            currency: payload.fields.currency,
            discountCents: payload.fields.discountCents,
            documents: payload.documents.map {
                SaveReceiptDraftDocument(documentUri: $0.documentUri, kind: .receipt)
            },
            idempotencyKey: payload.fields.idempotencyKey,
            items: payload.fields.items.map(saveDraftItem(from:)),
            merchantName: payload.fields.merchantName,
            orderedAt: payload.fields.orderedAt,
            shippingCents: payload.fields.shippingCents,
            surchargeCents: payload.fields.surchargeCents,
            taxCents: payload.fields.taxCents,
            totalCents: payload.fields.totalCents
        )
    }

    static func manualBody(
        from payload: ReceiptManualPurchasePayload
    ) -> CreateManualPurchase.Input.Body.JsonPayload {
        CreateManualPurchase.Input.Body.JsonPayload(
            capture: manualCaptureWire(payload.fields.capture),
            currency: payload.fields.currency,
            discountCents: payload.fields.discountCents,
            idempotencyKey: payload.fields.idempotencyKey,
            items: payload.fields.items.map(manualItem(from:)),
            merchantName: payload.fields.merchantName,
            orderedAt: payload.fields.orderedAt,
            shippingCents: payload.fields.shippingCents,
            surchargeCents: payload.fields.surchargeCents,
            taxCents: payload.fields.taxCents,
            totalCents: payload.fields.totalCents
        )
    }

    static func saveDraftItem(from line: ReceiptSaveLine) -> SaveReceiptDraftItem {
        SaveReceiptDraftItem(
            lineTotalCents: line.lineTotalCents,
            name: line.name,
            notes: line.notes,
            quantity: line.quantity,
            unitPriceCents: line.unitPriceCents
        )
    }

    static func manualItem(from line: ReceiptSaveLine) -> CreateManualPurchaseItem {
        CreateManualPurchaseItem(
            lineTotalCents: line.lineTotalCents,
            name: line.name,
            notes: line.notes,
            quantity: line.quantity,
            unitPriceCents: line.unitPriceCents
        )
    }

    static func captureWire(_ facts: ReceiptCaptureFacts?) -> SaveReceiptDraftCapture? {
        guard let facts else { return nil }
        return SaveReceiptDraftCapture(
            capturedAt: facts.capturedAt,
            capturedAtSource: SaveReceiptDraftCapture.CapturedAtSourcePayload(
                rawValue: facts.capturedAtSource ?? ""),
            declaredTimeZone: facts.declaredTimeZone,
            latitude: facts.latitude,
            locationSource: SaveReceiptDraftCapture.LocationSourcePayload(
                rawValue: facts.locationSource ?? ""),
            longitude: facts.longitude,
            utcOffsetMinutes: facts.utcOffsetMinutes
        )
    }

    static func manualCaptureWire(_ facts: ReceiptCaptureFacts?)
        -> CreateManualPurchase.Input.Body.JsonPayload.CapturePayload?
    {
        guard let facts else { return nil }
        return CreateManualPurchase.Input.Body.JsonPayload.CapturePayload(
            capturedAt: facts.capturedAt,
            capturedAtSource: CreateManualPurchase.Input.Body.JsonPayload.CapturePayload
                .CapturedAtSourcePayload(rawValue: facts.capturedAtSource ?? ""),
            declaredTimeZone: facts.declaredTimeZone,
            latitude: facts.latitude,
            locationSource: CreateManualPurchase.Input.Body.JsonPayload.CapturePayload
                .LocationSourcePayload(rawValue: facts.locationSource ?? ""),
            longitude: facts.longitude,
            utcOffsetMinutes: facts.utcOffsetMinutes
        )
    }
}
