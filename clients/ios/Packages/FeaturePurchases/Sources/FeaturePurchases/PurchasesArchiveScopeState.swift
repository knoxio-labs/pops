import AppCore

internal enum TopLevelState: Equatable, Sendable {
    case loading
    case failed(RepositoryError)
    case loaded
}

internal struct ScopeState: Sendable {
    internal var purchases: [Purchase] = []
    internal var cursor: String?
    internal var requestedCursors: Set<String> = []
    internal var hasLoaded = false
    internal var isLoadingFirstPage = false
    internal var totalCount: Int?
    internal var topLevel: TopLevelState = .loading
    internal var paging: ArchivePaging = .idle

    internal mutating func settleTransientLoading() {
        isLoadingFirstPage = false
        if hasLoaded, paging == .loading {
            paging = cursor == nil ? .end : .idle
        }
    }
}
