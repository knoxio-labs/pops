import AppCore

extension BFMInventoryTransport {
    /// Relays a barcode lookup and reduces every non-answer to unavailable.
    public func lookUp(code: String) async throws -> InventoryBarcodeLookup {
        do {
            let output = try await client.generated.mobileBarcode_lookup(path: .init(code: code))
            switch output {
            case .ok(let ok):
                switch try ok.body.json {
                case .case1(let found):
                    let product = found.product
                    return .found(
                        InventoryBarcodeProduct(
                            title: product.title,
                            subtitle: product.subtitle,
                            contributors: product.contributors.map {
                                InventoryBarcodeContributor(name: $0.name, role: $0.role)
                            },
                            publisher: product.publisher,
                            publishedDate: product.publishedDate,
                            pageCount: product.pageCount,
                            language: product.language,
                            description: product.description,
                            subjects: product.subjects,
                            attributes: product.attributes.additionalProperties
                        ))
                case .case2:
                    return .notFound
                case .case3:
                    return .unavailable
                }
            case .badRequest, .unauthorized, .forbidden, .tooManyRequests, .undocumented:
                return .unavailable
            }
        } catch {
            return .unavailable
        }
    }
}
