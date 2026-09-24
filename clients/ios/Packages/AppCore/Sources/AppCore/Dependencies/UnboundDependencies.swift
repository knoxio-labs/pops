import Foundation

internal struct UnboundTransactionsRepository: TransactionsRepository {
    func transactions(after cursor: String?) async throws -> TransactionPage {
        throw RepositoryError.dependencyNotBound
    }

    func transactionDetail(id: Transaction.ID) async throws -> TransactionDetail? {
        throw RepositoryError.dependencyNotBound
    }
}

internal struct UnboundDevicePairingService: DevicePairingService {
    func pair(_ request: PairingRequest) async throws -> PairedDevice {
        throw PairingError.dependencyNotBound
    }
}

internal struct UnboundReachabilityWitness: ReachabilityWitness {
    func noteReachable() async {}
}

internal struct UnboundReceiptCaptureRepository: ReceiptCaptureRepository {
    func extract(_ parts: [ReceiptPart]) async throws -> ReceiptExtraction {
        throw RepositoryError.dependencyNotBound
    }

    func saveDraft(_ payload: ReceiptDraftSavePayload) async throws -> ReceiptPurchase {
        throw RepositoryError.dependencyNotBound
    }

    func createManualPurchase(_ payload: ReceiptManualPurchasePayload) async throws
        -> ReceiptPurchase
    {
        throw RepositoryError.dependencyNotBound
    }
}

internal struct UnboundPurchasesRepository: PurchasesRepository {
    func search(
        text: String, status: PurchaseSearchStatus, tags: Set<String>
    ) async throws -> [PurchaseSearchHit] {
        throw RepositoryError.dependencyNotBound
    }

    func purchaseTags() async throws -> [PurchaseTagCount] {
        throw RepositoryError.dependencyNotBound
    }

    func purchases(
        after cursor: String?, statusFilter: PurchaseStatusFilter
    ) async throws -> PurchasePage {
        throw RepositoryError.dependencyNotBound
    }

    func monthSummary(for month: Date) async throws -> PurchasesMonthSummary {
        throw RepositoryError.dependencyNotBound
    }

    func purchaseDetail(id: Purchase.ID) async throws -> PurchaseDetail? {
        throw RepositoryError.dependencyNotBound
    }

    func updatePurchase(id: Purchase.ID, _ update: PurchaseUpdate) async throws -> PurchaseDetail? {
        throw RepositoryError.dependencyNotBound
    }

    func receiptThumbnail(sha256: String) async throws -> ReceiptImage? {
        throw RepositoryError.dependencyNotBound
    }

    func receiptImage(sha256: String) async throws -> ReceiptImage? {
        throw RepositoryError.dependencyNotBound
    }
}

internal struct UnboundMerchantDirectoryRepository: MerchantDirectoryRepository {
    func search(_ query: String) async throws -> [MerchantDirectoryEntry] {
        throw RepositoryError.dependencyNotBound
    }

    func get(_ id: String) async throws -> MerchantDirectoryEntry? {
        throw RepositoryError.dependencyNotBound
    }

    func create(name: String) async throws -> MerchantDirectoryEntry {
        throw RepositoryError.dependencyNotBound
    }

    func addresses(forMerchant id: String) async throws -> [MerchantAddressEntry] {
        throw RepositoryError.dependencyNotBound
    }

    func createAddress(
        forMerchant id: String,
        value: String
    ) async throws -> MerchantAddressEntry {
        throw RepositoryError.dependencyNotBound
    }
}

internal struct UnboundAccountsRepository: AccountsRepository {
    func accounts() async throws -> [Account] {
        throw RepositoryError.dependencyNotBound
    }

    func accountDetail(id: Account.ID) async throws -> AccountDetail? {
        throw RepositoryError.dependencyNotBound
    }
}

/// Public, unlike every other `Unbound*` type here: it is also
/// `AppDependencies.init(inventory:)`'s default value (see the comment
/// there), and a default argument's expression is compiled into every
/// calling module, which means the initializer it calls has to be visible
/// there too.
public struct UnboundInventoryStore: InventoryStore {
    public init() {}

    public func observe<Value: Sendable>(_ query: InventoryQuery<Value>) -> AsyncStream<Value> {
        AsyncStream { $0.finish() }
    }

    public func perform(_ command: InventoryCommand) async throws -> InventoryReceipt {
        throw RepositoryError.dependencyNotBound
    }

    public func undo(_ receipt: InventoryReceipt) async throws {
        throw RepositoryError.dependencyNotBound
    }

    public func resolve(
        _ repairId: InventoryRepair.ID, with choice: InventoryRepairChoice
    ) async throws {
        throw RepositoryError.dependencyNotBound
    }

    public func download() async throws {
        throw RepositoryError.dependencyNotBound
    }

    public func refresh() async {}

    /// `false`, so an unbound store's `syncNow()` calls the no-op `refresh()`
    /// rather than a `download()` that only throws `dependencyNotBound`.
    public func hasNeverDownloaded() async -> Bool { false }

    public func photo(_ sha256: String, variant: InventoryPhotoVariant) async throws -> Data {
        throw RepositoryError.dependencyNotBound
    }

    public func uploadPhoto(
        sha256: String, data: Data, contentType: InventoryMediaContentType
    ) async throws -> InventoryMediaUploadResult {
        throw RepositoryError.dependencyNotBound
    }

    public func discardPhoto(_ sha256: String) async throws {
        throw RepositoryError.dependencyNotBound
    }

    public func status() -> AsyncStream<InventoryReplicaStatus> {
        AsyncStream { $0.finish() }
    }

    public func settleTypeArrival(typeKey: String) async throws {
        throw RepositoryError.dependencyNotBound
    }
}

/// Public for the same reason `UnboundInventoryStore` is: it is
/// `AppDependencies.init(codeSuggestions:)`'s default value.
///
/// Throws `suggestionsUnavailable` rather than `RepositoryError
/// .dependencyNotBound`: an unpaired or unbound phone answers a suggestion
/// request exactly the way a paired one does when its server cannot suggest
/// right now, which is the approved unavailable assist state, not a crash or
/// a distinct error screen.
public struct UnboundInventoryCodeSuggestionService: InventoryCodeSuggestionService {
    public init() {}

    public func suggestCodes(name: String, typeKey: String?, stem: String?) async throws -> [String]
    {
        throw InventorySyncTransportError.suggestionsUnavailable
    }
}
