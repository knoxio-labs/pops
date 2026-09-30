import AppCore
import Observation

@MainActor @Observable
internal final class PurchasesTagPickerModel {
    enum State: Equatable {
        case loading
        case failed(RepositoryError)
        case loaded
    }

    private(set) var state: State = .loading
    private(set) var tags: [PurchaseTagCount] = []
    private(set) var paging: SearchPagingState = .idle
    private(set) var pageRevision = 0

    @ObservationIgnored private let repository: any PurchasesRepository
    @ObservationIgnored private var cursor: String?
    @ObservationIgnored private var acceptedCursors: Set<String> = []
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var loadingGeneration: Int?
    @ObservationIgnored private var query = ""

    init(repository: any PurchasesRepository) {
        self.repository = repository
    }

    func updateQuery(_ query: String) {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed != self.query else { return }
        generation += 1
        self.query = trimmed
        tags = []
        cursor = nil
        acceptedCursors = []
        paging = .idle
        state = .loading
    }

    func load() async {
        guard case .loading = state, loadingGeneration != generation else { return }
        let currentGeneration = generation
        loadingGeneration = currentGeneration
        defer {
            if loadingGeneration == currentGeneration {
                loadingGeneration = nil
            }
        }

        do {
            let page = try await repository.purchaseTags(
                search: query, after: nil, limit: Self.pageSize)
            guard currentGeneration == generation else { return }
            applyFirstPage(page)
        } catch let error where error.isCancellation {
            return
        } catch {
            guard currentGeneration == generation else { return }
            state = .failed(RepositoryError.describing(error))
        }
    }

    func loadNextPageIfNeeded() async {
        guard paging == .idle else { return }
        await fetchNextPage()
    }

    func retryNextPage() async {
        guard paging == .failed else { return }
        await fetchNextPage()
    }

    func retryFirstPage() async {
        guard case .failed = state else { return }
        state = .loading
        await load()
    }

    private func fetchNextPage() async {
        guard let cursor else { return }
        let currentGeneration = generation
        paging = .loading

        do {
            let page = try await repository.purchaseTags(
                search: query, after: cursor, limit: Self.pageSize)
            guard currentGeneration == generation else { return }
            applyNextPage(page, requestedCursor: cursor)
        } catch let error where error.isCancellation {
            guard currentGeneration == generation else { return }
            paging = .idle
        } catch {
            guard currentGeneration == generation else { return }
            paging = .failed
        }
    }

    private func applyFirstPage(_ page: PurchaseTagPage) {
        tags = Self.unique(page.tags)
        cursor = page.nextCursor
        acceptedCursors = []
        if let cursor = page.nextCursor {
            acceptedCursors.insert(cursor)
        }
        state = .loaded
        paging = page.nextCursor == nil ? .exhausted : .idle
        pageRevision += 1
    }

    private func applyNextPage(_ page: PurchaseTagPage, requestedCursor: String) {
        var seen = Set(tags.map(\.tag))
        tags.append(contentsOf: Self.unique(page.tags).filter { seen.insert($0.tag).inserted })
        cursor = page.nextCursor
        pageRevision += 1
        if let nextCursor = page.nextCursor,
           nextCursor == requestedCursor || acceptedCursors.contains(nextCursor)
        {
            paging = .failed
            return
        }
        if let nextCursor = page.nextCursor {
            acceptedCursors.insert(nextCursor)
            paging = .idle
        } else {
            paging = .exhausted
        }
        state = .loaded
    }

    private static func unique(_ tags: [PurchaseTagCount]) -> [PurchaseTagCount] {
        var seen: Set<String> = []
        return tags.filter { seen.insert($0.tag).inserted }
    }

    private static let pageSize = 20
}
