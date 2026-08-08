// swift-tools-version: 6.0
import PackageDescription

// The BFM client's code generator, and nothing else. A manifest of its own so
// that the app never resolves it.
//
// The alternative — declaring swift-openapi-generator alongside the runtime in
// `Packages/BFMClient` — puts a code generator and its four transitive
// dependencies (OpenAPIKit, Yams, swift-argument-parser, swift-algorithms) into
// the dependency graph of a package the app links, so every `swift build` and
// every `xcodebuild -resolvePackageDependencies` fetches them to compile an
// iPhone app that will never run one line of them. Generating is a thing
// somebody does deliberately, not a thing building does.
//
// This package declares no targets. `swift run` resolves an executable from the
// dependency graph, so a placeholder target would be an unbuilt, unlinted Swift
// file existing only to satisfy a requirement SwiftPM does not have.
//
// `exact:` rather than a range, because the generator version IS the committed
// bytes under `Packages/BFMClient/Sources/BFMClient/Generated`. A floating
// constraint means two contributors regenerate to two different files and the
// CI diff gate fails on whichever one pushed second, with nothing in their
// change to explain it. `Package.resolved` is committed next to this for the
// transitive half of the same argument.
let package = Package(
    name: "OpenAPIGeneratorTool",
    dependencies: [
        .package(url: "https://github.com/apple/swift-openapi-generator", exact: "1.13.0")
    ]
)
