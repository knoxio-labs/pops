import AppCore

/// A ``PurchasesRepository`` backed by an array, with server-shaped paging and failures.
public actor InMemoryPurchasesRepository: PurchasesRepository {
    /// One call recorded by ``InMemoryPurchasesRepository/search(query:after:limit:)``.
    public struct SearchCall: Equatable, Sendable {
        public let text: String
        public let kind: PurchaseSearchKind
        public let status: PurchaseSearchStatus
        public let tags: Set<String>
        public let cursor: String?
        public let limit: Int
    }

    /// One call recorded by ``InMemoryPurchasesRepository/purchaseTags(search:after:limit:)``.
    public struct TagsCall: Equatable, Sendable {
        public let search: String
        public let cursor: String?
        public let limit: Int
    }

    public private(set) var callCount = 0
    public private(set) var searchCalls: [SearchCall] = []
    public private(set) var tagsCalls: [TagsCall] = []

    var rows: [Purchase]
    let hits: [PurchaseSearchHit]
    let searchDelay: Duration
    let pageSize: Int
    private var failures: [Int: RepositoryError] = [:]
    var mintedCursors: [String: CursorRecord] = [:]
    var nextCursorID = 0
    let summary: PurchasesMonthSummary
    var details: [Purchase.ID: PurchaseDetail]
    let receipts: [String: ReceiptImage]
    let tagsInUse: [PurchaseTagCount]
    var mintedSearchCursors: [String: SearchCursorRecord] = [:]
    var mintedTagCursors: [String: TagsCursorRecord] = [:]

    struct CursorRecord {
        let offset: Int
        let statusFilter: PurchaseStatusFilter
    }

    struct SearchCursorRecord {
        let offset: Int
        let query: PurchaseSearchQuery
    }

    struct TagsCursorRecord {
        let offset: Int
        let search: String
    }

    /// Creates a repository whose pages contain at most `pageSize` purchases.
    public init(
        rows: [Purchase] = [],
        hits: [PurchaseSearchHit] = [],
        searchDelay: Duration = .zero,
        pageSize: Int = 5,
        summary: PurchasesMonthSummary = .empty,
        details: [PurchaseDetail] = [],
        receipts: [String: ReceiptImage] = [:],
        tagsInUse: [PurchaseTagCount] = []
    ) {
        self.rows = rows
        self.hits = hits
        self.searchDelay = searchDelay
        self.pageSize = max(1, pageSize)
        self.summary = summary
        self.details = Dictionary(uniqueKeysWithValues: details.map { ($0.id, $0) })
        self.receipts = receipts
        self.tagsInUse = tagsInUse
    }

    /// Replaces the rows and invalidates cursors minted for the previous list.
    public func replace(with rows: [Purchase]) {
        self.rows = rows
        mintedCursors = [:]
    }

    /// Fails the `call`-th request, numbered from one, with `error`.
    public func fail(onCall call: Int, with error: RepositoryError) {
        failures[call] = error
    }

    func beginCall() throws {
        callCount += 1
        if let failure = failures[callCount] { throw failure }
    }

    func record(_ call: SearchCall) {
        searchCalls.append(call)
    }

    func record(_ call: TagsCall) {
        tagsCalls.append(call)
    }

    func effectiveLimit(_ limit: Int) -> Int {
        min(max(1, limit), pageSize)
    }

    func mintCursor(prefix: String) -> String {
        nextCursorID += 1
        return "\(prefix)-\(nextCursorID)"
    }
}
