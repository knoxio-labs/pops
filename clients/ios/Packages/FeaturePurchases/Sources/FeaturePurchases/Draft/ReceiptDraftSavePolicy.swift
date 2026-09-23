extension ReceiptDraftView {
    /// Whether either save can be pressed. Held while one is in flight, which
    /// is half of what stops a double tap creating two purchases. Public so a
    /// host committing from its own navigation bar gates on the same rule.
    public static func canSave(_ draft: ReceiptDraft, isSaving: Bool) -> Bool {
        draft.isSaveable && !isSaving
    }

    /// The same rule, plus the navigation bar's: there has to be something
    /// new to write.
    internal static func canSave(
        _ draft: ReceiptDraft, isSaving: Bool, changedFrom opened: ReceiptDraft
    ) -> Bool {
        canSave(draft, isSaving: isSaving) && draft != opened
    }
}
