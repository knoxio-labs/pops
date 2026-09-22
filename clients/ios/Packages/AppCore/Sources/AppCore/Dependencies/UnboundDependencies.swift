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

    func receiptThumbnail(sha256: String) async throws -> ReceiptImage? {
        throw RepositoryError.dependencyNotBound
    }

    func receiptImage(sha256: String) async throws -> ReceiptImage? {
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
