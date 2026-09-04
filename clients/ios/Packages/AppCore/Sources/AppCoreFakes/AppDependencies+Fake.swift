import AppCore

extension AppDependencies {
    /// A fully fake container, so a feature test wires one line rather than one
    /// per protocol as this list grows.
    public static func fake(
        transactions: any TransactionsRepository = InMemoryTransactionsRepository(),
        pairing: any DevicePairingService = FakeDevicePairingService(),
        reachability: any ReachabilityWitness = FakeReachabilityWitness(),
        receiptCapture: any ReceiptCaptureRepository = InMemoryReceiptCaptureRepository(),
        purchases: any PurchasesRepository = InMemoryPurchasesRepository(),
        accounts: any AccountsRepository = InMemoryAccountsRepository()
    ) -> AppDependencies {
        AppDependencies(
            transactions: transactions, pairing: pairing, reachability: reachability,
            receiptCapture: receiptCapture, purchases: purchases, accounts: accounts)
    }
}
