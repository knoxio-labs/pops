import Foundation
import Testing

@Suite("iOS scroll bounce axes")
internal struct InventoryScrollBounceTests {
    private static let iosRoot: URL = {
        URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }()

    private static let sourceFiles: [URL] = {
        guard
            let enumerator = FileManager.default.enumerator(
                at: iosRoot, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles])
        else { return [] }

        return enumerator.compactMap { $0 as? URL }.filter { url in
            guard url.pathExtension == "swift" else { return false }
            return url.pathComponents.contains("Sources") || url.pathComponents.contains("App")
                || url.pathComponents.contains("Playground")
        }
    }()

    private static let intendedHorizontalBounce = [
        "Packages/FeatureSearch/Sources/FeatureSearch/SearchScopeBar.swift",
        "Packages/DesignPlayground/Sources/DesignPlayground/Surfaces/Search/SearchScopeBar.swift",
    ]

    @Test("the source scan is reading the iOS packages")
    func sourceScanIsWiredUp() {
        #expect(!Self.sourceFiles.isEmpty, "the iOS package sources are missing")
    }

    @Test("every bounce behavior names its axis, and horizontal is limited to scope bars")
    func horizontalBounceIsLimitedToScopeBars() throws {
        let offenders = try Self.sourceFiles.compactMap { file -> String? in
            let source = try String(contentsOf: file, encoding: .utf8)
            return
                source
                .split(separator: "\n", omittingEmptySubsequences: false)
                .filter { line in
                    let trimmed = line.trimmingCharacters(in: .whitespaces)
                    return trimmed.contains(".scrollBounceBehavior(")
                        && !trimmed.hasPrefix("//")
                        && (!trimmed.contains("axes:")
                            || (trimmed.contains("axes: .horizontal")
                                && !Self.intendedHorizontalBounce.contains(where: {
                                    file.path.hasSuffix($0)
                                })))
                }
                .isEmpty ? nil : file.path
        }

        #expect(
            offenders.isEmpty,
            "unexpected horizontal bounce in: \(offenders.joined(separator: ", "))")
    }
}
