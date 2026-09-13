/// What `receipt.extract` answered, before anything is saved (POPS-2454).
///
/// Two arms, matching the BFM's own separation of extraction from
/// persistence: every USABLE reading is ``draft(_:)``, reconciled or not —
/// ``ReceiptDraftReading/reconciled`` is what tells the two apart, not the
/// case — and only a reading with nothing to edit is ``unreadable``.
public enum ReceiptExtraction: Hashable, Sendable {
    case draft(ReceiptDraftReading)
    case unreadable(receiptCount: Int, reason: String)
}

/// A receipt read into fields a reviewer can edit.
///
/// ``extracted`` is carried in ``ExtractedReceipt``'s own shape — the same
/// one ``ReceiptOutcome/needsReview(receiptCount:failures:extracted:)``
/// used — so ``ReceiptDraftPresentation`` builds a ``ReceiptDraft`` from
/// either arm through the one function. The BFM's draft is cents-and-facts;
/// turning that back into printed-looking text is the repository's job
/// (`BFMReceiptCaptureRepository`), done once, at the boundary this type
/// marks.
public struct ReceiptDraftReading: Hashable, Sendable {
    public let receiptUris: [String]
    /// Whether the receipt's own arithmetic agreed with its stated total.
    public let reconciled: Bool
    /// The gate's objections when ``reconciled`` is false; empty otherwise.
    public let failures: [ReceiptGateFailure]
    public let extracted: ExtractedReceipt
    /// Opaque facts about when and where this was captured, carried forward
    /// unread and handed back verbatim on save — see ``ReceiptCaptureFacts``.
    public let capture: ReceiptCaptureFacts?

    public init(
        receiptUris: [String],
        reconciled: Bool,
        failures: [ReceiptGateFailure],
        extracted: ExtractedReceipt,
        capture: ReceiptCaptureFacts?
    ) {
        self.receiptUris = receiptUris
        self.reconciled = reconciled
        self.failures = failures
        self.extracted = extracted
        self.capture = capture
    }
}

/// What the device and the photograph said about themselves, as `purchases`
/// resolved it. Nothing on the phone inspects this — it exists only to
/// travel from ``ReceiptCaptureRepository/extract(_:)`` back to
/// ``ReceiptCaptureRepository/saveDraft(_:)`` unread, so a save preserves the
/// capture metadata an extraction resolved.
public struct ReceiptCaptureFacts: Hashable, Sendable {
    public let capturedAt: String?
    public let capturedAtSource: String?
    public let utcOffsetMinutes: Int?
    public let declaredTimeZone: String?
    public let latitude: Double?
    public let longitude: Double?
    public let locationSource: String?

    public init(
        capturedAt: String?,
        capturedAtSource: String?,
        utcOffsetMinutes: Int?,
        declaredTimeZone: String?,
        latitude: Double?,
        longitude: Double?,
        locationSource: String?
    ) {
        self.capturedAt = capturedAt
        self.capturedAtSource = capturedAtSource
        self.utcOffsetMinutes = utcOffsetMinutes
        self.declaredTimeZone = declaredTimeZone
        self.latitude = latitude
        self.longitude = longitude
        self.locationSource = locationSource
    }
}

/// One line, ready to persist — a plain quantity and cent figures, not
/// printed text.
public struct ReceiptSaveLine: Hashable, Sendable {
    public let name: String
    public let quantity: Int?
    public let unitPriceCents: Int
    public let lineTotalCents: Int
    public let notes: [String]

    public init(
        name: String, quantity: Int?, unitPriceCents: Int, lineTotalCents: Int, notes: [String]
    ) {
        self.name = name
        self.quantity = quantity
        self.unitPriceCents = unitPriceCents
        self.lineTotalCents = lineTotalCents
        self.notes = notes
    }
}

/// One receipt image already stored, referenced by a save.
public struct ReceiptSaveDocument: Hashable, Sendable {
    public let documentUri: String

    public init(documentUri: String) {
        self.documentUri = documentUri
    }
}

/// Everything a reviewer can edit before a receipt-derived draft — or a
/// purchase typed by hand — is saved. Mirrors the BFM's own draft-save body,
/// field for field.
public struct ReceiptPurchaseDraftFields: Hashable, Sendable {
    public let merchantName: String?
    /// ISO-8601 with an offset — the date and time the reviewer confirmed.
    public let orderedAt: String
    public let currency: String
    public let totalCents: Int
    public let taxCents: Int?
    public let surchargeCents: Int?
    public let shippingCents: Int?
    public let discountCents: Int?
    public let items: [ReceiptSaveLine]
    public let capture: ReceiptCaptureFacts?
    /// Chosen by this device, not by the BFM — the same key resubmitted
    /// refuses as a retry rather than writing a second purchase.
    public let idempotencyKey: String

    public init(
        merchantName: String?,
        orderedAt: String,
        currency: String,
        totalCents: Int,
        taxCents: Int?,
        surchargeCents: Int?,
        shippingCents: Int?,
        discountCents: Int?,
        items: [ReceiptSaveLine],
        capture: ReceiptCaptureFacts?,
        idempotencyKey: String
    ) {
        self.merchantName = merchantName
        self.orderedAt = orderedAt
        self.currency = currency
        self.totalCents = totalCents
        self.taxCents = taxCents
        self.surchargeCents = surchargeCents
        self.shippingCents = shippingCents
        self.discountCents = discountCents
        self.items = items
        self.capture = capture
        self.idempotencyKey = idempotencyKey
    }
}

/// `saveDraft` — a corrected receipt-derived draft becoming a purchase.
public struct ReceiptDraftSavePayload: Hashable, Sendable {
    public let fields: ReceiptPurchaseDraftFields
    /// At least one — a save with nothing attached is a manual entry, not a
    /// receipt-derived save.
    public let documents: [ReceiptSaveDocument]

    public init(fields: ReceiptPurchaseDraftFields, documents: [ReceiptSaveDocument]) {
        self.fields = fields
        self.documents = documents
    }
}

/// `createManualPurchase` — a purchase typed by hand, no receipt.
public struct ReceiptManualPurchasePayload: Hashable, Sendable {
    public let fields: ReceiptPurchaseDraftFields

    public init(fields: ReceiptPurchaseDraftFields) {
        self.fields = fields
    }
}
