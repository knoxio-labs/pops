import Foundation

/// A reading of a receipt, as something the reader may change.
///
/// ## Why this is not a variant of ``ReceiptResultContent``
///
/// That type is a *reading*, projected for display: a field the extractor
/// produced nothing for is dropped, because a review screen padded with empty
/// labels reads as a record that failed to load. A draft is the opposite
/// object. Every field exists whether or not anything was read into it —
/// dropping the ones that came back empty would remove exactly the fields the
/// reader most needs to fill in, and a Salvos receipt whose items have no
/// names would offer nowhere to name them.
///
/// ## Editing is the ordinary path
///
/// There is no notion here of a field being locked, confirmed, or unlocked;
/// no per-field editability, no whole-draft mode. That absence is the design.
/// Most edits are not corrections of a mistake: `ZCHEETOS C&B BALLS` is
/// exactly what the till printed and exactly what nobody calls it, and the
/// reader renaming it is improving the data rather than rescuing it. A screen
/// that gated editing on the extractor's confidence would refuse precisely
/// that.
///
/// What the extractor was unsure about is still worth knowing, so it is
/// carried as ``hints`` — attached to the field it names, so it reads as
/// "look here" rather than as a verdict on the whole receipt. A hint never
/// changes what may be typed.
///
/// ## The original reading survives the edit
///
/// Every value keeps what the extractor produced (``ReceiptDraftValue``). A
/// correction can itself be the mistake, and the value wanted back is the one
/// the model read. `purchase_capture` already carries per-field provenance;
/// human correction is a third origin, and this is the shape it is carried in
/// on the handset.
public struct ReceiptDraft: Hashable, Sendable {
    internal var merchant: ReceiptDraftValue
    /// The contacts entity the merchant was picked from, when it was picked
    /// rather than typed.
    ///
    /// This is the operative half of the pair and the name is only its label
    /// — the invariant `pillars/purchases` keeps everywhere and the one
    /// POPS-3634 exists to carry through to the phone. A merchant typed as
    /// free text leaves this nil, which is honest: nothing resolved it.
    internal var merchantEntityID: String?
    internal var address: ReceiptDraftValue
    /// Bought online, so there is no branch to record.
    ///
    /// Not the same as an address the extractor failed to read. An empty
    /// address field on a screen for an online order is an invitation to
    /// invent one, and an address invented is worse than an address absent.
    internal var online: Bool
    /// As printed, verbatim. Not parsed into a `Date`: the extractor
    /// transcribes what the paper says, and running that through a formatter
    /// is how a form comes to state a day the receipt never did.
    internal var date: ReceiptDraftValue
    internal var lines: [ReceiptDraftLine]
    internal var adjustments: [ReceiptDraftAdjustment]
    internal var total: ReceiptDraftValue
    /// ISO-4217 as read, when the extractor resolved one. Not a field: the
    /// reader is checking amounts against paper printed in one currency, and
    /// a currency picker on this screen is a control whose only use is to
    /// make every amount wrong at once.
    internal let currency: String?
    /// What the gate complained about, against the field it names.
    internal let hints: [ReceiptDraftField: [String]]
    /// Complaints that name no single field — a receipt read as damaged is
    /// about the paper, not about the merchant line.
    internal let unattachedHints: [String]
    /// Whether the reading's own arithmetic reconciled, as the gate reported
    /// it. Never recomputed here: the amounts on this screen are strings the
    /// model transcribed, and a handset re-adding them would be a second
    /// opinion nobody asked for and a worse one.
    internal let readingReconciled: Bool
    /// The gate's own wording for how far out the sum was, when it was out.
    internal let reconciliationDetail: String?

    internal init(
        merchant: ReceiptDraftValue,
        merchantEntityID: String? = nil,
        address: ReceiptDraftValue,
        online: Bool = false,
        date: ReceiptDraftValue,
        lines: [ReceiptDraftLine],
        adjustments: [ReceiptDraftAdjustment],
        total: ReceiptDraftValue,
        currency: String?,
        hints: [ReceiptDraftField: [String]] = [:],
        unattachedHints: [String] = [],
        readingReconciled: Bool = true,
        reconciliationDetail: String? = nil
    ) {
        self.merchant = merchant
        self.merchantEntityID = merchantEntityID
        self.address = address
        self.online = online
        self.date = date
        self.lines = lines
        self.adjustments = adjustments
        self.total = total
        self.currency = currency
        self.hints = hints
        self.unattachedHints = unattachedHints
        self.readingReconciled = readingReconciled
        self.reconciliationDetail = reconciliationDetail
    }
}

// MARK: what the reader can do to it

extension ReceiptDraft {
    /// A row the model missed. Empty, at the foot, because a line invented
    /// with a plausible value pre-filled is a claim about the paper that
    /// nobody made.
    internal mutating func addLine() {
        lines.append(.blank(id: "added-\(UUID().uuidString)"))
    }

    /// A row the model invented. Deleting is as necessary as adding — a
    /// reading with a line that is not on the paper sums to a total that is
    /// not either.
    internal mutating func removeLine(id: String) {
        lines.removeAll { $0.id == id }
    }

    /// An adjustment the model never found.
    ///
    /// Without this a surcharge the reading missed cannot be corrected by
    /// editing what is on screen, because it is not on screen — and the only
    /// way forward is retyping the total, which hides the discrepancy instead
    /// of explaining it.
    ///
    /// Included defaults to false. A figure the reader is adding by hand is
    /// one the line prices demonstrably did not account for, or they would
    /// not have noticed it missing.
    internal mutating func addAdjustment(kind: ReceiptDraftAdjustment.Kind) {
        adjustments.append(
            ReceiptDraftAdjustment(
                id: "added-\(UUID().uuidString)",
                kind: kind,
                amount: ReceiptDraftValue(extracted: nil),
                isIncluded: false
            ))
    }

    internal mutating func removeAdjustment(id: String) {
        adjustments.removeAll { $0.id == id }
    }

    /// Which kinds are not on the form yet. One of each is enough: two tax
    /// rows on one receipt is a reading nobody should be helped to produce.
    internal var addableAdjustments: [ReceiptDraftAdjustment.Kind] {
        let present = Set(adjustments.map(\.kind))
        return ReceiptDraftAdjustment.Kind.allCases.filter { !present.contains($0) }
    }

    /// Whether the reader has moved any figure since the reading came back.
    ///
    /// The reconciliation the gate reported is a statement about the numbers
    /// the model read. The moment one of them changes it is a statement about
    /// numbers that are no longer on screen, and continuing to show it would
    /// be this screen vouching for arithmetic nobody has done.
    /// Whether the reader has moved any figure — or changed what the figures
    /// mean — since the reading came back.
    ///
    /// Toggling an adjustment's ``ReceiptDraftAdjustment/isIncluded`` counts,
    /// and that is the subtle one: it changes no number at all, and changes
    /// the arithmetic the gate's verdict was about. A reconciliation that
    /// survived it would be this screen vouching for a sum computed on the
    /// other assumption.
    internal var amountsEdited: Bool {
        total.isEdited || lines.contains { $0.amount.isEdited }
            || adjustments.contains { $0.amount.isEdited || $0.basisChanged }
            || adjustments.contains { !$0.wasExtracted }
    }

    /// What the screen may honestly say about whether this adds up.
    internal var reconciliation: ReceiptDraftReconciliation {
        if amountsEdited { return .notRechecked }
        if readingReconciled { return .reconciledAsRead }
        return .disputedAsRead(reconciliationDetail)
    }

    /// Everything standing between this draft and a save.
    ///
    /// Reported, never prevented. A field the reader has emptied stays
    /// empty and stays editable, and the screen it is on does not become a
    /// different screen — the problem is a line under one field, which is
    /// where the thing that is wrong actually is.
    internal var problems: [ReceiptDraftProblem] {
        var problems: [ReceiptDraftProblem] = []
        if total.isEmpty { problems.append(.totalMissing) }
        // A row with nothing in it is one the form offered, not one the
        // reader filled in badly. Reporting it would mean the blank form's
        // first frame accuses somebody of leaving out an amount they were
        // never asked for.
        for line in lines where line.amount.isEmpty && !line.isBlank {
            problems.append(.lineAmountMissing(lineID: line.id))
        }
        return problems
    }

    internal var isSaveable: Bool { problems.isEmpty }

    /// Whether the missing total is worth saying out loud yet.
    ///
    /// An empty form should not open with a red rule under a field nobody has
    /// touched — the Save that cannot be pressed already says the form is not
    /// finished, and a reader typing from the top will reach the total
    /// anyway. Once anything has been read into the form or entered into it,
    /// an empty total is a real omission and is named as one.
    internal var reportsMissingTotal: Bool {
        total.isEmpty && (total.wasExtracted || isEdited)
    }

    /// The problem to draw against one line, if any.
    internal func problem(forLine id: String) -> ReceiptDraftProblem? {
        problems.first { $0 == .lineAmountMissing(lineID: id) }
    }

    /// Whether anything at all differs from what the extractor read. What a
    /// caller needs to know before deciding a save is worth making.
    internal var isEdited: Bool {
        merchant.isEdited || address.isEdited || date.isEdited || total.isEdited
            || adjustments.contains { $0.amount.isEdited } || lines.contains { $0.isEdited }
            || lines.contains { !$0.wasExtracted && !$0.isBlank }
    }
}

/// One value the reader may change, and what the extractor read before they
/// did.
internal struct ReceiptDraftValue: Hashable, Sendable {
    /// What the extractor produced, trimmed, or `nil` when it produced
    /// nothing at all for this field.
    ///
    /// `nil` and `""` are different facts and both occur: the extractor
    /// reading no address, and the reader emptying an address it did read.
    /// Collapsing them loses the ability to say which of the two happened,
    /// which is the whole of what provenance is for.
    internal let extracted: String?
    internal var value: String

    internal init(extracted: String?) {
        let trimmed = extracted?.trimmed
        self.extracted = trimmed?.isEmpty == true ? nil : trimmed
        value = self.extracted ?? ""
    }

    /// The extractor produced something here.
    internal var wasExtracted: Bool { extracted != nil }

    /// The reader has changed it. Compared trimmed, so a trailing space is
    /// not an edit — a keyboard artefact is not a correction, and treating it
    /// as one would mark half a form as human-authored.
    internal var isEdited: Bool { value.trimmed != (extracted ?? "") }

    internal var isEmpty: Bool { value.trimmed.isEmpty }
}

/// One line as the receipt printed it, as something the reader may change.
///
/// The quantity and the unit note are separate values rather than the single
/// joined aside the read-only reading draws. Joined, they cannot be typed
/// back apart: `×2 $4.90/kg` is one string and two facts, and a form that
/// accepted it would have to guess which half a reader meant to change.
internal struct ReceiptDraftLine: Hashable, Sendable, Identifiable {
    internal let id: String
    internal var description: ReceiptDraftValue
    internal var amount: ReceiptDraftValue
    /// How many. Digits as typed rather than an `Int`, because a field that
    /// silently discards what it cannot parse is a field that eats a
    /// keystroke.
    internal var quantity: ReceiptDraftValue
    /// `$4.90/kg`, `2 @ $3.00` — whatever qualified the price.
    internal var unitNote: ReceiptDraftValue
    /// What the line would have cost at list — the `WAS 5.50` beside a
    /// `3.50`.
    ///
    /// Kept beside what was paid rather than instead of it: the charged
    /// figure is the operative one and the only one the gate checked, and a
    /// list price read off paper is checked against nothing. It is a separate
    /// field for that reason, not a second opinion about `amount`.
    internal var listPrice: ReceiptDraftValue

    internal init(
        id: String,
        description: ReceiptDraftValue,
        amount: ReceiptDraftValue,
        quantity: ReceiptDraftValue,
        unitNote: ReceiptDraftValue,
        listPrice: ReceiptDraftValue = ReceiptDraftValue(extracted: nil)
    ) {
        self.id = id
        self.description = description
        self.amount = amount
        self.quantity = quantity
        self.unitNote = unitNote
        self.listPrice = listPrice
    }

    /// A row the reader added. Nothing was extracted into any of it, which is
    /// what ``wasExtracted`` then reports.
    internal static func blank(id: String) -> ReceiptDraftLine {
        ReceiptDraftLine(
            id: id,
            description: ReceiptDraftValue(extracted: nil),
            amount: ReceiptDraftValue(extracted: nil),
            quantity: ReceiptDraftValue(extracted: nil),
            unitNote: ReceiptDraftValue(extracted: nil),
            listPrice: ReceiptDraftValue(extracted: nil)
        )
    }

    /// The model read this line off the paper. False for a row the reader
    /// added, which is the distinction a save has to carry: one is a
    /// correction of a reading, the other is an assertion the reading missed
    /// something.
    internal var wasExtracted: Bool {
        description.wasExtracted || amount.wasExtracted || quantity.wasExtracted
            || unitNote.wasExtracted || listPrice.wasExtracted
    }

    internal var isEdited: Bool {
        description.isEdited || amount.isEdited || quantity.isEdited || unitNote.isEdited
            || listPrice.isEdited
    }

    /// Nothing in it. A row the reader has been offered and not yet used —
    /// which is not the same as a row they added, and must not make an
    /// untouched form look authored.
    internal var isBlank: Bool {
        description.isEmpty && amount.isEmpty && quantity.isEmpty && unitNote.isEmpty
            && listPrice.isEmpty
    }

    /// Whether anything qualifies the price — a quantity, a unit note, a list
    /// price. What decides whether the row opens with its second tier showing.
    internal var hasQualifiers: Bool {
        !quantity.isEmpty || !unitNote.isEmpty || !listPrice.isEmpty
    }
}

/// What moves the line items to the stated total.
///
/// Kept apart from the lines for the reason the read-only reading keeps them
/// apart: a discount is not a thing that was bought, and a column mixing the
/// two is one a reader cannot run down.
internal struct ReceiptDraftAdjustment: Hashable, Sendable, Identifiable {
    internal let id: String
    internal let kind: Kind
    internal var amount: ReceiptDraftValue
    /// Whether this figure is already inside the line prices, or sits on top
    /// of them.
    ///
    /// Australian receipts print both conventions and a reading often cannot
    /// tell which it found. Without this, a reading whose every figure is
    /// right still fails its own total check, and the person correcting it has
    /// no field to fix — the numbers are all correct and the arithmetic
    /// assumption is not.
    internal var isIncluded: Bool
    /// What the extractor assumed, so a change to ``isIncluded`` can be told
    /// from the reading's own basis.
    internal let extractedIsIncluded: Bool

    internal init(
        id: String,
        kind: Kind,
        amount: ReceiptDraftValue,
        isIncluded: Bool = false
    ) {
        self.id = id
        self.kind = kind
        self.amount = amount
        self.isIncluded = isIncluded
        extractedIsIncluded = isIncluded
    }

    /// The reader has changed what the figure means, without changing it.
    internal var basisChanged: Bool { isIncluded != extractedIsIncluded }

    internal var wasExtracted: Bool { amount.wasExtracted }

    /// Which way it moves the total, and what it is called.
    internal enum Kind: Hashable, Sendable, CaseIterable {
        case tax
        case discount
        case surcharge
        case shipping

        internal var label: String {
            switch self {
            case .tax: ReceiptResultCopy.FieldLabel.tax
            case .discount: ReceiptResultCopy.FieldLabel.discounts
            case .surcharge: ReceiptResultCopy.FieldLabel.surcharges
            case .shipping: ReceiptResultCopy.FieldLabel.shipping
            }
        }
    }
}

/// The parts of the form a gate complaint can be about.
///
/// The complaint is drawn beside the field it names rather than in a list
/// above them. A list is a set of sentences the reader has to hold in mind
/// while looking elsewhere; beside the field it is a pointer at the thing to
/// look at, which is what the gate's detail — "left edge of the 2nd and 3rd
/// product description lines is distorted" — is actually for.
internal enum ReceiptDraftField: Hashable, Sendable, CaseIterable {
    case merchant
    case address
    case date
    case lines
    case adjustments
    case total
}

/// Something that has to be true before this draft can be saved.
internal enum ReceiptDraftProblem: Hashable, Sendable {
    /// A purchase with no total is not a purchase. The one figure that cannot
    /// be left out.
    case totalMissing
    /// A line with a name and no amount contributes nothing and breaks the
    /// sum. A line with an amount and no name is fine — that is a Salvos
    /// receipt, and the paper genuinely does not say.
    case lineAmountMissing(lineID: String)
}

/// What the screen may say about whether the figures add up.
internal enum ReceiptDraftReconciliation: Hashable, Sendable {
    /// The gate checked the model's reading and it balanced. Worth saying:
    /// it tells a reader who wants to rename three items which numbers they
    /// can leave alone.
    case reconciledAsRead
    /// The gate checked and it did not, with its own wording for how far out.
    case disputedAsRead(String?)
    /// A figure has been changed since, so neither of the above is a claim
    /// about what is on screen any more.
    case notRechecked
}

extension String {
    fileprivate var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
