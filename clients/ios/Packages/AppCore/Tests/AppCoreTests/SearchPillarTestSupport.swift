import AppCore
import AppCoreFakes

internal struct SearchPillarTestHit: Identifiable, Sendable, Equatable {
    let id: Int

    init(_ id: Int) { self.id = id }
}

internal typealias SearchPillarTestProvider = ScriptedSearchProvider<SearchPillarTestHit, String>

internal enum SearchTest {
    static func page(
        _ ids: [Int], nextCursor: String? = nil, totalCount: Int? = nil
    ) -> SearchProviderPage<SearchPillarTestHit> {
        SearchProviderPage(
            hits: ids.map(SearchPillarTestHit.init), nextCursor: nextCursor, totalCount: totalCount)
    }

    static func step(
        _ event: SearchProviderEvent<SearchPillarTestHit>, after delay: Duration = .zero
    ) -> ScriptedSearchStep<SearchPillarTestHit> {
        ScriptedSearchStep(event: event, delay: delay)
    }
}

@MainActor
internal func eventually(
    _ condition: @escaping @MainActor () async -> Bool
) async -> Bool {
    for _ in 0..<100 {
        if await condition() { return true }
        try? await Task.sleep(for: .milliseconds(5))
    }
    return false
}
