import AppCore
import OpenAPIRuntime

extension BFMPurchasesRepository {
    /// Replaces the editable fields and complete line set, returning `nil` when the purchase is
    /// no longer present.
    public func updatePurchase(
        id: Purchase.ID, _ update: PurchaseUpdate
    ) async throws -> PurchaseDetail? {
        let payload = Self.updatePayload(from: update)
        let output: UpdatePurchaseOperation.Output
        do {
            output = try await client.generated.mobilePurchases_updatePurchase(
                .init(path: .init(id: id), body: .json(payload)))
        } catch let error as ClientError {
            if error.response?.status == .ok {
                throw RepositoryError.contractMismatch
            }
            throw BFMRepositoryFailure.failure(error, operation: UpdatePurchaseOperation.id)
        }

        switch output {
        case .ok(let ok): return try detail(from: try ok.body.json)
        case .notFound: return nil
        case .conflict(let conflict):
            throw RepositoryError.conflict(try conflict.body.json.code.rawValue)
        case .badRequest:
            throw RepositoryError.transport("\(UpdatePurchaseOperation.id): invalid request")
        case .unauthorized, .forbidden: throw RepositoryError.unauthorized
        case .tooManyRequests:
            throw RepositoryError.transport("\(UpdatePurchaseOperation.id): rate limited")
        case .badGateway(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code.rawValue, operation: UpdatePurchaseOperation.id)
        case .serviceUnavailable(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code.rawValue, operation: UpdatePurchaseOperation.id)
        case .undocumented(let statusCode, _):
            throw RepositoryError.transport(
                "\(UpdatePurchaseOperation.id): undocumented status \(statusCode)")
        }
    }

    private static func updatePayload(
        from update: PurchaseUpdate
    ) -> UpdatePurchaseOperation.Input.Body.JsonPayload {
        UpdatePurchaseOperation.Input.Body.JsonPayload(
            discountCents: update.discountCents,
            expectedUpdatedAt: update.expectedUpdatedAt,
            lines: update.lines.map {
                .init(
                    id: $0.id, lineTotalCents: $0.lineTotalCents, name: $0.name,
                    quantity: $0.quantity)
            },
            merchantEntityId: update.merchantEntityID,
            merchantEntityName: update.merchantEntityName,
            orderedAt: update.orderedAt.map(ISO8601Instant.string(from:)),
            shippingCents: update.shippingCents,
            subtotalCents: update.subtotalCents,
            surchargeCents: update.surchargeCents,
            taxCents: update.taxCents,
            totalCents: update.totalCents
        )
    }
}

private typealias UpdatePurchaseOperation = Operations.MobilePurchases_updatePurchase
