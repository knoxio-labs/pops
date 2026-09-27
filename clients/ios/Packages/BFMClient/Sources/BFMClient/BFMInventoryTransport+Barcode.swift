import AppCore
import Foundation
import OpenAPIRuntime

extension BFMInventoryTransport {
    /// Relays product facts or a definite miss; failures preserve safe diagnostics for presentation.
    public func lookUp(code: String) async throws -> InventoryBarcodeLookup {
        do {
            let output = try await client.generated.mobileBarcode_lookup(
                path: .init(code: code), headers: .init(xPopsBarcodeDiagnostics: ._1))
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
                case .case2(let missing):
                    return missing.reason?.rawValue == "unsupported" ? .unsupported : .notFound
                case .case3(let unavailable):
                    throw BFMBarcodeFailure.provider(unavailable.error?.value1)
                }
            case .badRequest: throw BFMBarcodeFailure.http(400)
            case .unauthorized: throw BFMBarcodeFailure.http(401)
            case .forbidden: throw BFMBarcodeFailure.http(403)
            case .tooManyRequests: throw BFMBarcodeFailure.http(429)
            case .undocumented(let status, _): throw BFMBarcodeFailure.http(status)
            }
        } catch let error as ClientError {
            if Task.isCancelled || error.underlyingError is CancellationError {
                throw CancellationError()
            }
            throw BFMBarcodeFailure.from(error)
        }
    }
}
