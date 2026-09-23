import Foundation
import Testing

@Suite("Purchase detail state wiring")
internal struct PurchaseDetailStatesWiringTests {
    private static let source: String = {
        let packageRoot = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let path = packageRoot.appending(
            path: "Sources/FeaturePurchases/Detail/PurchaseDetailStates.swift")
        return (try? String(contentsOf: path, encoding: .utf8)) ?? ""
    }()

    @Test("the source scan reads the state views")
    func sourceExists() { #expect(!Self.source.isEmpty) }

    @Test("Retry is offered only through the retryable failure policy")
    func retryPolicy() {
        #expect(Self.source.contains("if PurchaseDetailCopy.isRetryable(failure)"))
        #expect(Self.source.contains("Button(\"Retry\", action: retry)"))
    }

    @Test("the loading shape shimmers without a spinner")
    func skeleton() {
        #expect(Self.source.contains(".popsShimmer()"))
        #expect(!Self.source.contains("ProgressView"))
    }
}
