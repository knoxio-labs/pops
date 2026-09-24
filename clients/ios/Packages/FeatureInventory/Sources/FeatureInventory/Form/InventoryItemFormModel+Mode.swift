extension InventoryItemFormModel {
    internal var mode: InventoryItemFormMode {
        switch request {
        case .create: .create
        case .edit, .labelling: .edit
        case .repair: repairMode
        }
    }

    /// Edit item, whatever the held change was: from the person's side it is
    /// the change they made, being corrected.
    internal var title: String {
        if case .repair = request { return InventoryItemFormMode.edit.title }
        return mode.title
    }

    internal var actionTitle: String {
        if case .repair = request { return InventoryItemFormMode.edit.actionTitle }
        return mode.actionTitle
    }

    /// Whether the code field should take focus as soon as the form is
    /// ready: true only when Item detail opened this as "Label it" rather
    /// than an ordinary edit.
    internal var focusesCode: Bool {
        if case .labelling = request { return true }
        return false
    }
}
