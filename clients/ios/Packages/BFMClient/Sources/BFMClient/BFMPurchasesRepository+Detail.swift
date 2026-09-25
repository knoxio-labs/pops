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
        try detail(
            from: DetailValues(
                id: wire.id,
                merchant: Self.detailMerchant(from: wire.merchant, printed: wire.merchantName),
                orderedOn: wire.orderedOn,
                totalCents: wire.totalCents,
                currency: wire.currency,
                itemCount: wire.itemCount,
                receiptURI: wire.receiptUri,
                status: wire.status,
                subtotalCents: wire.subtotalCents,
                taxCents: wire.taxCents,
                shippingCents: wire.shippingCents,
                discountCents: wire.discountCents,
                surchargeCents: wire.surchargeCents,
                source: wire.source,
                lines: wire.items.map {
                    DetailLineValues(
                        id: $0.id, name: $0.name, quantity: $0.quantity,
                        lineTotalCents: $0.lineTotalCents,
                        hasInventoryLink: $0.hasInventoryLink ?? false)
                },
                receiptURIs: wire.receiptUris,
                edit: try Self.edit(from: wire.edit),
                updatedAt: wire.updatedAt,
                accounting: Self.accounting(from: wire.accounting, currency: wire.currency),
                charges: try charges(from: wire.charges)))
    }

    func detail(from wire: UpdatePurchaseWire) throws -> PurchaseDetail {
        try detail(
            from: DetailValues(
                id: wire.id,
                merchant: Self.detailMerchant(from: wire.merchant, printed: wire.merchantName),
                orderedOn: wire.orderedOn,
                totalCents: wire.totalCents,
                currency: wire.currency,
                itemCount: wire.itemCount,
                receiptURI: wire.receiptUri,
                status: wire.status,
                subtotalCents: wire.subtotalCents,
                taxCents: wire.taxCents,
                shippingCents: wire.shippingCents,
                discountCents: wire.discountCents,
                surchargeCents: wire.surchargeCents,
                source: wire.source,
                lines: wire.items.map {
                    DetailLineValues(
                        id: $0.id, name: $0.name, quantity: $0.quantity,
                        lineTotalCents: $0.lineTotalCents,
                        hasInventoryLink: $0.hasInventoryLink ?? false)
                },
                receiptURIs: wire.receiptUris,
                edit: try Self.edit(from: wire.edit),
                updatedAt: wire.updatedAt,
                accounting: Self.accounting(from: wire.accounting, currency: wire.currency),
                charges: try charges(from: wire.charges)))
    }

    private func detail(from wire: DetailValues) throws -> PurchaseDetail {
        guard let orderedOn = Self.day(from: wire.orderedOn, in: timeZone()) else {
            throw RepositoryError.contractMismatch
        }
        let purchase = Purchase(
            id: wire.id,
            merchant: wire.merchant,
            orderedOn: orderedOn,
            total: MoneyAmount(minorUnits: wire.totalCents, currencyCode: wire.currency),
            itemCount: wire.itemCount,
            receiptURI: wire.receiptURI,
            status: PurchaseSettlement(wire: wire.status)
        )
        return PurchaseDetail(
            purchase: purchase,
            subtotal: MoneyAmount(
                minorUnits: wire.subtotalCents, currencyCode: wire.currency),
            tax: MoneyAmount(minorUnits: wire.taxCents, currencyCode: wire.currency),
            shipping: MoneyAmount(
                minorUnits: wire.shippingCents, currencyCode: wire.currency),
            discount: MoneyAmount(
                minorUnits: wire.discountCents, currencyCode: wire.currency),
            surcharge: MoneyAmount(
                minorUnits: wire.surchargeCents, currencyCode: wire.currency),
            source: wire.source,
            lines: wire.lines.map {
                PurchaseDetailLine(
                    id: $0.id,
                    name: $0.name,
                    quantity: $0.quantity,
                    lineTotal: MoneyAmount(
                        minorUnits: $0.lineTotalCents, currencyCode: wire.currency),
                    hasInventoryLink: $0.hasInventoryLink)
            },
            receiptURIs: wire.receiptURIs,
            edit: wire.edit,
            updatedAt: wire.updatedAt,
            accounting: wire.accounting,
            charges: wire.charges
        )
    }

    private static func edit(from wire: GetPurchaseWire.EditPayload?) throws -> PurchaseEdit? {
        guard let wire else { return nil }
        return try edit(
            editedAt: wire.editedAt,
            changes: wire.changes.map {
                PurchaseFieldChange(
                    field: PurchaseEditField(wire: $0.field), itemID: $0.itemId,
                    original: $0.original, current: $0.current)
            })
    }

    private static func edit(from wire: UpdatePurchaseWire.EditPayload?) throws -> PurchaseEdit? {
        guard let wire else { return nil }
        return try edit(
            editedAt: wire.editedAt,
            changes: wire.changes.map {
                PurchaseFieldChange(
                    field: PurchaseEditField(wire: $0.field), itemID: $0.itemId,
                    original: $0.original, current: $0.current)
            })
    }

    private static func edit(
        editedAt: String, changes: [PurchaseFieldChange]
    ) throws -> PurchaseEdit {
        guard let date = ISO8601Instant.parse(editedAt) else {
            throw RepositoryError.contractMismatch
        }
        return PurchaseEdit(editedAt: date, changes: changes)
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

    private static func detailMerchant(
        from wire: UpdatePurchaseWire.MerchantPayload, printed: String?
    ) -> MerchantIdentity {
        switch wire {
        case .case1(let entity):
            return entityMerchant(id: entity.entityId, name: entity.name, printed: printed)
        case .case2(let named): return .printed(named.name)
        case .case3: return .unattributed
        }
    }
}

private struct DetailValues {
    let id: String
    let merchant: MerchantIdentity
    let orderedOn: String
    let totalCents: Int
    let currency: String
    let itemCount: Int
    let receiptURI: String?
    let status: String
    let subtotalCents: Int
    let taxCents: Int
    let shippingCents: Int
    let discountCents: Int
    let surchargeCents: Int
    let source: String
    let lines: [DetailLineValues]
    let receiptURIs: [String]
    let edit: PurchaseEdit?
    let updatedAt: String?
    let accounting: PurchaseAccounting?
    let charges: [PurchaseCharge]
}

private struct DetailLineValues {
    let id: String
    let name: String
    let quantity: Int
    let lineTotalCents: Int
    let hasInventoryLink: Bool
}

private typealias GetPurchase = Operations.MobilePurchases_getPurchase
private typealias GetPurchaseWire = GetPurchase.Output.Ok.Body.JsonPayload
internal typealias UpdatePurchaseWire =
    Operations.MobilePurchases_updatePurchase.Output.Ok.Body.JsonPayload
