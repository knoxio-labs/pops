import AppCore

internal enum TopLevelState: Equatable, Sendable {
    case loading
    case failed(RepositoryError)
    case loaded
}

internal struct ScopeState: Sendable {
    internal var purchases: [Purchase] = []
    internal var cursor: String?
    internal var hasLoaded = false
    internal var isLoadingFirstPage = false
    internal var isFetchingNextPage = false
    internal var totalCount: Int?
    internal var topLevel: TopLevelState = .loading
    internal var paging: ArchivePaging = .loading

    internal mutating func settleTransientLoading() {
        let wasFetchingNextPage = isFetchingNextPage
        isLoadingFirstPage = false
        isFetchingNextPage = false
        if hasLoaded, wasFetchingNextPage {
            paging = cursor == nil ? .end : .loading
        }
    }
}
