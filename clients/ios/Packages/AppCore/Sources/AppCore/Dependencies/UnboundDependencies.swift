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
    func capture(_ parts: [ReceiptPart]) async throws -> ReceiptOutcome {
        throw RepositoryError.dependencyNotBound
    }
}
