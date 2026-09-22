import AppCore
import OpenAPIRuntime

extension BFMPurchasesRepository {
    /// Reads the complete purchase record, returning `nil` for a missing purchase.
    public func purchaseDetail(id: Purchase.ID) async throws -> PurchaseDetail? {
        let output: GetPurchase.Output
        do {
            output = try await client.generated.mobilePurchases_getPurchase(path: .init(id: id))
        } catch let error as ClientError {
            throw BFMRepositoryFailure.failure(error, operation: GetPurchase.id)
        }

        switch output {
        case .ok(let ok): return try detail(from: try ok.body.json)
        case .notFound: return nil
        case .badRequest:
            throw RepositoryError.transport("\(GetPurchase.id): invalid request")
        case .unauthorized, .forbidden: throw RepositoryError.unauthorized
        case .tooManyRequests:
            throw RepositoryError.transport("\(GetPurchase.id): rate limited")
        case .badGateway(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code.rawValue, operation: GetPurchase.id)
        case .serviceUnavailable(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code.rawValue, operation: GetPurchase.id)
        case .undocumented(let statusCode, _):
            throw RepositoryError.transport(
                "\(GetPurchase.id): undocumented status \(statusCode)")
        }
    }

    private func detail(from wire: GetPurchaseWire) throws -> PurchaseDetail {
        guard let orderedOn = Self.day(from: wire.orderedOn, in: timeZone()) else {
            throw RepositoryError.contractMismatch
        }
        let currency = wire.currency
        let purchase = Purchase(
            id: wire.id,
            merchant: Self.detailMerchant(from: wire.merchant, printed: wire.merchantName),
            orderedOn: orderedOn,
            total: MoneyAmount(minorUnits: wire.totalCents, currencyCode: currency),
            itemCount: wire.itemCount,
            receiptURI: wire.receiptUri,
            status: PurchaseSettlement(wire: wire.status)
        )
        return PurchaseDetail(
            purchase: purchase,
            subtotal: MoneyAmount(minorUnits: wire.subtotalCents, currencyCode: currency),
            tax: MoneyAmount(minorUnits: wire.taxCents, currencyCode: currency),
            shipping: MoneyAmount(minorUnits: wire.shippingCents, currencyCode: currency),
            discount: MoneyAmount(minorUnits: wire.discountCents, currencyCode: currency),
            surcharge: MoneyAmount(minorUnits: wire.surchargeCents, currencyCode: currency),
            source: wire.source,
            lines: wire.items.map {
                PurchaseDetailLine(
                    id: $0.id,
                    name: $0.name,
                    quantity: $0.quantity,
                    lineTotal: MoneyAmount(
                        minorUnits: $0.lineTotalCents, currencyCode: currency))
            },
            receiptURIs: wire.receiptUris
        )
    }

    private static func detailMerchant(
        from wire: GetPurchaseWire.MerchantPayload, printed: String?
    ) -> MerchantIdentity {
        switch wire {
        case .case1(let entity):
            return entityMerchant(id: entity.entityId, name: entity.name, printed: printed)
        case .case2(let named): return .printed(named.name)
        case .case3: return .unattributed
        }
    }
}

private typealias GetPurchase = Operations.MobilePurchases_getPurchase
private typealias GetPurchaseWire = GetPurchase.Output.Ok.Body.JsonPayload
