import Foundation
import Testing

@Suite("Purchases flow integration")
internal struct PurchasesFlowIntegrationTests {
    @Test(
        "playground consumers use the public purchases flow",
        arguments: [
            "Purchases/PurchaseCaptureBackdrop.swift",
            "Shell/ShellContentView.swift",
        ])
    func consumersUsePublicFlow(relativePath: String) throws {
        let packageRoot = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let file = packageRoot.appending(
            path: "Sources/DesignPlayground/Surfaces/" + relativePath)
        let source = try String(contentsOf: file, encoding: .utf8)
        #expect(source.contains("PurchasesFlowView("))
        #expect(!source.contains("PurchasesListView("))
    }
}
