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
    func purchases(after cursor: String?) async throws -> PurchasePage {
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
