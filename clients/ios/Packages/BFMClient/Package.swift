// swift-tools-version: 6.0
import PackageDescription

// The only external SPM dependencies the app links, and they are Apple's. The
// generator that produces `Sources/BFMClient/Generated` is deliberately NOT one
// of them — it lives in `Tools/OpenAPIGenerator`, which nothing here resolves.
//
// `exact:` rather than `from:` on both. The Xcode project is generated and
// gitignored, so its `Package.resolved` is not committed and cannot be the
// thing that pins these — a range would let two machines link two different
// runtimes against one committed generated client. The version range is stated
// where a reader looking at the dependency will find it.
let package = Package(
    name: "BFMClient",
    platforms: [.iOS("26.0")],
    products: [.library(name: "BFMClient", targets: ["BFMClient"])],
    dependencies: [
        .package(url: "https://github.com/apple/swift-openapi-runtime", exact: "1.12.0"),
        .package(url: "https://github.com/apple/swift-openapi-urlsession", exact: "1.3.1"),
    ],
    targets: [
        .target(
            name: "BFMClient",
            dependencies: [
                .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
                .product(name: "OpenAPIURLSession", package: "swift-openapi-urlsession"),
            ],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .testTarget(
            name: "BFMClientTests",
            dependencies: [
                "BFMClient",
                .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
            ],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
    ]
)
