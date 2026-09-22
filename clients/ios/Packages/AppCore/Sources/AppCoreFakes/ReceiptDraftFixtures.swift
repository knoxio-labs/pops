import AppCore

// Fakes for the receipt-draft write path (POPS-2454).
//
// Their own file rather than more of `Fixtures.swift`: that file was at the
// 250-line cap, and these four belong to one flow — a reviewed draft, and the
// manual purchase that shares its fields.

extension ReceiptSaveLine {
    public static func fake(
        name: String = "Fake item",
        quantity: Int? = nil,
        unitPriceCents: Int = 1000,
        lineTotalCents: Int = 1000,
        notes: [String] = [],
        listPriceCents: Int? = nil,
        listPriceAsserted: Bool = false
    ) -> ReceiptSaveLine {
        ReceiptSaveLine(
            name: name, quantity: quantity, unitPriceCents: unitPriceCents,
            lineTotalCents: lineTotalCents, notes: notes, listPriceCents: listPriceCents,
            listPriceAsserted: listPriceAsserted)
    }
}

extension ReceiptPurchaseDraftFields {
    public static func fake(
        merchantName: String? = "Fake Store",
        merchantEntityId: String? = nil,
        merchantAddressId: String? = nil,
        merchantAddressText: String? = nil,
        orderedAt: String = "2026-01-01T09:30:00+00:00",
        currency: String = "AUD",
        totalCents: Int = 1000,
        taxCents: Int? = nil,
        surchargeCents: Int? = nil,
        shippingCents: Int? = nil,
        discountCents: Int? = nil,
        taxIncluded: Bool = false,
        discountIncluded: Bool = false,
        surchargeIncluded: Bool = false,
        shippingIncluded: Bool = false,
        items: [ReceiptSaveLine] = [ReceiptSaveLine.fake()],
        capture: ReceiptCaptureFacts? = nil,
        idempotencyKey: String = "fake-idempotency-key"
    ) -> ReceiptPurchaseDraftFields {
        ReceiptPurchaseDraftFields(
            merchantName: merchantName,
            merchantEntityId: merchantEntityId,
            merchantAddressId: merchantAddressId,
            merchantAddressText: merchantAddressText,
            orderedAt: orderedAt,
            currency: currency,
            totalCents: totalCents,
            taxCents: taxCents,
            surchargeCents: surchargeCents,
            shippingCents: shippingCents,
            discountCents: discountCents,
            taxIncluded: taxIncluded,
            discountIncluded: discountIncluded,
            surchargeIncluded: surchargeIncluded,
            shippingIncluded: shippingIncluded,
            items: items,
            capture: capture,
            idempotencyKey: idempotencyKey
        )
    }
}

extension ReceiptDraftSavePayload {
    public static func fake(
        fields: ReceiptPurchaseDraftFields = .fake(),
        documents: [ReceiptSaveDocument] = [
            ReceiptSaveDocument(documentUri: "pops://purchases/receipt/fake")
        ]
    ) -> ReceiptDraftSavePayload {
        ReceiptDraftSavePayload(fields: fields, documents: documents)
    }
}

extension ReceiptManualPurchasePayload {
    public static func fake(fields: ReceiptPurchaseDraftFields = .fake())
        -> ReceiptManualPurchasePayload
    {
        ReceiptManualPurchasePayload(fields: fields)
    }
}
