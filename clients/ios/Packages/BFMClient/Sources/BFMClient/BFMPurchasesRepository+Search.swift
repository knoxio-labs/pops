import AppCore
import Foundation
import OpenAPIRuntime

extension BFMPurchasesRepository {
    public func search(
        text: String, status: PurchaseSearchStatus, tags: Set<String>
    ) async throws -> [PurchaseSearchHit] {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return [] }
        let output: SearchPurchases.Output
        do {
            output = try await client.generated.mobilePurchases_searchPurchases(
                query: .init(
                    q: text, status: Self.wireStatus(status),
                    tags: tags.isEmpty ? nil : tags.sorted())
            )
        } catch let error as ClientError {
            throw BFMRepositoryFailure.failure(error, operation: SearchPurchases.id)
        }

        switch output {
        case .ok(let ok):
            return try ok.body.json.hits.map { try hit(from: $0) }
        case .badRequest:
            throw RepositoryError.transport("\(SearchPurchases.id): invalid request")
        case .unauthorized, .forbidden:
            throw RepositoryError.unauthorized
        case .tooManyRequests:
            throw RepositoryError.transport("\(SearchPurchases.id): rate limited")
        case .badGateway(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code.rawValue, operation: SearchPurchases.id)
        case .serviceUnavailable(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code.rawValue, operation: SearchPurchases.id)
        case .undocumented(let statusCode, _):
            throw RepositoryError.transport(
                "\(SearchPurchases.id): undocumented status \(statusCode)"
            )
        }
    }

    public func purchaseTags() async throws -> [PurchaseTagCount] {
        let output: PurchaseTags.Output
        do {
            output = try await client.generated.mobilePurchases_purchaseTags(.init())
        } catch let error as ClientError {
            throw BFMRepositoryFailure.failure(error, operation: PurchaseTags.id)
        }

        switch output {
        case .ok(let ok):
            return try ok.body.json.tags.map { PurchaseTagCount(tag: $0) }
        case .badRequest:
            throw RepositoryError.transport("\(PurchaseTags.id): invalid request")
        case .unauthorized, .forbidden:
            throw RepositoryError.unauthorized
        case .tooManyRequests:
            throw RepositoryError.transport("\(PurchaseTags.id): rate limited")
        case .badGateway(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code.rawValue, operation: PurchaseTags.id)
        case .serviceUnavailable(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code.rawValue, operation: PurchaseTags.id)
        case .undocumented(let statusCode, _):
            throw RepositoryError.transport(
                "\(PurchaseTags.id): undocumented status \(statusCode)"
            )
        }
    }

    private static func wireStatus(
        _ status: PurchaseSearchStatus
    ) -> SearchPurchases.Input.Query.StatusPayload? {
        switch status {
        case .any: nil
        case .unmatched: .awaitingSettlement
        case .matched: .linked
        case .partial: .partial
        case .cash: .settledCash
        case .ignored: .ignored
        }
    }

    private func hit(from wire: SearchHit) throws -> PurchaseSearchHit {
        switch wire {
        case .case1(let purchase):
            return .purchase(
                try order(
                    id: purchase.id, merchantName: purchase.merchantName,
                    orderedOn: purchase.orderedOn,
                    total: MoneyAmount(
                        minorUnits: purchase.totalCents, currencyCode: purchase.currency),
                    status: purchase.status),
                printedMatch: Self.nonBlank(purchase.matchedText)
            )
        case .case2(let line):
            return .line(
                id: line.id,
                name: line.name,
                quantity: line.quantity,
                lineTotal: MoneyAmount(
                    minorUnits: line.lineTotalCents, currencyCode: line.currency),
                order: try order(
                    id: line.purchaseId, merchantName: line.merchantName,
                    orderedOn: line.orderedOn,
                    total: MoneyAmount(minorUnits: line.totalCents, currencyCode: line.currency),
                    status: line.status),
                tagMatch: line.matchField == "tag" ? Self.nonBlank(line.matchedText) : nil
            )
        }
    }

    private func order(
        id: String, merchantName: String?, orderedOn: String, total: MoneyAmount, status: String
    ) throws -> PurchaseSearchOrder {
        guard let day = Self.day(from: orderedOn, in: timeZone()) else {
            throw RepositoryError.contractMismatch
        }
        return PurchaseSearchOrder(
            id: id,
            merchant: Self.nonBlank(merchantName).map(MerchantIdentity.printed) ?? .unattributed,
            orderedOn: day,
            total: total,
            status: PurchaseSettlement(wire: status)
        )
    }
}

private typealias SearchPurchases = Operations.MobilePurchases_searchPurchases
private typealias SearchHit = SearchPurchases.Output.Ok.Body.JsonPayload.HitsPayloadPayload
private typealias PurchaseTags = Operations.MobilePurchases_purchaseTags
