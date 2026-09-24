import Foundation
import Testing

@Suite("Capture flow destinations")
internal struct PurchaseCaptureDestinationsWiringTests {
    private static let stackOpening = "NavigationStack(path: $flow.path) {"
    private static let registration = "navigationDestination(for: PurchaseCaptureRoute.self)"

    private static let source: String = {
        let packageRoot = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let path = packageRoot.appending(
            path: "Sources/FeaturePurchases/Capture/Flow/PurchaseCapturePresentation.swift")
        return (try? String(contentsOf: path, encoding: .utf8)) ?? ""
    }()

    /// The text of the stack's root-content closure, found by brace matching from its opening.
    private static var stackRootContent: Substring? {
        guard let opening = source.range(of: stackOpening) else { return nil }
        var depth = 1
        var index = opening.upperBound
        while index < source.endIndex {
            switch source[index] {
            case "{": depth += 1
            case "}":
                depth -= 1
                if depth == 0 { return source[opening.upperBound..<index] }
            default: break
            }
            index = source.index(after: index)
        }
        return nil
    }

    @Test("the scan reads the capture presentation source")
    func sourceExists() {
        #expect(Self.source.contains(Self.stackOpening))
    }

    @Test("the route destination is registered inside the stack's root content")
    func destinationIsInsideTheStack() throws {
        let content = try #require(Self.stackRootContent)
        #expect(content.contains(Self.registration))
    }
}
