// swift-tools-version: 6.0
import PackageDescription

// macOS is declared alongside iOS so `swift test` runs the fake-backed and
// fixture suites on a developer machine and on a CI runner without a simulator.
// The app itself is iOS-only; nothing here is shipped for macOS.
let package = Package(
    name: "Auth",
    platforms: [.iOS("26.0"), .macOS(.v15)],
    products: [
        .library(name: "Auth", targets: ["Auth"]),
        .library(name: "AuthTestSupport", targets: ["AuthTestSupport"]),
    ],
    // `AppCore` for the seams this package implements, `BFMClient` for the calls
    // those implementations make.
    //
    // `swift-openapi-runtime` is the one dependency here that is not a sibling
    // path, and it is declared for exactly one type: `ClientMiddleware`, which
    // `AuthenticatingMiddleware` conforms to. A target cannot import a module it
    // does not declare, even transitively, so this cannot be inherited from
    // `BFMClient`.
    //
    // `exact:` at the same version BFMClient pins, for the reason stated there —
    // and the duplication is safe in the one way that matters: SwiftPM refuses
    // to resolve two conflicting `exact:` requirements, so the copies cannot
    // drift silently. They fail the build the moment they disagree.
    dependencies: [
        .package(path: "../AppCore"),
        .package(path: "../BFMClient"),
        .package(url: "https://github.com/apple/swift-openapi-runtime", exact: "1.12.0"),
    ],
    targets: [
        .target(
            name: "Auth",
            dependencies: [
                "AppCore", "BFMClient",
                .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
            ],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .target(
            name: "AuthTestSupport",
            dependencies: ["Auth"],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .testTarget(
            name: "AuthTests",
            dependencies: [
                "Auth", "AuthTestSupport", "AppCore", "BFMClient",
                .product(name: "AppCoreFakes", package: "AppCore"),
                .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
            ],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
    ]
)
