/// The containers browser's own matching rule, pure so it can be tested
/// without a view: a container matches when its name, inventory code or
/// location contains the query, case-insensitively.
internal enum InventoryContainerSearchMatching {
    internal static func matches(_ query: String, profile: InventoryContainerProfile) -> Bool {
        let item = profile.item
        let haystacks = [item.name, item.code, locationText(item)].compactMap(\.self)
        return haystacks.contains { $0.localizedCaseInsensitiveContains(query) }
    }

    internal static func matching(
        _ query: String, in profiles: [InventoryContainerProfile]
    ) -> [InventoryContainerProfile] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return profiles }
        return profiles.filter { matches(trimmed, profile: $0) }
    }

    private static func locationText(_ item: InventoryFoundationItem) -> String {
        (item.placement.crumbs + [item.placement.effectiveLocation].compactMap { $0 })
            .joined(separator: " ")
    }
}
