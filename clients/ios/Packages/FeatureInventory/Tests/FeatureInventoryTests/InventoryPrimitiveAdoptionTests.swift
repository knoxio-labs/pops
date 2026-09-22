import Foundation
import Testing

@Suite("Inventory shared primitive adoption")
internal struct InventoryPrimitiveAdoptionTests {
    private static let sourceFiles: [URL] = {
        let root = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "Sources/FeatureInventory")
        guard
            let enumerator = FileManager.default.enumerator(
                at: root, includingPropertiesForKeys: nil)
        else { return [] }
        return enumerator.compactMap { entry in
            guard let url = entry as? URL, url.pathExtension == "swift" else { return nil }
            return url
        }
    }()

    private static let deletedNames = [
        "InventoryLocationSectionHeader",
        "InventoryLocationPanel",
        "InventoryCentredLine",
        "InventoryLocationEmptyLine",
        "InventoryItemDetailNotice",
        "InventoryMotion",
        "inventoryMotion",
        "InventoryLocationListSkeleton",
        "InventoryPageTitle",
        "inventoryCollapsingTitle",
    ]

    private static func containsDeclaration(named name: String, in source: String) throws -> Bool {
        let escaped = NSRegularExpression.escapedPattern(for: name)
        let pattern =
            "\\b(?:struct|enum|class|actor|protocol|typealias)\\s+\(escaped)\\b"
            + "|\\bfunc\\s+\(escaped)\\b"
            + "|\\b(?:let|var)\\s+\(escaped)\\b"
        let expression = try NSRegularExpression(pattern: pattern)
        let range = NSRange(source.startIndex..., in: source)
        return expression.firstMatch(in: source, range: range) != nil
    }

    @Test("the source scan reads the inventory package")
    func sourceScanIsWiredUp() {
        #expect(!Self.sourceFiles.isEmpty, "FeatureInventory sources are empty or missing")
    }

    @Test("the declaration scan catches a reintroduced local primitive")
    func declarationScanCatchesReintroduction() throws {
        let fixture = "private struct InventoryLocationPanel: View {}"

        #expect(try Self.containsDeclaration(named: "InventoryLocationPanel", in: fixture))
        #expect(!(try Self.containsDeclaration(named: "InventoryPageTitle", in: fixture)))
    }

    @Test("deleted local primitives are not declared again", arguments: deletedNames)
    func deletedPrimitiveIsAbsent(name: String) throws {
        let declarations = Self.sourceFiles.filter { file in
            guard let source = try? String(contentsOf: file, encoding: .utf8) else { return false }
            return (try? Self.containsDeclaration(named: name, in: source)) == true
        }

        #expect(
            declarations.isEmpty,
            "\(name) is still declared in \(declarations.map(\.lastPathComponent).joined(separator: ", "))"
        )
    }
}
