import AppCore
import Foundation

internal struct SearchRecentsStore {
    internal static let key = "search.recents"
    internal static let limit = 6

    private let defaults: UserDefaults

    internal init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    internal func load() -> [SearchRecent] {
        guard let data = defaults.data(forKey: Self.key) else { return [] }
        return (try? JSONDecoder().decode([SearchRecent].self, from: data)) ?? []
    }

    internal func save(_ recents: [SearchRecent]) {
        guard let data = try? JSONEncoder().encode(recents) else { return }
        defaults.set(data, forKey: Self.key)
    }

    internal func migrating(inventoryQueries: [String]) -> [SearchRecent] {
        guard defaults.object(forKey: Self.key) == nil else { return load() }
        var migrated: [SearchRecent] = []
        for query in inventoryQueries.reversed() {
            migrated = Self.adding(query, scope: .pillar(.inventory), to: migrated)
        }
        guard !migrated.isEmpty else { return [] }
        save(migrated)
        return migrated
    }

    internal static func adding(
        _ query: String,
        scope: SearchScope,
        to recents: [SearchRecent]
    ) -> [SearchRecent] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return recents }
        let others = recents.filter {
            $0.scope != scope || $0.query.caseInsensitiveCompare(trimmed) != .orderedSame
        }
        return Array(([SearchRecent(query: trimmed, scope: scope)] + others).prefix(limit))
    }
}
