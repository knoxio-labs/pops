extension InventoryItemFormModel {
    internal var mode: InventoryItemFormMode {
        switch request {
        case .create: .create
        case .edit: .edit
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
}
