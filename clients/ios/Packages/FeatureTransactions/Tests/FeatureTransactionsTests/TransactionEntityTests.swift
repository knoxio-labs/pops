import AppCore
import AppCoreFakes
import Testing

@testable import FeatureTransactions

@MainActor
@Suite("Transaction entity")
internal struct TransactionEntityTests {
    @Test("parses a finance transaction URI")
    func parsesTransactionURI() {
        let entity = TransactionEntity(PopsURI(pillar: "finance", type: "transaction", id: "t1"))

        #expect(entity?.transactionId == "t1")
        #expect(entity?.id == "t1")
    }

    @Test("rejects URIs for other domains and types")
    func rejectsOtherURIs() {
        #expect(TransactionEntity(PopsURI(pillar: "finance", type: "account", id: "a1")) == nil)
        #expect(
            TransactionEntity(PopsURI(pillar: "purchases", type: "transaction", id: "t1")) == nil)
    }

    @Test("every declared transaction type parses")
    func everyDeclaredTypeParses() {
        #expect(
            TransactionEntity.types.allSatisfy {
                TransactionEntity(PopsURI(pillar: TransactionEntity.pillar, type: $0, id: "t1"))
                    != nil
            }
        )
    }

    @Test("the detail model loads the id from its entity")
    func detailModelLoadsEntityID() async {
        guard
            let entity = TransactionEntity(
                PopsURI(pillar: "finance", type: "transaction", id: "t1"))
        else {
            Issue.record("the transaction URI should produce an entity")
            return
        }

        let repository = ScriptedTransactionsRepository(detailScript: [.gone])
        let model = TransactionDetailViewModel(
            id: entity.transactionId,
            seed: nil,
            dependencies: .fake(transactions: repository)
        )

        await model.load()

        #expect(await repository.requestedDetailIDs == [entity.transactionId])
    }
}
