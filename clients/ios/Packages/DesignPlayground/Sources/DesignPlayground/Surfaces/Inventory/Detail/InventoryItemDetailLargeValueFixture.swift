extension InventoryItemDetailFixtures {
    /// A long-text field and a many-valued field with many entries — the
    /// state POPS-4359's large-value gap review is about. Item detail is one
    /// scroll view with no list of its own to defer into, so a value long
    /// enough to matter here collapses behind "Show more"
    /// (`InventoryPropertyLine`) instead of lengthening the page.
    internal static let largeValues = InventoryItemDetail(
        item: InventoryFoundationFixtures.passport,
        fields: [
            InventoryDetailField(
                key: "Notes",
                value: Array(
                    repeating:
                        "Renewed at the consulate; keep with the spare passport photos and the "
                        + "old expired one until the new one has been used for international travel "
                        + "at least once.",
                    count: 6
                ).joined(separator: " ")),
            InventoryDetailField(
                key: "Tags",
                value: (1...40).map { "Stamp \($0)" }.joined(separator: " · ")),
        ]
    )
}
