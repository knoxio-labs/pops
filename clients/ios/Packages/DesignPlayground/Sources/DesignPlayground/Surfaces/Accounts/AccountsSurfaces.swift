/// Every playground surface `FeatureAccounts` contributes: the list, one
/// account's dashboard, and the picker sheet.
///
/// Split across three sibling files — `AccountsListSurface.swift`,
/// `AccountsDetailSurface.swift` and `AccountsPickerSurface.swift` — for the
/// same reason `TransactionsSurfaces` is split: a `DesignSurface` with every
/// state it needs inline already fills a file on its own. All three stage the
/// actual `AccountsListView`/`AccountDetailView`/`AccountPickerView` the app
/// ships, against a ``PlaygroundAccountsRepository`` rather than a look-alike —
/// see `Catalog.swift` for why every surface here can afford to depend on a
/// real feature's views and still never touch a network.
internal enum AccountsSurfaces {
    @MainActor internal static let surfaces: [DesignSurface] = [
        listSurface, detailSurface, pickerSurface,
    ]
}
