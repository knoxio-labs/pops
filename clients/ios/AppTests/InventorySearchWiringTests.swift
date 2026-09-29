import Foundation
import Testing

@Suite("Inventory search wiring")
internal struct InventorySearchWiringTests {
    private static let source: String = {
        let path = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "App/Search/AppSearchTab.swift")
        return (try? String(contentsOf: path, encoding: .utf8)) ?? ""
    }()

    @Test("the scan is reading AppSearchTab's actual source")
    func scanIsWiredUp() {
        #expect(!Self.source.isEmpty, "AppSearchTab.swift is empty or missing")
    }

    @Test("the app-wide search passes its paired code suggestion service to Inventory")
    func passesCodeSuggestions() {
        #expect(Self.source.contains("codeSuggestions: dependencies.codeSuggestions"))
    }
}
