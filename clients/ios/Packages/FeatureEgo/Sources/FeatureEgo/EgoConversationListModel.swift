import AppCore
import Foundation
import Observation

/// The state rendered by the Ego conversation list.
public enum EgoConversationListState: Hashable, Sendable {
    case loading
    case loaded([EgoConversation])
    case empty
    case failed(RepositoryError)
}

/// Loads and searches the conversations available from an Ego repository.
@MainActor
@Observable
public final class EgoConversationListModel {
    /// The latest list result.
    public private(set) var state: EgoConversationListState = .loading
    /// The current title search text.
    public var query = ""

    @ObservationIgnored private let repository: any EgoRepository
    @ObservationIgnored private var activeRequestID: UUID?

    /// Creates a conversation list backed by an Ego repository.
    public init(repository: any EgoRepository) {
        self.repository = repository
    }

    /// Loads the current query from the first page.
    public func load() async {
        await read(query: query, preservingRows: false)
    }

    /// Refreshes the current query, keeping a successful result visible while it runs.
    public func refresh() async {
        let preservesRows: Bool
        if case .loaded = state {
            preservesRows = true
        } else {
            preservesRows = false
        }
        await read(query: query, preservingRows: preservesRows)
    }

    /// Stores and loads a new title search.
    public func search(_ query: String) async {
        self.query = query
        await read(query: query, preservingRows: false)
    }

    private func read(query: String, preservingRows: Bool) async {
        let requestID = UUID()
        activeRequestID = requestID
        if !preservingRows {
            state = .loading
        }

        let hasQuery = !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        do {
            let conversations = try await repository.conversations(
                limit: 50,
                offset: 0,
                query: hasQuery ? query : nil
            )
            guard activeRequestID == requestID else { return }
            if conversations.isEmpty && !hasQuery {
                state = .empty
            } else {
                state = .loaded(conversations)
            }
        } catch {
            guard activeRequestID == requestID else { return }
            if preservingRows, case .loaded = state {
                return
            }
            state = .failed((error as? RepositoryError) ?? .unavailable)
        }
    }
}
