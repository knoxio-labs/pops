import Foundation
import Testing

@Suite("Public Purchases destinations")
internal struct PurchasesDestinationsWiringTests {
    private static let source: String = {
        let packageRoot = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let path = packageRoot.appending(
            path: "Sources/FeaturePurchases/PurchasesRoute.swift")
        return (try? String(contentsOf: path, encoding: .utf8)) ?? ""
    }()

    @Test("the scan reads the public route source")
    func sourceExists() {
        #expect(!Self.source.isEmpty)
    }

    @Test("the public modifier registers the public route type")
    func publicRouteIsRegistered() {
        #expect(Self.source.contains("navigationDestination(for: PurchasesRoute.self)"))
        #expect(Self.source.contains("PurchaseDetailScreen(id: id, dependencies: dependencies)"))
    }
}
